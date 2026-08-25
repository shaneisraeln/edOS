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
import { AnswerGraderService, stripAnswerKey } from '../scoring/answer-grader.service';
import { MasteryService } from '../scoring/mastery.service';
import { PASS_RATIO } from '../scoring/scoring.constants';
import { StoredQuestion } from '../scoring/scoring.types';

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
    private readonly grader: AnswerGraderService,
    private readonly mastery: MasteryService,
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

    return {
      quizId: assessment.id,
      topic: node.title,
      questions: stripAnswerKey(questions as Record<string, unknown>[]),
    };
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

    const storedQuestions = (assessment.questions || []) as StoredQuestion[];

    const result = await this.grader.grade({
      questions: storedQuestions,
      answers,
      topic: node.title,
    });

    assessment.score = result.totalScore;
    assessment.maxScore = result.gradableMaxScore || result.declaredMaxScore;
    assessment.status = 'completed';
    assessment.completedAt = new Date();
    assessment.feedback = result.feedback;

    const gradeById = new Map(result.questions.map((q) => [q.questionId, q]));
    assessment.questions = storedQuestions.map((q) => {
      const grade = gradeById.get(q.id);
      return grade ? { ...q, score: grade.score, feedback: grade.feedback, correct: grade.correct } : q;
    });
    await this.assessmentRepo.save(assessment);

    // A grading outage must not silently fail the learner's step.
    if (result.percentage === null) {
      node.status = 'available';
      await this.nodeRepo.save(node);
      return {
        passed: false,
        score: result.totalScore,
        maxScore: assessment.maxScore,
        percentage: null,
        feedback: result.feedback,
        nodeStatus: node.status,
        degraded: true,
      };
    }

    const percentage = result.percentage;
    const passed = percentage >= PASS_RATIO * 100;

    // Record the attempt either way. Previously a failed verification wrote
    // nothing at all, so struggling with a step left no trace in the graph and
    // the concept never showed up as weak.
    if (node.conceptId) {
      await this.mastery.recordEvidence({
        userId,
        conceptId: node.conceptId,
        kind: 'path_verification',
        scoreFraction: percentage / 100,
        difficulty: assessment.difficulty,
        isReview: true,
      });
    }

    if (passed) {
      node.status = 'verified';
      node.score = percentage;
      node.verifiedAt = new Date();
      await this.nodeRepo.save(node);

      const nextNode = await this.nodeRepo.findOne({
        where: { pathId, order: node.order + 1 },
      });
      if (nextNode && nextNode.status === 'locked') {
        nextNode.status = 'available';
        await this.nodeRepo.save(nextNode);
      }

      const allNodes = await this.nodeRepo.find({ where: { pathId } });
      if (allNodes.every((n) => n.status === 'verified')) {
        const path = await this.pathRepo.findOne({ where: { id: pathId } });
        if (path) {
          path.status = 'completed';
          path.progress = 100;
          await this.pathRepo.save(path);
        }
      }
    } else {
      node.status = 'available';
      await this.nodeRepo.save(node);
    }

    return {
      passed,
      score: result.totalScore,
      maxScore: assessment.maxScore,
      percentage: Math.round(percentage),
      feedback: result.feedback,
      nodeStatus: node.status,
      degraded: result.degraded,
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
