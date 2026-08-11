import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Global error interceptor.
 * In production, this would forward errors to Sentry.
 * 
 * To enable Sentry:
 * 1. pnpm add @sentry/node
 * 2. Set SENTRY_DSN in .env
 * 3. Initialize Sentry in main.ts: Sentry.init({ dsn: process.env.SENTRY_DSN })
 * 4. Replace console.error below with Sentry.captureException(error)
 */
@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        // Don't report expected HTTP errors (4xx)
        if (error instanceof HttpException && error.getStatus() < 500) {
          return throwError(() => error);
        }

        // Log unexpected errors
        const request = context.switchToHttp().getRequest();
        console.error('[ERROR]', {
          message: error.message,
          path: request?.url,
          method: request?.method,
          userId: request?.user?.sub,
          timestamp: new Date().toISOString(),
          stack: error.stack,
        });

        // In production with Sentry:
        // Sentry.captureException(error, { extra: { path, method, userId } });

        return throwError(() => error);
      }),
    );
  }
}
