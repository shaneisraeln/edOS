import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { LearningModule } from './modules/learning/learning.module';
import { KnowledgeGraphModule } from './modules/knowledge-graph/knowledge-graph.module';
import { AssessmentModule } from './modules/assessment/assessment.module';
import { AIModule } from './modules/ai/ai.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SeedModule } from './modules/seed/seed.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { IntelligenceModule } from './modules/intelligence/intelligence.module';
import { AdminModule } from './modules/admin/admin.module';
import { CollegeModule } from './modules/college/college.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SettingsModule } from './modules/settings/settings.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ChallengesModule } from './modules/challenges/challenges.module';
import { ContextQuizModule } from './modules/context-quiz/context-quiz.module';
import { LearningPathModule } from './modules/learning-path/learning-path.module';
import { MentorModule } from './modules/mentor/mentor.module';
import { GroupsModule } from './modules/groups/groups.module';
import { RecruiterModule } from './modules/recruiter/recruiter.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DATABASE_HOST', 'localhost'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.get('DATABASE_USER', 'edos'),
        password: config.get('DATABASE_PASSWORD', 'edos_dev'),
        database: config.get('DATABASE_NAME', 'edos'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') !== 'production',
        migrationsRun: config.get('NODE_ENV') === 'production', // Auto-run migrations in prod
        migrations: ['dist/migrations/**/*.js'],
        ssl: config.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),
    AuthModule,
    UserModule,
    LearningModule,
    KnowledgeGraphModule,
    AssessmentModule,
    AIModule,
    DashboardModule,
    SeedModule,
    IngestionModule,
    IntelligenceModule,
    AdminModule,
    CollegeModule,
    ProjectsModule,
    NotificationsModule,
    SettingsModule,
    RealtimeModule,
    ChallengesModule,
    ContextQuizModule,
    LearningPathModule,
    MentorModule,
    GroupsModule,
    RecruiterModule,
  ],
})
export class AppModule {}
