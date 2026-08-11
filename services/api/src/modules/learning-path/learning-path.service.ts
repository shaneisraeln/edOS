import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningPathEntity, PathNodeEntity } from '../../entities/learning-path.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { KnowledgeEdgeEntity } from '../../entities/knowledge-edge.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { LearningGoalEntity } from '../../entities/learning-goal.entity';
import { AIService } from '../ai/ai.service';

@Injectable()
export class LearningPathService {
  constructor(
    @InjectRepository(LearningPathEntity)
    private readonly pathRepo: Repository<LearningPathEntity>,
    @InjectRepository(PathNodeEntity)
    private readonly nodeRepo: Repository<PathNodeEntity>,
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly knowledgeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(KnowledgeEdgeEntity)
    private readonly edgeRepo: Repository<KnowledgeEdgeEntity>,
    @InjectRepository(ConceptEntity)
    private readonly conceptRepo: Repository<ConceptEntity>,
    @InjectRepository(LearningGoalEntity)
    private readonly goalRepo: Repository<LearningGoalEntity>,
    private readonly aiService: AIService,
  ) {}

  /** Use AI to generate a structured learning path AND register it as a full curriculum */
  async generatePath(userId: string, topic: string, description?: string) {
    const result = await this.aiService.getProvider().complete({
      systemPrompt: `You are a curriculum designer. Generate a structured learning path for the given topic. The path should be ordered from foundational concepts to advanced, with 8-15 steps. Also generate subtopics for each step.

Return ONLY valid JSON:
{
  "title": "path title",
  "description": "brief description",
  "curriculumId": "short-kebab-id (e.g. deep-learning, system-design)",
  "steps": [
    { "title": "step title", "description": "what to learn in 1 sentence", "subtopics": ["subtopic1", "subtopic2"] }
  ]
}

Rules:
- Start with prerequisites/foundations
- Each step should build on the previous
- Be specific (not "Learn basics" but "Understand what ML is and its 3 main types")
- 8-15 steps for a comprehensive path
- Each step should have 2-4 subtopics
- curriculumId should be a unique lowercase kebab-case identifier`,
      messages: [
        { role: 'user', content: `Generate a learning path for: ${topic}${description ? `\nContext: ${description}` : ''}` },
      ],
      temperature: 0.7,
      responseFormat: 'json',
    });

    let parsed: any;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      parsed = { title: topic, description: '', curriculumId: topic.toLowerCase().replace(/\s+/g, '-'), steps: [{ title: topic, description: 'Learn this topic', subtopics: [] }] };
    }

    const curriculumId = parsed.curriculumId || topic.toLowerCase().replace(/\s+/g, '-');

    // --- Create full curriculum (same as pre-seeded ones) ---

    // Create root concept for this curriculum
    let rootConcept = await this.conceptRepo.findOne({ where: { name: parsed.title || topic, curriculumId } });
    if (!rootConcept) {
      rootConcept = await this.conceptRepo.save(
        this.conceptRepo.create({
          name: parsed.title || topic,
          description: parsed.description || description,
          curriculumId,
        }),
      );
    }

    // Create step concepts as children of root + edges
    const steps = parsed.steps || [];
    const stepConcepts: ConceptEntity[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      let concept = await this.conceptRepo.findOne({ where: { name: step.title, curriculumId } });
      if (!concept) {
        concept = await this.conceptRepo.save(
          this.conceptRepo.create({
            name: step.title,
            description: step.description,
            curriculumId,
            parentConceptId: rootConcept.id,
          }),
        );

        // Edge: root -> step (part_of)
        await this.edgeRepo.save(
          this.edgeRepo.create({ parentConceptId: rootConcept.id, childConceptId: concept.id, relationshipType: 'part_of', strength: 80 }),
        );
      }
      stepConcepts.push(concept);

      // Create subtopic concepts
      for (const sub of step.subtopics || []) {
        let subConcept = await this.conceptRepo.findOne({ where: { name: sub, curriculumId } });
        if (!subConcept) {
          subConcept = await this.conceptRepo.save(
            this.conceptRepo.create({ name: sub, curriculumId, parentConceptId: concept.id }),
          );
          await this.edgeRepo.save(
            this.edgeRepo.create({ parentConceptId: concept.id, childConceptId: subConcept.id, relationshipType: 'part_of', strength: 70 }),
          );
        }
      }

      // Edge: previous step -> this step (prerequisite)
      if (i > 0) {
        await this.edgeRepo.save(
          this.edgeRepo.create({ parentConceptId: stepConcepts[i - 1].id, childConceptId: concept.id, relationshipType: 'prerequisite', strength: 90 }),
        );
      }
    }

