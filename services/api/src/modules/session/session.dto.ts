import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SURFACES } from './session.constants';

/**
 * DTO classes, not inline types.
 *
 * The app installs a global ValidationPipe with `whitelist` and
 * `forbidNonWhitelisted`. Controllers that type their body as an inline object
 * get no validation at all, and any field not declared on a real class is
 * rejected — so these have to exist for the agents' requests to be accepted.
 */

export class StartSessionDto {
  @IsString()
  @MaxLength(200)
  topic: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtopic?: string;

  @IsOptional()
  @IsIn(SURFACES as unknown as string[])
  surface?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceName?: string;
}

export class JoinSessionDto {
  @IsOptional()
  @IsIn(SURFACES as unknown as string[])
  surface?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceName?: string;
}

export class LeaveSessionDto {
  @IsOptional()
  @IsIn(SURFACES as unknown as string[])
  surface?: string;
}

export class HeartbeatDto {
  @IsOptional()
  @IsIn(SURFACES as unknown as string[])
  surface?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  activeTopic?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  confidence?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceName?: string;

  /** Accepted for backwards compatibility with the old heartbeat contract. */
  @IsOptional()
  @IsString()
  sessionId?: string;
}

/**
 * One tick from an agent. Replaces the active -> join -> heartbeat sequence and
 * also returns any due knowledge check and any end-of-session prompt.
 */
export class PulseDto {
  @IsOptional()
  @IsIn(SURFACES as unknown as string[])
  surface?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceName?: string;

  /**
   * The session this agent currently believes it is in. Lets the server tell it
   * the session was ended elsewhere, instead of the agent simply going quiet.
   */
  @IsOptional()
  @IsString()
  knownSessionId?: string;
}

export class AnswerCheckDto {
  @IsString()
  checkId: string;

  @IsString()
  @MaxLength(4000)
  answer: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class SkipCheckDto {
  @IsString()
  checkId: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class EndSessionDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  confidence?: number;

  @IsOptional()
  @IsBoolean()
  generateSummary?: boolean;
}
