import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Move knowledge_nodes onto the evidence-weighted mastery model.
 *
 * Development uses TypeORM `synchronize`, which adds these columns
 * automatically. Production runs migrations instead, so the same change has to
 * exist here or the API will boot against a schema without the new columns.
 *
 * The backfill matters: existing rows have a mastery value but no evidence
 * masses. Without seeding them, the first retention recompute would derive
 * masteryRaw from a totalMass of zero and reset every learner's progress to 0.
 */
export class EvidenceBasedMastery1787600000000 implements MigrationInterface {
  name = 'EvidenceBasedMastery1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_nodes"
        ADD COLUMN IF NOT EXISTS "masteryRaw"    double precision NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "successMass"   double precision NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "totalMass"     double precision NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "easeFactor"    double precision NOT NULL DEFAULT 2.5,
        ADD COLUMN IF NOT EXISTS "intervalDays"  double precision NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "stabilityDays" double precision NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS "nextReviewAt"  TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS "lastDecayAt"   TIMESTAMP NULL,
        ADD COLUMN IF NOT EXISTS "createdAt"     TIMESTAMP NOT NULL DEFAULT now()
    `);

    // weaknessScore's default changes from 50 to 100: a concept with no
    // evidence is entirely unknown, not half known.
    await queryRunner.query(`
      ALTER TABLE "knowledge_nodes"
        ALTER COLUMN "weaknessScore" SET DEFAULT 100
    `);

    // Carry existing progress into the new model. Prior weight is inferred from
    // recorded practice and capped so imported history cannot outweigh fresh
    // evidence.
    await queryRunner.query(`
      UPDATE "knowledge_nodes"
      SET
        "masteryRaw"  = COALESCE("mastery", 0),
        "totalMass"   = LEAST(GREATEST(COALESCE("practiceCount", 1), 1), 4),
        "successMass" = LEAST(GREATEST(COALESCE("practiceCount", 1), 1), 4)
                        * (LEAST(GREATEST(COALESCE("mastery", 0), 0), 100) / 100.0),
        "lastDecayAt" = COALESCE("lastRevision", now()),
        "stabilityDays" = 3
      WHERE "totalMass" = 0 AND COALESCE("mastery", 0) > 0
    `);

    // Restore the derived invariant for every row.
    await queryRunner.query(`
      UPDATE "knowledge_nodes"
      SET "weaknessScore" = GREATEST(0, LEAST(100, 100 - COALESCE("mastery", 0)))
    `);

    // De-duplicate before adding the unique constraint. Every previous write
    // site did findOne-then-create with no constraint, so duplicates are
    // possible; keep the row with the most evidence.
    await queryRunner.query(`
      DELETE FROM "knowledge_nodes" a
      USING "knowledge_nodes" b
      WHERE a."userId" = b."userId"
        AND a."conceptId" = b."conceptId"
        AND (
          a."practiceCount" < b."practiceCount"
          OR (a."practiceCount" = b."practiceCount" AND a."id" < b."id")
        )
    `);

    await queryRunner.query(`
      ALTER TABLE "knowledge_nodes"
        ADD CONSTRAINT "UQ_knowledge_node_user_concept" UNIQUE ("userId", "conceptId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_knowledge_node_user_next_review"
        ON "knowledge_nodes" ("userId", "nextReviewAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_knowledge_node_user_next_review"`);
    await queryRunner.query(`
      ALTER TABLE "knowledge_nodes"
        DROP CONSTRAINT IF EXISTS "UQ_knowledge_node_user_concept"
    `);
    await queryRunner.query(`
      ALTER TABLE "knowledge_nodes"
        ALTER COLUMN "weaknessScore" SET DEFAULT 50
    `);
    await queryRunner.query(`
      ALTER TABLE "knowledge_nodes"
        DROP COLUMN IF EXISTS "masteryRaw",
        DROP COLUMN IF EXISTS "successMass",
        DROP COLUMN IF EXISTS "totalMass",
        DROP COLUMN IF EXISTS "easeFactor",
        DROP COLUMN IF EXISTS "intervalDays",
        DROP COLUMN IF EXISTS "stabilityDays",
        DROP COLUMN IF EXISTS "nextReviewAt",
        DROP COLUMN IF EXISTS "lastDecayAt",
        DROP COLUMN IF EXISTS "createdAt"
    `);
  }
}
