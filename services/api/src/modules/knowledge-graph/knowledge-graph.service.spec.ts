import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { ConceptEntity } from '../../entities/concept.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { KnowledgeEdgeEntity } from '../../entities/knowledge-edge.entity';

describe('KnowledgeGraphService', () => {
  let service: KnowledgeGraphService;
  let mockConceptRepo: any;
  let mockNodeRepo: any;
  let mockEdgeRepo: any;

  beforeEach(async () => {
    mockConceptRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockNodeRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    mockEdgeRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeGraphService,
        { provide: getRepositoryToken(ConceptEntity), useValue: mockConceptRepo },
        { provide: getRepositoryToken(KnowledgeNodeEntity), useValue: mockNodeRepo },
        { provide: getRepositoryToken(KnowledgeEdgeEntity), useValue: mockEdgeRepo },
      ],
    }).compile();

    service = module.get<KnowledgeGraphService>(KnowledgeGraphService);
  });

  describe('findOrCreateConcept', () => {
    it('should return existing concept if found', async () => {
      const existing = { id: '1', name: 'Neural Networks' };
      mockConceptRepo.findOne.mockResolvedValue(existing);

      const result = await service.findOrCreateConcept('Neural Networks');
      expect(result).toEqual(existing);
      expect(mockConceptRepo.save).not.toHaveBeenCalled();
    });

    it('should create new concept if not found', async () => {
      mockConceptRepo.findOne.mockResolvedValue(null);
      mockConceptRepo.create.mockReturnValue({ name: 'New Concept' });
      mockConceptRepo.save.mockResolvedValue({ id: '2', name: 'New Concept' });

      const result = await service.findOrCreateConcept('New Concept');
      expect(result.id).toBe('2');
      expect(mockConceptRepo.save).toHaveBeenCalled();
    });
  });

  describe('touchNode', () => {
    it('should create node if not exists', async () => {
      mockNodeRepo.findOne.mockResolvedValue(null);
      mockNodeRepo.create.mockReturnValue({
        userId: 'u1', conceptId: 'c1', confidence: 10, practiceCount: 1,
      });
      mockNodeRepo.save.mockResolvedValue({ id: 'n1', userId: 'u1', conceptId: 'c1' });

      await service.touchNode('u1', 'c1');
      expect(mockNodeRepo.create).toHaveBeenCalled();
      expect(mockNodeRepo.save).toHaveBeenCalled();
    });

    it('should increment practice count if node exists', async () => {
      const existing = { userId: 'u1', conceptId: 'c1', practiceCount: 3, confidence: 50 };
      mockNodeRepo.findOne.mockResolvedValue(existing);
      mockNodeRepo.save.mockResolvedValue(existing);

      await service.touchNode('u1', 'c1');
      expect(existing.practiceCount).toBe(4);
      expect(existing.confidence).toBe(52);
    });
  });

  describe('ensureEdge', () => {
    it('should not create duplicate edge', async () => {
      const existing = { id: 'e1', parentConceptId: 'c1', childConceptId: 'c2' };
      mockEdgeRepo.findOne.mockResolvedValue(existing);

      const result = await service.ensureEdge('c1', 'c2', 'related');
      expect(result).toEqual(existing);
      expect(mockEdgeRepo.save).not.toHaveBeenCalled();
    });

    it('should create edge if not exists', async () => {
      mockEdgeRepo.findOne.mockResolvedValue(null);
      mockEdgeRepo.create.mockReturnValue({ parentConceptId: 'c1', childConceptId: 'c2' });
      mockEdgeRepo.save.mockResolvedValue({ id: 'e2' });

      await service.ensureEdge('c1', 'c2', 'prerequisite');
      expect(mockEdgeRepo.save).toHaveBeenCalled();
    });
  });
});
