import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConceptEntity } from '../../entities/concept.entity';

/**
 * Turns a free-text topic into a concept row.
 *
 * Several features only know a topic string ("React Hooks") and previously did
 * `findOne({ where: { name: topic } })`. Because concept names are not
 * normalised, an exact-match miss meant the score was silently discarded and
 * never reached the knowledge graph. This resolves case and whitespace
 * differences, and creates the concept when it genuinely does not exist so
 * evidence is never dropped.
 */
@Injectable()
export class ConceptResolverService {
  constructor(
    @InjectRepository(ConceptEntity)
    private readonly conceptRepo: Repository<ConceptEntity>,
  ) {}

  async resolve(topic: string, curriculumId?: string): Promise<ConceptEntity | null> {
    const name = (topic ?? '').trim();
    if (!name) return null;

    const exact = await this.conceptRepo.findOne({ where: { name } });
    if (exact) return exact;

    // Case-insensitive match before giving up and creating a new concept.
    const loose = await this.conceptRepo
      .createQueryBuilder('concept')
      .where('LOWER(TRIM(concept.name)) = LOWER(TRIM(:name))', { name })
      .getOne();
    if (loose) return loose;

    try {
      return await this.conceptRepo.save(this.conceptRepo.create({ name, curriculumId }));
    } catch {
      // Another request created it first.
      return this.conceptRepo
        .createQueryBuilder('concept')
        .where('LOWER(TRIM(concept.name)) = LOWER(TRIM(:name))', { name })
        .getOne();
    }
  }
}
