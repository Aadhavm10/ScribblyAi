import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, route } = request;
    const path = route?.path || request.path || 'unknown';
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const duration = (Date.now() - startTime) / 1000;
          const status = response.statusCode;

          this.metricsService.httpRequestsTotal.inc({
            method,
            path,
            status: String(status),
          });

          this.metricsService.httpRequestDuration.observe(
            { method, path, status: String(status) },
            duration,
          );
        },
        error: (err) => {
          const duration = (Date.now() - startTime) / 1000;
          const status = err.status || 500;

          this.metricsService.httpRequestErrors.inc({
            method,
            path,
            status: String(status),
          });

          this.metricsService.httpRequestDuration.observe(
            { method, path, status: String(status) },
            duration,
          );
        },
      }),
    );
  }
}
