import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import {
  CONFIDENCE_SCALE,
  DEFAULT_DIFFICULTY_MULTIPLIER,
  DIFFICULTY_MULTIPLIER,
  EVIDENCE_HALF_LIFE_DAYS,
  EVIDENCE_WEIGHT,
  MIN_CONFIDENCE,
  RETENTION,
  SCHEDULE,
  clampPercent,
  clamp,
} from './scoring.constants';
import { RecordEvidenceInput } from './scoring.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The only thing in the system allowed to write mastery.
 *
 * Previously eight call sites each had their own blend formula
 * (0.3/0.7, 0.4/0.6, 0.6/0.4, +2, +3, score*0.5 …), which meant the same score
 * moved mastery differently depending on which feature you happened to use, and
 * passive exposure could inflate mastery to look like demonstrated skill.
 *
 * The model here is a weighted running proportion. Each piece of evidence
 * contributes a weight (its "sample size") and a score; mastery is the
 * weight-weighted mean of scores. Consequences that fall out for free:
 *
 * - Early evidence moves mastery a lot, later evidence refines it, because each
 *   new sample is a smaller share of the accumulated total.
 * - Evidence types carry different authority: shipping a project outweighs
 *   answering a popup quiz, and merely having a page open barely registers.
 * - Harder material counts for more.
 * - Old evidence fades, so the number tracks current ability.
 * - Confidence is separate from mastery: it measures how much evidence exists.
 */
@Injectable()
export class MasteryService {
  private readonly logger = new Logger(MasteryService.name);

  constructor(
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
  ) {}

  /**
   * Record one observation about a learner and a concept, then recompute the
   * node. Safe to call for both graded work and passive exposure.
   */
  async recordEvidence(input: RecordEvidenceInput): Promise<KnowledgeNodeEntity> {
    const now = input.occurredAt ?? new Date();
    const node = await this.findOrCreate(input.userId, input.conceptId, now);
    this.adoptLegacyState(node);

    const weight = this.weightFor(input);
    // Exposure carries no score — it says "seen", not "understood". Attributing
    // it a neutral 0.5 would drag a strong concept down and lift a weak one up,
    // so it contributes weight without moving the mean.
    const hasScore = typeof input.scoreFraction === 'number' && Number.isFinite(input.scoreFraction);
    const scoreFraction = hasScore ? clamp(input.scoreFraction as number, 0, 1) : null;

    // Fade existing evidence before adding to it.
    this.applyEvidenceDecay(node, now);

    if (scoreFraction === null) {
      node.totalMass += weight;
      // Keep the mean unchanged by adding proportional success mass.
      const currentRatio = node.totalMass > 0 ? node.successMass / (node.totalMass - weight || 1) : 0;
      node.successMass += weight * clamp(currentRatio, 0, 1);
    } else {
      node.totalMass += weight;
      node.successMass += weight * scoreFraction;
      node.assessmentScore = Math.round(scoreFraction * 100);
    }

    node.practiceCount += 1;

    const isReview = input.isReview ?? scoreFraction !== null;
    if (isReview) {
      node.revisionCount += 1;
      node.lastRevision = now;
      this.updateSchedule(node, scoreFraction ?? 0.5, now);
    }

    this.recompute(node, now);
    return this.nodeRepo.save(node);
  }

  /**
   * Recompute the retention-adjusted mastery for every node of a user. Called
   * by the decay cron and cheap enough to call before a read that must be exact.
   */
  async refreshRetention(userId: string): Promise<number> {
    const nodes = await this.nodeRepo.find({ where: { userId } });
    const now = new Date();

    for (const node of nodes) {
      this.adoptLegacyState(node);
      this.recompute(node, now);
    }

    if (nodes.length > 0) await this.nodeRepo.save(nodes);
    return nodes.length;
  }

  /** Concepts whose scheduled review time has passed. */
  async getDueNodes(userId: string, limit = 10): Promise<KnowledgeNodeEntity[]> {
    return this.nodeRepo.find({
      where: { userId, nextReviewAt: LessThanOrEqual(new Date()) },
      relations: ['concept'],
      order: { nextReviewAt: 'ASC' },
      take: limit,
    });
  }

  // ------------------------------------------------------------------ internals

  private async findOrCreate(
    userId: string,
    conceptId: string,
    now: Date,
  ): Promise<KnowledgeNodeEntity> {
    const existing = await this.nodeRepo.findOne({ where: { userId, conceptId } });
    if (existing) return existing;

    const created = this.nodeRepo.create({
      userId,
      conceptId,
      mastery: 0,
      masteryRaw: 0,
      confidence: 0,
      weaknessScore: 100,
      successMass: 0,
      totalMass: 0,
      easeFactor: SCHEDULE.INITIAL_EASE,
      intervalDays: 0,
      stabilityDays: RETENTION.INITIAL_STABILITY_DAYS,
      practiceCount: 0,
      revisionCount: 0,
      lastDecayAt: now,
    });

    try {
      return await this.nodeRepo.save(created);
    } catch {
      // Lost a race against a concurrent writer; the unique constraint held, so
      // just read back the row that won.
      const raced = await this.nodeRepo.findOne({ where: { userId, conceptId } });
      if (raced) return raced;
      throw new Error(`Could not create knowledge node for concept ${conceptId}`);
    }
  }

