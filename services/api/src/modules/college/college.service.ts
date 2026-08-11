import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { LearningGoalEntity } from '../../entities/learning-goal.entity';

@Injectable()
export class CollegeService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
    @InjectRepository(LearningGoalEntity)
    private readonly goalRepo: Repository<LearningGoalEntity>,
  ) {}

  /**
   * Get overview of all students for faculty view.
   */
  async getStudentOverview(page = 1, limit = 20) {
    const [students, total] = await this.userRepo.findAndCount({
      where: { role: 'student' },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      select: ['id', 'name', 'email', 'createdAt'],
    });

    // Enrich with mastery data
    const enriched = await Promise.all(
      students.map(async (student) => {
        const masteryResult = await this.nodeRepo
          .createQueryBuilder('node')
          .select('AVG(node.mastery)', 'avgMastery')
          .addSelect('COUNT(node.id)', 'conceptCount')
          .where('node.userId = :userId', { userId: student.id })
          .getRawOne();

        const sessionCount = await this.sessionRepo.count({ where: { userId: student.id } });
        const assessmentCount = await this.assessmentRepo.count({
          where: { userId: student.id, status: 'completed' },
        });

        return {
          ...student,
          averageMastery: Math.round(parseFloat(masteryResult?.avgMastery || '0')),
          conceptCount: parseInt(masteryResult?.conceptCount || '0'),
          sessionCount,
          assessmentCount,
        };
      }),
    );

    return { students: enriched, total, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Get detailed progress for a specific student.
   */
  async getStudentDetail(studentId: string) {
    const student = await this.userRepo.findOne({
      where: { id: studentId },
      select: ['id', 'name', 'email', 'createdAt'],
    });
    if (!student) return null;

    const goals = await this.goalRepo.find({ where: { userId: studentId } });

    const nodes = await this.nodeRepo.find({
      where: { userId: studentId },
      relations: ['concept'],
      order: { mastery: 'DESC' },
    });

    const recentAssessments = await this.assessmentRepo.find({
      where: { userId: studentId },
      order: { generatedAt: 'DESC' },
      take: 10,
    });

    const recentSessions = await this.sessionRepo.find({
      where: { userId: studentId },
      order: { startTime: 'DESC' },
      take: 10,
    });

    const avgMastery =
      nodes.length > 0
        ? Math.round(nodes.reduce((s, n) => s + n.mastery, 0) / nodes.length)
        : 0;

    return {
      student,
      goals,
      knowledgeNodes: nodes,
      recentAssessments,
      recentSessions,
      stats: {
        averageMastery: avgMastery,
        totalConcepts: nodes.length,
        strongConcepts: nodes.filter((n) => n.mastery >= 70).length,
        weakConcepts: nodes.filter((n) => n.weaknessScore >= 60).length,
        totalAssessments: recentAssessments.length,
      },
    };
  }

  /**
   * Get topic coverage across all students.
   */
  async getTopicCoverage() {
    const coverage = await this.nodeRepo
      .createQueryBuilder('node')
      .innerJoin('node.concept', 'concept')
      .select('concept.name', 'topic')
      .addSelect('COUNT(DISTINCT node.userId)', 'studentCount')
      .addSelect('AVG(node.mastery)', 'avgMastery')
      .groupBy('concept.name')
      .orderBy('"studentCount"', 'DESC')
      .limit(30)
      .getRawMany();

    return coverage.map((c) => ({
      topic: c.topic,
      studentCount: parseInt(c.studentCount),
      avgMastery: Math.round(parseFloat(c.avgMastery || '0')),
    }));
  }

  /**
   * Get weak areas across all students for a given curriculum.
   */
  async getClassWeaknesses(curriculumId?: string) {
    let query = this.nodeRepo
      .createQueryBuilder('node')
      .innerJoin('node.concept', 'concept')
      .select('concept.name', 'topic')
      .addSelect('AVG(node.weaknessScore)', 'avgWeakness')
      .addSelect('COUNT(DISTINCT node.userId)', 'studentCount')
      .groupBy('concept.name')
      .having('AVG(node.weaknessScore) > 50')
      .orderBy('"avgWeakness"', 'DESC')
      .limit(20);

    if (curriculumId) {
      query = query.andWhere('concept.curriculumId = :curriculumId', { curriculumId });
    }

    return query.getRawMany();
  }
}
