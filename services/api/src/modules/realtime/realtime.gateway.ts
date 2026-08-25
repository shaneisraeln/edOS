import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { isSurface, Surface } from '../session/session.constants';

interface SocketState {
  userId: string;
  surface: Surface;
}

/**
 * Push channel between the API and every surface.
 *
 * This is the control plane for cross-surface sessions: when a session starts
 * anywhere, the agents learn about it here and begin capturing.
 *
 * Security: the handshake now requires a valid JWT. It previously trusted a
 * `userId` query parameter, so anyone could connect as anyone and receive that
 * user's quizzes, notifications and session events.
 */
@WebSocketGateway({
  cors: {
    // Dev clients arrive from whatever localhost port the web app landed on, and
    // agents connect from tauri:// and chrome-extension:// origins.
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (process.env.NODE_ENV === 'production') {
        return callback(null, origin === (process.env.FRONTEND_URL || 'https://edos.app'));
      }
      return callback(null, true);
    },
    credentials: true,
  },
  namespace: '/ws',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  /** socket.id -> who they are and which surface they represent. */
  private readonly sockets = new Map<string, SocketState>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Rejected socket ${client.id}: no token`);
      client.emit('error', { message: 'Authentication required' });
      client.disconnect(true);
      return;
    }

    let userId: string;
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      userId = String(payload?.sub ?? '');
      if (!userId) throw new Error('token has no subject');
    } catch (err: any) {
      this.logger.warn(`Rejected socket ${client.id}: ${err?.message ?? 'invalid token'}`);
      client.emit('error', { message: 'Invalid token' });
      client.disconnect(true);
      return;
    }

    const rawSurface = client.handshake.query.surface;
    const surface: Surface = isSurface(rawSurface) ? rawSurface : 'web';

    this.sockets.set(client.id, { userId, surface });
    client.join(`user:${userId}`);
    // Per-surface room so the server can target one agent when needed.
    client.join(`user:${userId}:${surface}`);

    this.logger.log(`Socket ${client.id} connected (user ${userId}, surface ${surface})`);
    client.emit('connected', { surface });
  }

  handleDisconnect(client: Socket): void {
    const state = this.sockets.get(client.id);
    this.sockets.delete(client.id);
    if (state) {
      this.logger.log(`Socket ${client.id} disconnected (${state.surface})`);
    }
  }

  /**
   * Read the token from wherever the client could reasonably put it. The Rust
   * agent and the extensions cannot set arbitrary headers as easily as the web
   * app, so auth is accepted in the handshake auth object, a query parameter, or
   * an Authorization header.
   */
  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const fromAuth = auth?.token;
    if (typeof fromAuth === 'string' && fromAuth) return fromAuth.replace(/^Bearer\s+/i, '');

    const fromQuery = client.handshake.query.token;
    if (typeof fromQuery === 'string' && fromQuery) return fromQuery.replace(/^Bearer\s+/i, '');

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header) return header.replace(/^Bearer\s+/i, '');

    return null;
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    const state = this.sockets.get(client.id);
    return { event: 'pong', data: { timestamp: Date.now(), surface: state?.surface } };
  }

  /** Which surfaces currently hold a socket for this user. */
  getConnectedSurfaces(userId: string): Surface[] {
    const surfaces = new Set<Surface>();
    for (const state of this.sockets.values()) {
      if (state.userId === userId) surfaces.add(state.surface);
    }
    return [...surfaces];
  }

  // ------------------------------------------------- outbound to the client

  notifyUser(userId: string, event: string, data: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, data);
  }

  /** Target a single surface, e.g. asking only the desktop agent to do something. */
  notifySurface(userId: string, surface: Surface, event: string, data: unknown): void {
    this.server?.to(`user:${userId}:${surface}`).emit(event, data);
  }

  pushDashboardUpdate(userId: string, update: unknown): void {
    this.notifyUser(userId, 'dashboard:update', update);
  }

  pushGraphUpdate(userId: string, update: unknown): void {
    this.notifyUser(userId, 'graph:update', update);
  }

  pushNotification(userId: string, notification: unknown): void {
    this.notifyUser(userId, 'notification:new', notification);
  }

  pushChallenge(userId: string, challenge: unknown): void {
    this.notifyUser(userId, 'challenge:new', challenge);
  }
}
