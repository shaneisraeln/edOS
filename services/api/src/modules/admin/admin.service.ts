import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { KnowledgeEdgeEntity } from '../../entities/knowledge-edge.entity';
import { AuditLogEntity } from '../../entities/audit-log.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ConceptEntity)
    private readonly conceptRepo: Repository<ConceptEntity>,
    @InjectRepository(KnowledgeEdgeEntity)
    private readonly edgeRepo: Repository<KnowledgeEdgeEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
  ) {}

  // --- User Management ---

  async getUsers(page = 1, limit = 20) {
    const [users, total] = await this.userRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      select: ['id', 'name', 'email', 'role', 'createdAt'],
    });
    return { users, total, page, pages: Math.ceil(total / limit) };
  }

  async updateUserRole(adminId: string, userId: string, role: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    user.role = role;
    await this.userRepo.save(user);

    await this.logAudit(adminId, 'UPDATE_ROLE', 'user', userId, { newRole: role });
    return { id: user.id, name: user.name, role: user.role };
  }

  // --- Curriculum Management ---

  async getCurricula() {
    const concepts = await this.conceptRepo.find({
      where: { parentConceptId: undefined as any },
      relations: ['childConcepts'],
    });
    // Get top-level (roots)
    const roots = await this.conceptRepo
      .createQueryBuilder('c')
      .where('c.parentConceptId IS NULL')
      .getMany();

    return roots;
  }

  async bulkImportCurriculum(
    adminId: string,
    data: { name: string; curriculumId: string; concepts: ImportConcept[] },
  ) {
    let created = 0;

    const importConcept = async (concept: ImportConcept, parentId?: string) => {
      const entity = await this.conceptRepo.save(
        this.conceptRepo.create({
          name: concept.name,
          description: concept.description,
          curriculumId: data.curriculumId,
          parentConceptId: parentId,
        }),
      );
      created++;

      if (concept.children) {
        for (const child of concept.children) {
          const childEntity = await importConcept(child, entity.id);
          await this.edgeRepo.save(
            this.edgeRepo.create({
              parentConceptId: entity.id,
              childConceptId: childEntity.id,
              relationshipType: 'part_of',
              strength: 80,
            }),
          );
        }
      }

      return entity;
    };

    for (const concept of data.concepts) {
      await importConcept(concept);
    }

    await this.logAudit(adminId, 'BULK_IMPORT', 'curriculum', data.curriculumId, {
      name: data.name,
      conceptsCreated: created,
    });

    return { created, curriculumId: data.curriculumId };
  }

  // --- Analytics ---

  async getPlatformAnalytics() {
    const totalUsers = await this.userRepo.count();
    const totalSessions = await this.sessionRepo.count();
    const totalAssessments = await this.assessmentRepo.count();
    const totalConcepts = await this.conceptRepo.count();

    const recentUsers = await this.userRepo.count({
      where: { createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) as any },
    });

    // Users by role
    const roleBreakdown = await this.userRepo
      .createQueryBuilder('u')
      .select('u.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('u.role')
      .getRawMany();

    return {
      totalUsers,
      totalSessions,
      totalAssessments,
      totalConcepts,
      recentSignups: recentUsers,
      roleBreakdown,
    };
  }

  // --- Audit Logging ---

  async logAudit(
    userId: string,
    action: string,
    resource: string,
    resourceId?: string,
    details?: Record<string, unknown>,
    ipAddress?: string,
  ) {
    return this.auditRepo.save(
      this.auditRepo.create({
        userId,
        action,
        resource,
        resourceId,
        details: details || {},
        ipAddress,
      }),
    );
  }

  async getAuditLogs(page = 1, limit = 50) {
    const [logs, total] = await this.auditRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { logs, total, page, pages: Math.ceil(total / limit) };
  }
}

interface ImportConcept {
  name: string;
  description?: string;
  children?: ImportConcept[];
}
