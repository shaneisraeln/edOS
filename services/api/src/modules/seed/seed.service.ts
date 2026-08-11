import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConceptEntity } from '../../entities/concept.entity';
import { KnowledgeEdgeEntity } from '../../entities/knowledge-edge.entity';

interface ConceptSeed {
  name: string;
  description?: string;
  curriculumId: string;
  children?: ConceptSeed[];
}

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(ConceptEntity)
    private readonly conceptRepo: Repository<ConceptEntity>,
    @InjectRepository(KnowledgeEdgeEntity)
    private readonly edgeRepo: Repository<KnowledgeEdgeEntity>,
  ) {}

  async onApplicationBootstrap() {
    const count = await this.conceptRepo.count();
    if (count > 0) {
      this.logger.log(`Concepts already seeded (${count} found). Skipping.`);
      return;
    }

    this.logger.log('Seeding curricula concepts...');
    await this.seedAll();
    const newCount = await this.conceptRepo.count();
    this.logger.log(`Seeding complete: ${newCount} concepts created.`);
  }

  private async seedAll() {
    const curricula = [
      this.getMLCurriculum(),
      this.getWebDevCurriculum(),
      this.getDataScienceCurriculum(),
    ];

    for (const curriculum of curricula) {
      await this.seedCurriculum(curriculum);
    }
  }

  private async seedCurriculum(concepts: ConceptSeed[]) {
    for (const concept of concepts) {
      await this.seedConcept(concept, undefined);
    }
  }

  private async seedConcept(seed: ConceptSeed, parentId: string | undefined): Promise<string> {
    const concept = this.conceptRepo.create({
      name: seed.name,
      description: seed.description,
      curriculumId: seed.curriculumId,
      parentConceptId: parentId,
    });
    const saved = await this.conceptRepo.save(concept);

    if (seed.children) {
      for (const child of seed.children) {
        const childId = await this.seedConcept(child, saved.id);
        // Create prerequisite edge
        await this.edgeRepo.save(
          this.edgeRepo.create({
            parentConceptId: saved.id,
            childConceptId: childId,
            relationshipType: 'part_of',
            strength: 80,
          }),
        );
      }
    }

    return saved.id;
  }

  private getMLCurriculum(): ConceptSeed[] {
    return [
      {
        name: 'Machine Learning',
        description: 'Core machine learning concepts and algorithms',
        curriculumId: 'ml',
        children: [
          {
            name: 'Mathematics for ML',
            curriculumId: 'ml',
            children: [
              { name: 'Linear Algebra', curriculumId: 'ml' },
              { name: 'Calculus', curriculumId: 'ml' },
              { name: 'Probability & Statistics', curriculumId: 'ml' },
              { name: 'Optimization', curriculumId: 'ml' },
            ],
          },
          {
            name: 'Supervised Learning',
            curriculumId: 'ml',
            children: [
              { name: 'Linear Regression', curriculumId: 'ml' },
              { name: 'Logistic Regression', curriculumId: 'ml' },
              { name: 'Decision Trees', curriculumId: 'ml' },
              { name: 'Random Forests', curriculumId: 'ml' },
              { name: 'Support Vector Machines', curriculumId: 'ml' },
              { name: 'K-Nearest Neighbors', curriculumId: 'ml' },
            ],
          },
          {
            name: 'Unsupervised Learning',
            curriculumId: 'ml',
            children: [
              { name: 'K-Means Clustering', curriculumId: 'ml' },
              { name: 'Hierarchical Clustering', curriculumId: 'ml' },
              { name: 'PCA', curriculumId: 'ml' },
              { name: 'Anomaly Detection', curriculumId: 'ml' },
            ],
          },
          {
            name: 'Deep Learning',
            curriculumId: 'ml',
            children: [
              { name: 'Neural Networks', curriculumId: 'ml' },
              { name: 'Backpropagation', curriculumId: 'ml' },
              { name: 'Activation Functions', curriculumId: 'ml' },
              { name: 'Convolutional Neural Networks', curriculumId: 'ml' },
              { name: 'Recurrent Neural Networks', curriculumId: 'ml' },
              { name: 'Transformers', curriculumId: 'ml' },
              { name: 'Attention Mechanism', curriculumId: 'ml' },
              { name: 'GANs', curriculumId: 'ml' },
            ],
          },
          {
            name: 'Model Evaluation',
            curriculumId: 'ml',
            children: [
              { name: 'Cross Validation', curriculumId: 'ml' },
              { name: 'Bias-Variance Tradeoff', curriculumId: 'ml' },
              { name: 'Overfitting & Regularization', curriculumId: 'ml' },
              { name: 'Precision & Recall', curriculumId: 'ml' },
              { name: 'ROC & AUC', curriculumId: 'ml' },
            ],
          },
          {
            name: 'NLP',
            curriculumId: 'ml',
            children: [
              { name: 'Tokenization', curriculumId: 'ml' },
              { name: 'Word Embeddings', curriculumId: 'ml' },
              { name: 'Sequence Models', curriculumId: 'ml' },
              { name: 'Large Language Models', curriculumId: 'ml' },
            ],
          },
        ],
      },
    ];
  }

  private getWebDevCurriculum(): ConceptSeed[] {
    return [
      {
        name: 'Web Development',
        description: 'Full-stack web development',
        curriculumId: 'web-dev',
        children: [
          {
            name: 'HTML & CSS',
            curriculumId: 'web-dev',
            children: [
              { name: 'HTML5 Semantics', curriculumId: 'web-dev' },
              { name: 'CSS Flexbox', curriculumId: 'web-dev' },
              { name: 'CSS Grid', curriculumId: 'web-dev' },
              { name: 'Responsive Design', curriculumId: 'web-dev' },
              { name: 'CSS Animations', curriculumId: 'web-dev' },
            ],
          },
          {
            name: 'JavaScript',
            curriculumId: 'web-dev',
            children: [
              { name: 'ES6+ Features', curriculumId: 'web-dev' },
              { name: 'Async/Await & Promises', curriculumId: 'web-dev' },
              { name: 'DOM Manipulation', curriculumId: 'web-dev' },
              { name: 'Event Loop', curriculumId: 'web-dev' },
              { name: 'Closures & Scope', curriculumId: 'web-dev' },
              { name: 'TypeScript', curriculumId: 'web-dev' },
            ],
          },
          {
            name: 'React',
            curriculumId: 'web-dev',
            children: [
              { name: 'Components & Props', curriculumId: 'web-dev' },
              { name: 'State Management', curriculumId: 'web-dev' },
              { name: 'Hooks', curriculumId: 'web-dev' },
              { name: 'React Router', curriculumId: 'web-dev' },
              { name: 'Server Components', curriculumId: 'web-dev' },
              { name: 'Next.js', curriculumId: 'web-dev' },
            ],
          },
          {
            name: 'Backend Development',
            curriculumId: 'web-dev',
            children: [
              { name: 'Node.js', curriculumId: 'web-dev' },
              { name: 'REST APIs', curriculumId: 'web-dev' },
              { name: 'Authentication & Authorization', curriculumId: 'web-dev' },
              { name: 'Databases (SQL)', curriculumId: 'web-dev' },
              { name: 'Databases (NoSQL)', curriculumId: 'web-dev' },
              { name: 'GraphQL', curriculumId: 'web-dev' },
            ],
          },
          {
            name: 'DevOps & Deployment',
            curriculumId: 'web-dev',
            children: [
              { name: 'Git & Version Control', curriculumId: 'web-dev' },
              { name: 'Docker', curriculumId: 'web-dev' },
              { name: 'CI/CD', curriculumId: 'web-dev' },
              { name: 'Cloud Deployment', curriculumId: 'web-dev' },
            ],
          },
        ],
      },
    ];
  }

  private getDataScienceCurriculum(): ConceptSeed[] {
    return [
      {
        name: 'Data Science',
        description: 'Data analysis, visualization, and modeling',
        curriculumId: 'data-science',
        children: [
          {
            name: 'Python for Data Science',
            curriculumId: 'data-science',
            children: [
              { name: 'NumPy', curriculumId: 'data-science' },
              { name: 'Pandas', curriculumId: 'data-science' },
              { name: 'Matplotlib & Seaborn', curriculumId: 'data-science' },
              { name: 'Scikit-learn', curriculumId: 'data-science' },
            ],
          },
          {
            name: 'Statistics',
            curriculumId: 'data-science',
            children: [
              { name: 'Descriptive Statistics', curriculumId: 'data-science' },
              { name: 'Inferential Statistics', curriculumId: 'data-science' },
              { name: 'Hypothesis Testing', curriculumId: 'data-science' },
              { name: 'Bayesian Statistics', curriculumId: 'data-science' },
            ],
          },
          {
            name: 'Data Engineering',
            curriculumId: 'data-science',
            children: [
              { name: 'Data Cleaning', curriculumId: 'data-science' },
              { name: 'Feature Engineering', curriculumId: 'data-science' },
              { name: 'ETL Pipelines', curriculumId: 'data-science' },
              { name: 'SQL for Analytics', curriculumId: 'data-science' },
            ],
          },
          {
            name: 'Data Visualization',
            curriculumId: 'data-science',
            children: [
              { name: 'Chart Types & Best Practices', curriculumId: 'data-science' },
              { name: 'Dashboard Design', curriculumId: 'data-science' },
              { name: 'Storytelling with Data', curriculumId: 'data-science' },
            ],
          },
        ],
      },
    ];
  }
}
