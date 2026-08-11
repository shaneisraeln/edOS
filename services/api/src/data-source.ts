import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * TypeORM CLI data source for migrations.
 * Used by: npx typeorm migration:generate/run/revert
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5555'),
  username: process.env.DATABASE_USER || 'edos',
  password: process.env.DATABASE_PASSWORD || 'edos_dev',
  database: process.env.DATABASE_NAME || 'edos',
  entities: ['src/entities/**/*.entity.ts'],
  migrations: ['src/migrations/**/*.ts'],
  synchronize: false,
});
