import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConceptEntity } from '../../entities/concept.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { KnowledgeEdgeEntity } from '../../entities/knowledge-edge.entity';

@Injectable()
export class KnowledgeGraphService {
  constructor(
    @InjectRepository(ConceptEntity)
    private readonly conceptRepo: Repository<ConceptEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(KnowledgeEdgeEntity)
    private readonly edgeRepo: Repository<KnowledgeEdgeEntity>,
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

  async updateNode(
    userId: string,
    conceptId: string,
    updates: Partial<{
      confidence: number;
      mastery: number;
      assessmentScore: number;
      weaknessScore: number;
      practiceCount: number;
    }>,
  ) {
    let node = await this.nodeRepo.findOne({ where: { userId, conceptId } });

    if (!node) {
      // Create the node if it doesn't exist yet
      node = this.nodeRepo.create({
        userId,
        conceptId,
        ...updates,
      });
    } else {
      Object.assign(node, updates);
    }

    if (updates.practiceCount !== undefined) {
      node.lastRevision = new Date();
      node.revisionCount += 1;
    }

    return this.nodeRepo.save(node);
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
   * Touch a knowledge node — create it if it doesn't exist, or increment practice count.
   * Called when the system detects a user has interacted with a concept.
   */
  async touchNode(userId: string, conceptId: string) {
    let node = await this.nodeRepo.findOne({ where: { userId, conceptId } });

    if (!node) {
      node = this.nodeRepo.create({
        userId,
        conceptId,
        confidence: 10,
        mastery: 5,
        weaknessScore: 80,
        practiceCount: 1,
        lastRevision: new Date(),
        revisionCount: 1,
      });
    } else {
      node.practiceCount += 1;
      node.lastRevision = new Date();
      // Slight confidence boost from exposure (capped)
      node.confidence = Math.min(100, node.confidence + 2);
    }

    return this.nodeRepo.save(node);
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
