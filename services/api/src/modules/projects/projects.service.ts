import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectEntity } from '../../entities/project.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { AIService } from '../ai/ai.service';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(ConceptEntity)
    private readonly conceptRepo: Repository<ConceptEntity>,
    private readonly aiService: AIService,
  ) {}

  async create(userId: string, data: { title: string; description?: string; repository?: string; technologies?: string[]; curriculumId?: string }) {
    const project = this.projectRepo.create({ userId, ...data });
    return this.projectRepo.save(project);
  }

  async submit(userId: string, projectId: string, notes?: string) {
    const project = await this.projectRepo.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException('Project not found');

    project.status = 'submitted';
    project.submittedAt = new Date();
    if (notes) project.submissionNotes = notes;

    // Generate AI feedback
    const feedback = await this.generateFeedback(project);
    project.aiFeedback = feedback;
    project.score = feedback.score as number;

    const saved = await this.projectRepo.save(project);

    // Update knowledge graph based on project technologies
    await this.updateMasteryFromProject(userId, project);

    return saved;
  }

  async getHistory(userId: string, limit = 20) {
    return this.projectRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getById(userId: string, projectId: string) {
    const project = await this.projectRepo.findOne({ where: { id: projectId, userId } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async generateFeedback(project: ProjectEntity) {
    const result = await this.aiService.getProvider().complete({
      systemPrompt: `You are an expert code reviewer and learning mentor. Review a student project submission and provide constructive feedback.

Return ONLY valid JSON with:
- score (number 0-100): overall project quality
- strengths (array of strings): what the student did well
- improvements (array of strings): specific things to improve
- conceptsDemo (array of strings): concepts the student demonstrated understanding of
- nextSteps (string): recommended next steps for learning
- summary (string): 2-3 sentence overall feedback`,
      messages: [
        {
          role: 'user',
          content: `Project: ${project.title}\nDescription: ${project.description || 'N/A'}\nTechnologies: ${project.technologies.join(', ')}\nRepository: ${project.repository || 'N/A'}\nNotes: ${project.submissionNotes || 'N/A'}`,
        },
      ],
      temperature: 0.5,
      responseFormat: 'json',
    });

    try {
      return JSON.parse(result.content);
    } catch {
      return { score: 50, summary: 'Project reviewed.', strengths: [], improvements: [], conceptsDemo: [], nextSteps: 'Continue building.' };
    }
  }

  private async updateMasteryFromProject(userId: string, project: ProjectEntity) {
    const score = project.score || 50;

    for (const tech of project.technologies) {
      const concept = await this.conceptRepo.findOne({ where: { name: tech } });
      if (!concept) continue;

      let node = await this.nodeRepo.findOne({ where: { userId, conceptId: concept.id } });
      if (!node) {
        node = this.nodeRepo.create({
          userId,
          conceptId: concept.id,
          confidence: score * 0.6,
          mastery: score * 0.5,
          weaknessScore: Math.max(0, 100 - score * 0.5),
          practiceCount: 1,
          lastRevision: new Date(),
          revisionCount: 1,
        });
      } else {
        // Projects provide strong mastery signal
        node.mastery = Math.min(100, Math.round(node.mastery * 0.6 + score * 0.4));
        node.confidence = Math.min(100, Math.round(node.confidence * 0.6 + score * 0.4));
        node.weaknessScore = Math.max(0, 100 - node.mastery);
        node.practiceCount += 1;
        node.lastRevision = new Date();
      }
      await this.nodeRepo.save(node);
    }
  }
}