  /**
   * Seed the evidence masses for nodes written before this model existed.
   *
   * Rows created by the old code carry a mastery value but no masses. Left
   * alone, the first recompute would derive masteryRaw from a totalMass of zero
   * and silently reset the learner's history to 0. Instead we treat the legacy
   * mastery as a modest amount of prior evidence, so existing progress carries
   * over and is then refined by whatever happens next.
   */
  private adoptLegacyState(node: KnowledgeNodeEntity): void {
    if (node.totalMass > 0) return;

    const legacyMastery = Number(node.mastery) || 0;
    if (legacyMastery <= 0) return;

    // Infer prior weight from how much practice was recorded, capped so imported
    // history never outweighs fresh evidence.
    const inferredWeight = clamp(Number(node.practiceCount) || 1, 1, 4);
    node.totalMass = inferredWeight;
    node.successMass = inferredWeight * clamp(legacyMastery / 100, 0, 1);
    node.masteryRaw = legacyMastery;

    if (!node.stabilityDays) node.stabilityDays = RETENTION.INITIAL_STABILITY_DAYS;
    if (!node.easeFactor) node.easeFactor = SCHEDULE.INITIAL_EASE;
  }

  private weightFor(input: RecordEvidenceInput): number {
    const base = EVIDENCE_WEIGHT[input.kind] ?? EVIDENCE_WEIGHT.context_quiz;
    const multiplier =
      DIFFICULTY_MULTIPLIER[String(input.difficulty ?? '').toLowerCase()] ??
      DEFAULT_DIFFICULTY_MULTIPLIER;
    return base * multiplier;
  }

  /**
   * Shrink accumulated evidence toward zero so recent performance dominates.
   * Both masses shrink equally, so this lowers confidence without moving
   * mastery — forgetting is handled separately by the retention curve.
   */
  private applyEvidenceDecay(node: KnowledgeNodeEntity, now: Date): void {
    const since = node.lastDecayAt ?? node.updatedAt ?? now;
    const days = Math.max(0, (now.getTime() - new Date(since).getTime()) / DAY_MS);
    if (days <= 0) return;

    const factor = Math.pow(0.5, days / EVIDENCE_HALF_LIFE_DAYS);
    node.successMass *= factor;
    node.totalMass *= factor;
    node.lastDecayAt = now;
  }

  /** SM-2: successful reviews lengthen the interval, lapses reset it. */
  private updateSchedule(node: KnowledgeNodeEntity, scoreFraction: number, now: Date): void {
    const passed = scoreFraction >= 0.6;

    // Map the score onto SM-2's 0–5 quality scale.
    const quality = clamp(Math.round(scoreFraction * 5), 0, 5);
    const nextEase = node.easeFactor + (0.1 - (5 - quality) * 0.08 + (5 - quality) * 0.02 * quality);
    node.easeFactor = clamp(nextEase, SCHEDULE.MIN_EASE, SCHEDULE.MAX_EASE);

    if (!passed) {
      node.intervalDays = SCHEDULE.LAPSE_INTERVAL_DAYS;
      node.stabilityDays = Math.max(
        RETENTION.MIN_STABILITY_DAYS,
        node.stabilityDays * 0.5,
      );
    } else if (node.revisionCount <= 1) {
      node.intervalDays = SCHEDULE.FIRST_INTERVAL_DAYS;
      node.stabilityDays = RETENTION.INITIAL_STABILITY_DAYS;
    } else if (node.revisionCount === 2) {
      node.intervalDays = SCHEDULE.SECOND_INTERVAL_DAYS;
      node.stabilityDays = Math.max(node.stabilityDays, SCHEDULE.SECOND_INTERVAL_DAYS);
    } else {
      node.intervalDays = clamp(
        node.intervalDays * node.easeFactor,
        SCHEDULE.FIRST_INTERVAL_DAYS,
        SCHEDULE.MAX_INTERVAL_DAYS,
      );
      // Stability tracks the interval the learner can now sustain.
      node.stabilityDays = clamp(
        node.intervalDays * 0.9,
        RETENTION.MIN_STABILITY_DAYS,
        RETENTION.MAX_STABILITY_DAYS,
      );
    }

    node.nextReviewAt = new Date(now.getTime() + node.intervalDays * DAY_MS);
  }

  /**
   * Derive every displayed field from the stored evidence. This is the only
   * place mastery, confidence and weaknessScore are assigned.
   */
  private recompute(node: KnowledgeNodeEntity, now: Date): void {
    node.masteryRaw =
      node.totalMass > 0 ? clampPercent((node.successMass / node.totalMass) * 100) : 0;

    node.confidence =
      node.totalMass > 0
        ? clampPercent(
            Math.max(MIN_CONFIDENCE, 100 * (1 - Math.exp(-node.totalMass / CONFIDENCE_SCALE))),
          )
        : 0;

    node.mastery = clampPercent(node.masteryRaw * this.retention(node, now));
    node.weaknessScore = clampPercent(100 - node.mastery);
  }

  /**
   * Forgetting curve. Retention is 1 immediately after a review and falls
   * exponentially with a per-concept stability, bounded below so a concept the
   * learner genuinely learned never reads as completely forgotten.
   */
  private retention(node: KnowledgeNodeEntity, now: Date): number {
    if (!node.lastRevision) return 1;

    const days = Math.max(0, (now.getTime() - new Date(node.lastRevision).getTime()) / DAY_MS);
    const stability = clamp(
      node.stabilityDays || RETENTION.INITIAL_STABILITY_DAYS,
      RETENTION.MIN_STABILITY_DAYS,
      RETENTION.MAX_STABILITY_DAYS,
    );

    const raw = Math.exp(-days / stability);
    return clamp(RETENTION.FLOOR + (1 - RETENTION.FLOOR) * raw, RETENTION.FLOOR, 1);
  }
}
