import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { SessionParticipantEntity } from '../../entities/session-participant.entity';
import { PermissionEntity } from '../../entities/permission.entity';
import { DeviceEntity } from '../../entities/device.entity';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  ABANDON_AFTER_MS,
  DEFAULT_CHECK_INTERVAL_SECONDS,
  PARTICIPANT_STATUS,
  PULSE_INTERVAL_SECONDS,
  SESSION_EVENTS,
  SESSION_STATUS,
  STALE_AFTER_MS,
  SURFACES,
  SURFACE_LABEL,
  SURFACE_PERMISSION,
  Surface,
  isSurface,
} from './session.constants';
import { SessionCheck, SessionCheckService } from './session-check.service';

export interface SessionView {
  id: string;
  topic: string;
  subtopic?: string | null;
  status: string;
  mode: string;
  initiatedBy: string;
  startedAt: Date;
  endedAt?: Date | null;
  pausedAt?: Date | null;
  elapsedSeconds: number;
  participants: {
    surface: string;
    label: string;
    status: string;
    deviceName?: string | null;
    joinedAt: Date;
    lastSeenAt: Date;
    eventCount: number;
  }[];
  /** Surfaces the learner has enabled and could therefore join. */
  eligibleSurfaces: string[];
  /** Enabled surfaces that have not joined yet. */
  awaitingSurfaces: string[];
  /**
   * Surfaces that cannot capture because the learner has not granted the
   * matching permission, with the setting that would enable each. The UI shows
   * this instead of leaving the agent mysteriously idle.
   */
  blockedSurfaces: { surface: string; label: string; permission: string }[];
  /** Seconds between knowledge checks, so a client can show the cadence. */
  checkIntervalSeconds: number;
  /** Seconds until the next check, or null when none is scheduled. */
  nextCheckInSeconds: number | null;
  /** How many checks have been issued this session. */
  checkCount: number;
}

/**
 * A finished session, described for a surface that was still attached to it.
 * Lets an agent explain why it stopped instead of appearing to have crashed.
 */
export interface EndedSessionSummary {
  id: string;
  topic: string;
  elapsedSeconds: number;
  checkCount: number;
  reason: string;
  /** A short end-of-session check — questions to answer, not just info. */
  quiz: EndOfSessionQuiz | null;
}

/** One or two questions generated as the session closes, so the learner is
 *  tested on what they claim to have studied before it fades from memory. */
export interface EndOfSessionQuiz {
  id: string;
  questions: { id: string; text: string; type: string }[];
  topic: string;
}

