/**
 * The surfaces a learning session can span.
 *
 * `source` on learning events was previously a free-form string with values
 * invented independently by each agent ('desktop', 'browser', 'ide', 'web').
 * These are now the canonical set, shared by the API, the agents and the UI.
 */
export const SURFACES = ['web', 'desktop', 'browser', 'ide'] as const;

export type Surface = (typeof SURFACES)[number];

export function isSurface(value: unknown): value is Surface {
  return typeof value === 'string' && (SURFACES as readonly string[]).includes(value);
}

/** Human labels, used in the UI and in device names. */
export const SURFACE_LABEL: Record<Surface, string> = {
  web: 'Web',
  desktop: 'Desktop agent',
  browser: 'Browser',
  ide: 'Editor',
};

/**
 * Which permission gates each surface. A unified start only activates the
 * surfaces the learner has consented to — the permission rows existed before
 * but nothing ever read them.
 */
export const SURFACE_PERMISSION: Record<Surface, string | null> = {
  web: null, // the learner is by definition present on the web app
  desktop: 'screenContext',
  browser: 'browser',
  ide: 'ide',
};

/** Session lifecycle states. Previously an unconstrained varchar. */
export const SESSION_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

/** Participant liveness. */
export const PARTICIPANT_STATUS = {
  /** Joined and reporting. */
  LIVE: 'live',
  /** Joined but has not reported within STALE_AFTER_MS. */
  IDLE: 'idle',
  /** Explicitly left, or the session ended. */
  LEFT: 'left',
} as const;

/**
 * A participant that has not sent a heartbeat in this long is considered idle.
 * Agents sync on a 30s tick, so this allows two missed beats.
 */
export const STALE_AFTER_MS = 90_000;

/**
 * Sessions with no heartbeat from any surface for this long are closed by the
 * reaper. Without this, a crashed agent leaves an 'active' session forever and
 * every later event attaches to it.
 */
export const ABANDON_AFTER_MS = 30 * 60_000;

/** Realtime event names for the session control plane. */
export const SESSION_EVENTS = {
  STARTED: 'session:started',
  ENDED: 'session:ended',
  PAUSED: 'session:paused',
  RESUMED: 'session:resumed',
  PARTICIPANTS: 'session:participants',
  CHECK: 'session:check',
} as const;

/**
 * How often to interrupt with a knowledge check during a session.
 *
 * One shared cadence, owned by the server. Each surface previously had its own
 * timer on its own scale (10 minutes, 5 minutes idle, 60 seconds of dwell), so
 * the learner's experience depended on which app happened to be in front.
 */
export const DEFAULT_CHECK_INTERVAL_SECONDS = 60;

/** Floor, so a bad stored value cannot turn the check into a popup loop. */
export const MIN_CHECK_INTERVAL_SECONDS = 20;

/**
 * How often agents should poll the pulse endpoint, in seconds.
 *
 * This has to be meaningfully shorter than the check interval, otherwise a
 * check comes due and sits unclaimed until the next tick. At 30s (the old sync
 * tick) a 60s check would land up to half a minute late.
 */
export const PULSE_INTERVAL_SECONDS = 10;
