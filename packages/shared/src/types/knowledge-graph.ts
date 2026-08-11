export interface Concept {
  id: string;
  name: string;
  description?: string;
  parentConceptId?: string;
  curriculumId?: string;
}

export interface KnowledgeNode {
  id: string;
  userId: string;
  conceptId: string;
  concept: Concept;
  confidence: number; // 0-100
  mastery: number; // 0-100
  lastRevision?: Date;
  practiceCount: number;
  assessmentScore?: number;
  weaknessScore: number; // 0-100, higher = weaker
  updatedAt: Date;
}

export interface KnowledgeEdge {
  id: string;
  parentConceptId: string;
  childConceptId: string;
  relationshipType: EdgeRelationship;
  strength: number; // 0-100
}

export enum EdgeRelationship {
  PREREQUISITE = 'prerequisite',
  RELATED = 'related',
  PART_OF = 'part_of',
  BUILDS_ON = 'builds_on',
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}
