import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { ProjectEntity } from '../../entities/project.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';

@Injectable()
export class RecruiterService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly knowledgeNodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
  ) {}

  async getPublicProfile(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Verified skills: concepts with mastery > 70%
    const verifiedNodes = await this.knowledgeNodeRepo.find({
      where: { userId, mastery: MoreThan(70) },
      relations: ['concept'],
      order: { mastery: 'DESC' },
    });

    const verifiedSkills = verifiedNodes.map((n) => ({
      conceptId: n.conceptId,
      name: n.concept?.name || 'Unknown',
      mastery: Math.round(n.mastery),
      lastAssessed: n.updatedAt,
    }));

    // Assessment history
    const assessments = await this.assessmentRepo.find({
      where: { userId },
      order: { generatedAt: 'DESC' },
      take: 20,
    });

    const assessmentHistory = assessments.map((a) => ({
      id: a.id,
      topic: a.topic,
      score: a.score,
      maxScore: a.maxScore,
      completedAt: a.completedAt || a.generatedAt,
    }));

    // Projects
    const projects = await this.projectRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const projectList = projects.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      technologies: p.technologies,
      status: p.status,
      score: p.score,
    }));

    // Learning velocity (sessions per week in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSessions = await this.sessionRepo.count({
      where: {
        userId,
        startTime: MoreThan(thirtyDaysAgo),
      },
    });

    const learningVelocity = Math.round((recentSessions / 30) * 7 * 10) / 10; // sessions per week

    return {
      user: {
        id: user.id,
        name: user.name,
        createdAt: user.createdAt,
      },
      verifiedSkills,
      assessmentHistory,
      projects: projectList,
      learningVelocity,
      stats: {
        totalVerifiedSkills: verifiedSkills.length,
        totalAssessments: assessments.length,
        totalProjects: projects.length,
      },
    };
  }

  async verifySkill(userId: string, conceptId: string) {
    const node = await this.knowledgeNodeRepo.findOne({
      where: { userId, conceptId },
      relations: ['concept'],
    });

    if (!node) throw new NotFoundException('Skill not found for this user');

    const assessments = await this.assessmentRepo.find({
      where: { userId, topic: node.concept?.name },
      order: { generatedAt: 'DESC' },
      take: 5,
    });

    return {
      verified: node.mastery > 70,
      conceptName: node.concept?.name || 'Unknown',
      mastery: Math.round(node.mastery),
      confidence: Math.round(node.confidence),
      practiceCount: node.practiceCount,
      lastRevision: node.lastRevision,
      assessmentEvidence: assessments.map((a) => ({
        score: a.score,
        maxScore: a.maxScore,
        date: a.completedAt || a.generatedAt,
      })),
    };
  }
}
