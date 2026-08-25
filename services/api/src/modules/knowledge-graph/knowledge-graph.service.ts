import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConceptEntity } from '../../entities/concept.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { KnowledgeEdgeEntity } from '../../entities/knowledge-edge.entity';
import { MasteryService } from '../scoring/mastery.service';

@Injectable()
export class KnowledgeGraphService {
  constructor(
    @InjectRepository(ConceptEntity)
    private readonly conceptRepo: Repository<ConceptEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(KnowledgeEdgeEntity)
    private readonly edgeRepo: Repository<KnowledgeEdgeEntity>,
    private readonly mastery: MasteryService,
  ) {}

  async getUserGraph(userId: string) {
    const nodes = await this.nodeRepo.find({
      where: { userId },
      relations: ['concept'],
    });
    const conceptIds = nodes.map((n) => n.conceptId);
    const edges =
      conceptIds.length > 0
        ? await this.edgeRepo
            .createQueryBuilder('edge')
            .where(
              'edge.parentConceptId IN (:...ids) OR edge.childConceptId IN (:...ids)',
              { ids: conceptIds },
            )
            .getMany()
        : [];

    return { nodes, edges };
  }

  async getConcepts() {
    return this.conceptRepo.find({ relations: ['childConcepts'] });
  }

  /**
   * Record that the learner engaged with a concept.
   *
   * This replaces the old `updateNode`, which assigned mastery/confidence
   * straight from the HTTP body. That let any authenticated caller set their own
   * mastery to 100 and appear as a verified expert to recruiters. Mastery is now
   * only ever derived from graded evidence inside MasteryService, so the worst a
   * client can do here is claim they looked at something.
   */
  async recordInteraction(userId: string, conceptId: string) {
    const concept = await this.conceptRepo.findOne({ where: { id: conceptId } });
    if (!concept) throw new NotFoundException('Concept not found');

    return this.mastery.recordEvidence({
      userId,
      conceptId,
      kind: 'exposure',
    });
  }

  async createConcept(data: { name: string; description?: string; parentConceptId?: string; curriculumId?: string }) {
    const concept = this.conceptRepo.create(data);
    return this.conceptRepo.save(concept);
  }

  async createEdge(data: { parentConceptId: string; childConceptId: string; relationshipType?: string }) {
    const edge = this.edgeRepo.create({
      ...data,
      relationshipType: data.relationshipType || 'prerequisite',
    });
    return this.edgeRepo.save(edge);
  }

  async getWeakConcepts(userId: string, limit = 10) {
    return this.nodeRepo.find({
      where: { userId },
      relations: ['concept'],
      order: { weaknessScore: 'DESC' },
      take: limit,
    });
  }

  async getStrongConcepts(userId: string, limit = 10) {
    return this.nodeRepo.find({
      where: { userId },
      relations: ['concept'],
      order: { mastery: 'DESC' },
      take: limit,
    });
  }

  /**
   * Find a concept by name or create it if it doesn't exist.
   * Used by the ingestion/context pipeline.
   */
  async findOrCreateConcept(name: string): Promise<ConceptEntity> {
    const existing = await this.conceptRepo.findOne({ where: { name } });
    if (existing) return existing;

    return this.conceptRepo.save(
      this.conceptRepo.create({ name }),
    );
  }

  /**
   * The ingestion pipeline saw the learner near this concept.
   *
   * Exposure is the weakest evidence there is, so it goes through the same
   * model as everything else at a very low weight. It used to seed a node at
   * mastery 5 / confidence 10 and then nudge confidence upward on every sighting,
   * which meant leaving a docs tab open slowly manufactured confidence the
   * learner had not earned.
   */
  async touchNode(userId: string, conceptId: string) {
    return this.mastery.recordEvidence({
      userId,
      conceptId,
      kind: 'exposure',
      isReview: false,
    });
  }

  /**
   * Ensure an edge exists between two concepts. Create if missing.
   */
  async ensureEdge(parentConceptId: string, childConceptId: string, relationshipType: string) {
    const existing = await this.edgeRepo.findOne({
      where: { parentConceptId, childConceptId },
    });
    if (existing) return existing;

    return this.edgeRepo.save(
      this.edgeRepo.create({
        parentConceptId,
        childConceptId,
        relationshipType: relationshipType || 'related',
        strength: 50,
      }),
    );
  }
}