    // --- Create learning goal for this user ---
    const existingGoal = await this.goalRepo.findOne({ where: { userId, curriculumId } });
    if (!existingGoal) {
      await this.goalRepo.save(
        this.goalRepo.create({ userId, curriculumId, curriculumName: parsed.title || topic, skillLevel: 'beginner', status: 'active' }),
      );
    }

    // --- Create the learning path with nodes ---
    const path = await this.pathRepo.save(
      this.pathRepo.create({
        userId,
        title: parsed.title || topic,
        description: parsed.description || description,
        status: 'active',
        progress: 0,
      }),
    );

    for (let i = 0; i < steps.length; i++) {
      await this.nodeRepo.save(
        this.nodeRepo.create({
          pathId: path.id,
          title: steps[i].title,
          description: steps[i].description,
          order: i,
          status: i === 0 ? 'available' : 'locked',
          conceptId: stepConcepts[i].id,
        }),
      );
    }

    return this.getPath(userId, path.id);
  }

  /** Create a custom path from user-provided steps */
  async createCustomPath(userId: string, title: string, steps: string[]) {
    const path = await this.pathRepo.save(
      this.pathRepo.create({ userId, title, status: 'active', progress: 0 }),
    );

    for (let i = 0; i < steps.length; i++) {
      let concept = await this.conceptRepo.findOne({ where: { name: steps[i] } });
      if (!concept) {
        concept = await this.conceptRepo.save(this.conceptRepo.create({ name: steps[i] }));
      }

      await this.nodeRepo.save(
        this.nodeRepo.create({
          pathId: path.id,
          title: steps[i],
          order: i,
          status: i === 0 ? 'available' : 'locked',
          conceptId: concept.id,
        }),
      );
    }

    return this.getPath(userId, path.id);
  }

  async getUserPaths(userId: string) {
    return this.pathRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getPath(userId: string, pathId: string) {
    const path = await this.pathRepo.findOne({ where: { id: pathId, userId } });
    if (!path) throw new NotFoundException('Path not found');

    const nodes = await this.nodeRepo.find({
      where: { pathId },
      order: { order: 'ASC' },
    });

    const verified = nodes.filter((n) => n.status === 'verified').length;
    path.progress = nodes.length > 0 ? Math.round((verified / nodes.length) * 100) : 0;
    await this.pathRepo.save(path);

    return { ...path, nodes };
  }

  /** Generate a quiz to verify a specific node */
  async verifyNode(userId: string, pathId: string, nodeId: string) {
    const node = await this.nodeRepo.findOne({ where: { id: nodeId, pathId } });
    if (!node) throw new NotFoundException('Node not found');
    if (node.status === 'locked') {
      return { error: 'Complete previous steps first' };
    }

    // Generate quiz for this topic
    const questions = await this.aiService.generateAssessment({
      topic: node.title,
      subtopic: node.description,
      difficulty: 'intermediate',
      type: 'mixed',
      questionCount: 3,
    });

    const assessment = await this.assessmentRepo.save(
      this.assessmentRepo.create({
        userId,
        topic: node.title,
        difficulty: 'intermediate',
        type: 'path_verification',
        questions,
        maxScore: questions.length * 20,
        status: 'pending',
      }),
    );

    // Mark node as in_progress
    node.status = 'in_progress';
    await this.nodeRepo.save(node);

    return { quizId: assessment.id, topic: node.title, questions };
  }

  /** Score the verification quiz and update path progress */
  async submitVerification(
    userId: string,
    pathId: string,
    nodeId: string,
    quizId: string,
    answers: { questionId: string; answer: string }[],
  ) {
    const node = await this.nodeRepo.findOne({ where: { id: nodeId, pathId } });
    if (!node) throw new NotFoundException('Node not found');

    const assessment = await this.assessmentRepo.findOne({ where: { id: quizId, userId } });
    if (!assessment) throw new NotFoundException('Quiz not found');

    // Score with AI
    const scoring = await this.aiService.scoreAssessment({
      questions: assessment.questions,
      answers,
      topic: node.title,
    });

    assessment.score = scoring.totalScore;
    assessment.status = 'completed';
    assessment.completedAt = new Date();
    assessment.feedback = scoring.feedback;
    await this.assessmentRepo.save(assessment);

    const percentage = assessment.maxScore > 0 ? (scoring.totalScore / assessment.maxScore) * 100 : 0;

    // Need 60% to pass
    if (percentage >= 60) {
      node.status = 'verified';
      node.score = percentage;
      node.verifiedAt = new Date();
      await this.nodeRepo.save(node);

      // Unlock next node
      const nextNode = await this.nodeRepo.findOne({
        where: { pathId, order: node.order + 1 },
      });
      if (nextNode && nextNode.status === 'locked') {
        nextNode.status = 'available';
        await this.nodeRepo.save(nextNode);
      }

      // Update knowledge graph
      if (node.conceptId) {
        let kNode = await this.knowledgeRepo.findOne({ where: { userId, conceptId: node.conceptId } });
        if (!kNode) {
          kNode = this.knowledgeRepo.create({
            userId, conceptId: node.conceptId,
            confidence: percentage, mastery: percentage,
            weaknessScore: Math.max(0, 100 - percentage),
            practiceCount: 1, lastRevision: new Date(), revisionCount: 1,
          });
        } else {
          kNode.mastery = Math.round(kNode.mastery * 0.3 + percentage * 0.7);
          kNode.confidence = Math.round(kNode.confidence * 0.3 + percentage * 0.7);
          kNode.weaknessScore = Math.max(0, 100 - kNode.mastery);
          kNode.practiceCount += 1;
          kNode.lastRevision = new Date();
        }
        await this.knowledgeRepo.save(kNode);
      }

      // Check if path is complete
      const allNodes = await this.nodeRepo.find({ where: { pathId } });
      const allVerified = allNodes.every((n) => n.status === 'verified');
      if (allVerified) {
        const path = await this.pathRepo.findOne({ where: { id: pathId } });
        if (path) { path.status = 'completed'; path.progress = 100; await this.pathRepo.save(path); }
      }
    } else {
      // Failed — stay available for retry
      node.status = 'available';
      await this.nodeRepo.save(node);
    }

    return {
      passed: percentage >= 60,
      score: scoring.totalScore,
      maxScore: assessment.maxScore,
      percentage: Math.round(percentage),
      feedback: scoring.feedback,
      nodeStatus: node.status,
    };
  }

  /** Mark a node as self-learned (detected by desktop agent) */
  async markSelfLearned(userId: string, pathId: string, nodeId: string) {
    const node = await this.nodeRepo.findOne({ where: { id: nodeId, pathId } });
    if (!node) throw new NotFoundException('Node not found');

    node.selfLearned = true;
    if (node.status === 'locked') node.status = 'available';
    await this.nodeRepo.save(node);

    return { ok: true, message: 'Marked as self-learned. Verify to unlock next step.' };
  }
}
