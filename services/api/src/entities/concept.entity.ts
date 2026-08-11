import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';

@Entity('concepts')
export class ConceptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  parentConceptId: string;

  @ManyToOne(() => ConceptEntity, { nullable: true })
  @JoinColumn({ name: 'parentConceptId' })
  parentConcept: ConceptEntity;

  @OneToMany(() => ConceptEntity, (concept) => concept.parentConcept)
  childConcepts: ConceptEntity[];

  @Column({ nullable: true })
  curriculumId: string;
}