/**
 * Owns the lifecycle of a shared, cross-surface learning session.
 *
 * The rules that make "start once, capture everywhere" work:
 *
 * - There is at most one active session per learner. `start` is idempotent:
 *   calling it from a second surface joins the existing session instead of
 *   creating a rival one. Previously three surfaces meant three active rows and
 *   ingestion silently attached events to whichever started last.
 * - Surfaces join as participants and are announced over the realtime channel,
 *   so an agent that is already running begins capturing without user action.
 * - Ending the session tells every surface to stop. Previously nothing was
 *   notified, so agents kept capturing and ingestion quietly opened a new
 *   session behind the learner's back.
 * - A session only activates surfaces the learner has permitted.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    @InjectRepository(SessionParticipantEntity)
    private readonly participantRepo: Repository<SessionParticipantEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
    private readonly realtime: RealtimeGateway,
    private readonly checks: SessionCheckService,
  ) {}

  // --------------------------------------------------------------- lifecycle

  /**
   * Start a session, or join the one already running.
   *
   * @returns the session view plus whether it was newly created.
   */
  async start(
    userId: string,
    input: {
      topic: string;
      subtopic?: string;
      surface?: string;
      deviceId?: string;
      deviceName?: string;
    },
  ): Promise<{ session: SessionView; created: boolean }> {
    const surface = this.normaliseSurface(input.surface);

    // Pressing "Start session" inside a surface IS consent for that surface.
    //
    // Treating it otherwise produced the worst possible outcome: the learner
    // opened the desktop agent, pressed start, and the desktop was the one
    // surface that could not record — because screenContext defaults to off.
    // Every other surface joined and the thing they were looking at stayed
    // dead. A deliberate action in an app the learner installed and signed
    // into is the clearest consent signal available, so we honour it and
    // persist it, which also means the agent keeps working next time.
    //
    // Note this only applies to `start`. A background `join` is not consent,
    // so agents polling in the background can never grant themselves access.
    await this.grantSurfacePermission(userId, surface);

    const permitted = await this.isSurfacePermitted(userId, surface);
    const existing = await this.findActive(userId);

    if (existing) {
      // Idempotent: a second surface hitting start joins rather than competing.
      if (permitted) await this.joinInternal(existing, userId, surface, input);
      const view = await this.toView(existing);
      this.realtime.notifyUser(userId, SESSION_EVENTS.PARTICIPANTS, view);
      return { session: view, created: false };
    }

    const now = new Date();
    const draft = this.sessionRepo.create({
      userId,
      topic: input.topic?.trim() || 'Learning session',
      subtopic: input.subtopic,
      startTime: now,
      status: SESSION_STATUS.ACTIVE,
      initiatedBy: surface,
      mode: 'solo',
      lastHeartbeatAt: now,
    });

    // Arm the recurring knowledge check from the moment the session begins.
    this.checks.scheduleFirst(draft, now);

    const session = await this.sessionRepo.save(draft);

    if (permitted) {
      await this.joinInternal(session, userId, surface, input);
    } else {
      this.logger.warn(
        `Session ${session.id} started from ${surface}, but that surface is not permitted so it will not capture`,
      );
    }

    const view = await this.toView(session);

    // Tell every connected surface to begin capturing. Agents that are running
    // pick this up and start without the learner touching them.
    this.realtime.notifyUser(userId, SESSION_EVENTS.STARTED, view);

    this.logger.log(`Session ${session.id} started from ${surface} for user ${userId}`);
    return { session: view, created: true };
  }

  /** The learner's current session, or null. */
  async getActive(userId: string): Promise<SessionView | null> {
    const session = await this.findActive(userId);
    if (!session) return null;
    return this.toView(session);
  }

  /**
   * A surface announces it is participating. Safe to call repeatedly — agents
   * call this on every sync tick to self-heal after a restart.
   */
  async join(
    userId: string,
    input: { surface?: string; deviceId?: string; deviceName?: string },
  ): Promise<SessionView | null> {
    const session = await this.findActive(userId);
    if (!session) return null;

    const surface = this.normaliseSurface(input.surface);

    if (!(await this.isSurfacePermitted(userId, surface))) {
      this.logger.warn(`Surface ${surface} blocked by permissions for user ${userId}`);
      return null;
    }

    await this.joinInternal(session, userId, surface, input);
    const view = await this.toView(session);
    this.realtime.notifyUser(userId, SESSION_EVENTS.PARTICIPANTS, view);
    return view;
  }

  /**
   * The single call an agent makes on its tick.
   *
   * Replaces the three-request dance of active -> join -> heartbeat, and adds
   * the two things agents could not previously learn: whether a knowledge check
   * is due for them to present, and whether the session was ended somewhere
   * else so they should show the wrap-up. Agents used to just fall silent.
   */
  async pulse(
    userId: string,
    input: {
      surface?: string;
      deviceId?: string;
      deviceName?: string;
      /** The session this agent believes it is in, to detect an end elsewhere. */
      knownSessionId?: string;
    },
  ): Promise<{
    session: SessionView | null;
    check: SessionCheck | null;
    endedSession: EndedSessionSummary | null;
    pulseIntervalSeconds: number;
  }> {
    const surface = this.normaliseSurface(input.surface);
    const session = await this.findActiveOrPaused(userId);

    // Nothing running. If this agent thought it was in a session, that session
    // ended elsewhere and the agent should tell the learner rather than going
    // quiet — which is exactly what it did before.
    if (!session) {
      const ended = input.knownSessionId
        ? await this.describeEnded(userId, input.knownSessionId)
        : null;

      return {
        session: null,
        check: null,
        endedSession: ended,
        pulseIntervalSeconds: PULSE_INTERVAL_SECONDS,
      };
    }

    // A surface the learner switched off must not be quietly re-added.
    const permitted = await this.isSurfacePermitted(userId, surface);
    if (permitted) {
      await this.joinInternal(session, userId, surface, input);
      session.lastHeartbeatAt = new Date();
      await this.sessionRepo.save(session);
    }

    // Only a surface that is genuinely capturing should be asked to interrupt
    // the learner. Claim is atomic, so exactly one surface wins each round.
    const check =
      permitted && session.status === SESSION_STATUS.ACTIVE
        ? await this.checks.claim(userId, session, surface)
        : null;

    const view = await this.toView(session);
    if (check) this.realtime.notifySurface(userId, surface, SESSION_EVENTS.CHECK, check);

    return {
      session: view,
      check,
      endedSession: null,
      pulseIntervalSeconds: PULSE_INTERVAL_SECONDS,
    };
  }

  /**
   * Describe a session that has already finished, so an agent can show a
   * wrap-up prompt for it exactly once.
   */
  private async describeEnded(
    userId: string,
    sessionId: string,
  ): Promise<EndedSessionSummary | null> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId, userId } });
    if (!session) return null;
    if (session.status === SESSION_STATUS.ACTIVE || session.status === SESSION_STATUS.PAUSED) {
      return null;
    }

    const endedAt = session.endTime ? new Date(session.endTime) : new Date();
    const elapsedSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - new Date(session.startTime).getTime()) / 1000),
    );

    // Generate a short end-of-session quiz. This is the "pop-up when you stop"
    // that the user expects: real questions to check retention, not just a
    // static summary card. Quick enough to run inline because the mock provider
    // responds instantly and even the real provider is fast for 2 questions.
    let quiz: EndOfSessionQuiz | null = null;
    try {
      quiz = await this.generateEndOfSessionQuiz(userId, session);
    } catch (err: any) {
      this.logger.warn(`Could not generate end-of-session quiz: ${err?.message}`);
    }

    return {
      id: session.id,
      topic: session.topic,
      elapsedSeconds,
      checkCount: session.checkCount ?? 0,
      reason: session.endedReason || 'user',
      quiz,
    };
  }

  /**
   * Build 2 quick questions for the end-of-session popup.
   *
   * These are structured identically to a regular session check so the same
   * answer/skip endpoints grade them, and the same per-surface UI shows them.
   * The only difference is that they are generated at end-time and bundled
   * into the pulse response rather than claimed on a timer.
   */
  private async generateEndOfSessionQuiz(
    userId: string,
    session: LearningSessionEntity,
  ): Promise<EndOfSessionQuiz> {
    const questions: { id: string; text: string; type: string }[] = [];

    // Generate two questions, falling back to canned ones on failure.
    for (let i = 0; i < 2; i++) {
      const check = await this.checks.generate(userId, session, 'web' as Surface);
      questions.push({ id: check.id, text: check.question, type: check.type });
    }

    return {
      id: `eosq_${session.id.slice(0, 8)}`,
      questions,
      topic: session.topic,
    };
  }

  /** Active, or paused — both are sessions the learner still considers open. */
  private async findActiveOrPaused(userId: string): Promise<LearningSessionEntity | null> {
    return (
      (await this.findActive(userId)) ??
      (await this.sessionRepo.findOne({
        where: { userId, status: SESSION_STATUS.PAUSED },
        order: { startTime: 'DESC' },
      }))
    );
  }

  /** A surface stops participating without ending the session for everyone. */
  async leave(userId: string, surfaceInput?: string): Promise<SessionView | null> {
    const session = await this.findActive(userId);
    if (!session) return null;

    const surface = this.normaliseSurface(surfaceInput);
    await this.participantRepo.update(
      { sessionId: session.id, surface },
      { status: PARTICIPANT_STATUS.LEFT, leftAt: new Date() },
    );

    const view = await this.toView(session);
    this.realtime.notifyUser(userId, SESSION_EVENTS.PARTICIPANTS, view);
    return view;
  }

  /**
   * Keep the session and the calling surface alive.
   *
   * The heartbeat endpoint existed before but nothing called it and it recorded
   * no liveness — so there was no way to know which agents were actually running.
   */
  async heartbeat(
    userId: string,
    input: {
      surface?: string;
      activeTopic?: string;
      confidence?: number;
      deviceId?: string;
      deviceName?: string;
    },
  ): Promise<SessionView | null> {
    const session = await this.findActive(userId);
    if (!session) return null;

    const surface = this.normaliseSurface(input.surface);
    const now = new Date();

    session.lastHeartbeatAt = now;
    if (input.activeTopic?.trim()) session.topic = input.activeTopic.trim();
    if (typeof input.confidence === 'number') session.confidence = input.confidence;
    await this.sessionRepo.save(session);

    await this.participantRepo.update(
      { sessionId: session.id, surface },
      { lastSeenAt: now, status: PARTICIPANT_STATUS.LIVE },
    );

    await this.touchDevice(userId, surface, input.deviceId, input.deviceName);

    // Returning the whole view makes one heartbeat enough for a client to both
    // report liveness and refresh what it shows. Returning only {status} meant
    // every poller needed a second request to stay accurate.
    return this.toView(session);
  }

  async pause(userId: string): Promise<SessionView | null> {
    const session = await this.findActive(userId);
    if (!session) return null;

    session.status = SESSION_STATUS.PAUSED;
    session.pausedAt = new Date();
    await this.sessionRepo.save(session);

    const view = await this.toView(session);
    this.realtime.notifyUser(userId, SESSION_EVENTS.PAUSED, view);
    return view;
  }

  async resume(userId: string): Promise<SessionView | null> {
    const session = await this.sessionRepo.findOne({
      where: { userId, status: SESSION_STATUS.PAUSED },
      order: { startTime: 'DESC' },
    });
    if (!session) return null;

    session.status = SESSION_STATUS.ACTIVE;
    session.pausedAt = null;
    session.lastHeartbeatAt = new Date();
    await this.sessionRepo.save(session);

    const view = await this.toView(session);
    this.realtime.notifyUser(userId, SESSION_EVENTS.RESUMED, view);
    return view;
  }

  /** End the session everywhere. */
  async end(
    userId: string,
    input: { sessionId?: string; confidence?: number; reason?: string } = {},
  ): Promise<{ session: SessionView; quiz: EndOfSessionQuiz | null }> {
    const session = input.sessionId
      ? await this.sessionRepo.findOne({ where: { id: input.sessionId, userId } })
      : ((await this.findActive(userId)) ??
        (await this.sessionRepo.findOne({
          where: { userId, status: SESSION_STATUS.PAUSED },
          order: { startTime: 'DESC' },
        })));

    if (!session) throw new NotFoundException('No session to end');

    const now = new Date();
    session.endTime = now;
    session.status = SESSION_STATUS.COMPLETED;
    session.endedReason = input.reason ?? 'user';
    session.duration = Math.max(
      0,
      Math.round((now.getTime() - new Date(session.startTime).getTime()) / 1000),
    );
    if (typeof input.confidence === 'number') session.confidence = input.confidence;
    await this.sessionRepo.save(session);

    await this.participantRepo.update(
      { sessionId: session.id, status: In([PARTICIPANT_STATUS.LIVE, PARTICIPANT_STATUS.IDLE]) },
      { status: PARTICIPANT_STATUS.LEFT, leftAt: now },
    );

    // Generate the end-of-session quiz BEFORE building the view, so the
    // surface that pressed End gets the questions immediately in this response
    // rather than needing another pulse to discover them.
    let quiz: EndOfSessionQuiz | null = null;
    try {
      quiz = await this.generateEndOfSessionQuiz(userId, session);
    } catch (err: any) {
      this.logger.warn(`Could not generate end-of-session quiz: ${err?.message}`);
    }

    const view = await this.toView(session);

    // Every surface must stop capturing, otherwise ingestion opens a new session.
    this.realtime.notifyUser(userId, SESSION_EVENTS.ENDED, view);

    this.logger.log(`Session ${session.id} ended (${session.endedReason})`);
    return { session: view, quiz };
  }

  /**
   * Close sessions nothing has reported to in a long time.
   *
   * Called by the reaper cron. Without it a crashed agent leaves an active
   * session that silently absorbs every subsequent event.
   */
  async reapAbandoned(): Promise<number> {
    const cutoff = new Date(Date.now() - ABANDON_AFTER_MS);

    const stale = await this.sessionRepo.find({
      where: [
        { status: SESSION_STATUS.ACTIVE, lastHeartbeatAt: LessThan(cutoff) },
        { status: SESSION_STATUS.PAUSED, lastHeartbeatAt: LessThan(cutoff) },
      ],
      take: 200,
    });

    for (const session of stale) {
      try {
        await this.end(session.userId, { sessionId: session.id, reason: 'abandoned' });
      } catch (err: any) {
        this.logger.warn(`Could not reap session ${session.id}: ${err?.message}`);
      }
    }

    return stale.length;
  }

  /**
   * The session an incoming event belongs to.
   *
   * Ingestion calls this instead of inventing sessions. It only ever attaches to
   * a genuinely active session; when there is none the event is stored without
   * one rather than silently starting a session the learner never began.
   */
  async findActive(userId: string): Promise<LearningSessionEntity | null> {
    return this.sessionRepo.findOne({
      where: { userId, status: SESSION_STATUS.ACTIVE },
      order: { startTime: 'DESC' },
    });
  }

  /** Note that a surface produced events, for the live/idle display. */
  async recordSurfaceActivity(
    sessionId: string,
    surface: string,
    count: number,
  ): Promise<void> {
    if (!isSurface(surface) || count <= 0) return;

    const participant = await this.participantRepo.findOne({ where: { sessionId, surface } });
    if (!participant) return;

    participant.eventCount += count;
    participant.lastSeenAt = new Date();
    participant.status = PARTICIPANT_STATUS.LIVE;
    await this.participantRepo.save(participant);
  }

  // --------------------------------------------------------------- internals

  private normaliseSurface(value?: string): Surface {
    return isSurface(value) ? value : 'web';
  }

  /** Has the learner allowed capture from this surface? */
  private async isSurfacePermitted(userId: string, surface: Surface): Promise<boolean> {
    const key = SURFACE_PERMISSION[surface];
    if (!key) return true;

    const permissions = await this.permissionRepo.findOne({ where: { userId } });
    // No row yet means defaults, which enable browser and ide but not screen context.
    if (!permissions) return key !== 'screenContext';

    return Boolean((permissions as unknown as Record<string, boolean>)[key]);
  }

  /**
   * Record that the learner has allowed capture from this surface.
   *
   * Called only when a session is started *from* that surface, which is an
   * explicit action inside an app the learner installed and signed into. It is
   * persisted rather than applied for one session so the agent keeps working
   * afterwards instead of asking again every time.
   */
  private async grantSurfacePermission(userId: string, surface: Surface): Promise<void> {
    const key = SURFACE_PERMISSION[surface];
    if (!key) return; // the web surface needs no permission

    try {
      const permissions =
        (await this.permissionRepo.findOne({ where: { userId } })) ??
        this.permissionRepo.create({ userId });

      const record = permissions as unknown as Record<string, boolean>;
      if (record[key] === true) return; // already allowed, nothing to write

      record[key] = true;
      await this.permissionRepo.save(permissions);
      this.logger.log(`Granted "${key}" for user ${userId} (session started from ${surface})`);
    } catch (err: any) {
      // Never fail starting a session over permission bookkeeping. The surface
      // simply stays blocked and the UI explains why.
      this.logger.warn(`Could not grant "${key}" for ${surface}: ${err?.message}`);
    }
  }

  private async joinInternal(
    session: LearningSessionEntity,
    userId: string,
    surface: Surface,
    input: { deviceId?: string; deviceName?: string },
  ): Promise<void> {
    const now = new Date();
    const existing = await this.participantRepo.findOne({
      where: { sessionId: session.id, surface },
    });

    if (existing) {
      existing.status = PARTICIPANT_STATUS.LIVE;
      existing.lastSeenAt = now;
      existing.leftAt = null;
      if (input.deviceId) existing.deviceId = input.deviceId;
      if (input.deviceName) existing.deviceName = input.deviceName;
      await this.participantRepo.save(existing);
    } else {
      await this.participantRepo.save(
        this.participantRepo.create({
          sessionId: session.id,
          userId,
          surface,
          deviceId: input.deviceId ?? null,
          deviceName: input.deviceName ?? SURFACE_LABEL[surface],
          status: PARTICIPANT_STATUS.LIVE,
          joinedAt: now,
          lastSeenAt: now,
        }),
      );
    }

    // Once a second surface is in, the session is genuinely multi-surface.
    const liveCount = await this.participantRepo.count({
      where: { sessionId: session.id, status: PARTICIPANT_STATUS.LIVE },
    });
    const nextMode = liveCount > 1 ? 'multi' : 'solo';
    if (session.mode !== nextMode || session.lastHeartbeatAt === null) {
      session.mode = nextMode;
      session.lastHeartbeatAt = now;
      await this.sessionRepo.save(session);
    }

    await this.touchDevice(userId, surface, input.deviceId, input.deviceName);
  }

  /**
   * Register/refresh the device row for this surface.
   *
   * The devices table existed but nothing ever wrote to it, so the settings page
   * always showed "no devices" even with agents running.
   */
  private async touchDevice(
    userId: string,
    surface: Surface,
    rawDeviceId?: string | null,
    deviceName?: string,
  ): Promise<void> {
    // Fall back to a per-surface identifier. The web app and the editor
    // extension have no natural machine id, so gating on a supplied deviceId
    // left them out of the devices list entirely — the very problem this was
    // meant to fix. One row per surface is the honest minimum.
    const deviceId = rawDeviceId?.trim() || `${surface}-default`;

    try {
      const existing = await this.deviceRepo.findOne({ where: { userId, deviceId } });
      if (existing) {
        existing.lastActiveAt = new Date();
        existing.active = true;
        if (deviceName) existing.deviceName = deviceName;
        await this.deviceRepo.save(existing);
        return;
      }

      await this.deviceRepo.save(
        this.deviceRepo.create({
          userId,
          deviceId,
          deviceName: deviceName || SURFACE_LABEL[surface],
          platform: surface,
          active: true,
          lastActiveAt: new Date(),
        }),
      );
    } catch (err: any) {
      // Device bookkeeping is not worth failing a session join over.
      this.logger.warn(`Could not record device for ${surface}: ${err?.message}`);
    }
  }

  private async toView(session: LearningSessionEntity): Promise<SessionView> {
    const participants = await this.participantRepo.find({
      where: { sessionId: session.id },
      order: { joinedAt: 'ASC' },
    });

    const now = Date.now();
    const stale = now - STALE_AFTER_MS;

    // Derive idle from last-seen rather than trusting a stored flag.
    const shaped = participants.map((p) => {
      const lastSeen = new Date(p.lastSeenAt).getTime();
      const status =
        p.status === PARTICIPANT_STATUS.LEFT
          ? PARTICIPANT_STATUS.LEFT
          : lastSeen < stale
            ? PARTICIPANT_STATUS.IDLE
            : PARTICIPANT_STATUS.LIVE;

      return {
        surface: p.surface,
        label: SURFACE_LABEL[p.surface as Surface] ?? p.surface,
        status,
        deviceName: p.deviceName,
        joinedAt: p.joinedAt,
        lastSeenAt: p.lastSeenAt,
        eventCount: p.eventCount,
      };
    });

    const eligible: string[] = [];
    const blocked: { surface: string; label: string; permission: string }[] = [];
    for (const surface of SURFACES) {
      if (await this.isSurfacePermitted(session.userId, surface)) {
        eligible.push(surface);
      } else {
        blocked.push({
          surface,
          label: SURFACE_LABEL[surface],
          permission: SURFACE_PERMISSION[surface] ?? '',
        });
      }
    }

    const joined = new Set(
      shaped.filter((p) => p.status !== PARTICIPANT_STATUS.LEFT).map((p) => p.surface),
    );

    const endedAt = session.endTime ? new Date(session.endTime) : null;
    const elapsedSeconds = Math.max(
      0,
      Math.round(
        ((endedAt ? endedAt.getTime() : now) - new Date(session.startTime).getTime()) / 1000,
      ),
    );

    return {
      id: session.id,
      topic: session.topic,
      subtopic: session.subtopic,
      status: session.status,
      mode: session.mode,
      initiatedBy: session.initiatedBy,
      startedAt: session.startTime,
      endedAt,
      pausedAt: session.pausedAt,
      elapsedSeconds,
      participants: shaped,
      eligibleSurfaces: eligible,
      awaitingSurfaces: eligible.filter((s) => !joined.has(s)),
      blockedSurfaces: blocked,
      checkIntervalSeconds: session.checkIntervalSeconds ?? DEFAULT_CHECK_INTERVAL_SECONDS,
      nextCheckInSeconds: session.nextCheckAt
        ? Math.max(0, Math.round((session.nextCheckAt.getTime() - now) / 1000))
        : null,
      checkCount: session.checkCount ?? 0,
    };
  }
}
