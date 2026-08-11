import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ConceptEntity } from './concept.entity';

@Entity('knowledge_edges')
export class KnowledgeEdgeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  parentConceptId: string;

  @ManyToOne(() => ConceptEntity)
  @JoinColumn({ name: 'parentConceptId' })
  parentConcept: ConceptEntity;

  @Column()
  childConceptId: string;

  @ManyToOne(() => ConceptEntity)
  @JoinColumn({ name: 'childConceptId' })
  childConcept: ConceptEntity;

  @Column({ default: 'prerequisite' })
  relationshipType: string;

  @Column({ type: 'float', default: 50 })
  strength: number;
}
