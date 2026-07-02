import type { Request, Response } from 'express';
import { config } from './config';
import { logger } from './logger';
import type { AuthContext } from './types';

export interface HealthRouteOptions {
  serviceName: string;
  buildUrl: () => string;
  buildHeaders: (auth: AuthContext) => Record<string, string>;
  // Defaults to HTTP-level success; override for services that signal
  // failure inside a 200 body.
  isHealthy?: (res: globalThis.Response, parsed: unknown) => boolean;
}

export function createHealthRoute(options: HealthRouteOptions) {
  const { serviceName, buildUrl, buildHeaders } = options;
  const isHealthy = options.isHealthy ?? ((res) => res.ok);

  return async (req: Request, res: Response): Promise<void> => {
    const auth = req.authContext!;

    try {
      const upstreamRes = await fetch(buildUrl(), {
        method: 'GET',
        headers: buildHeaders(auth),
      });

      const text = await upstreamRes.text().catch(() => '');
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* not json */ }

      if (!isHealthy(upstreamRes, parsed)) {
        const summary = `${serviceName} access could not be verified`;
        logger.warn(`${serviceName} health check failed`, {
          status: upstreamRes.status,
          statusText: upstreamRes.statusText,
          upstreamCode: parsed?.code,
        });

        if (config.authDebugResponses) {
          res.status(200).json({
            ok: false,
            message: summary,
            diagnostics: {
              status: upstreamRes.status,
              statusText: upstreamRes.statusText,
              upstreamMessage: parsed?.msg || parsed?.message || undefined,
              upstreamCode: parsed?.code !== undefined ? String(parsed.code) : undefined,
            },
          });
        } else {
          res.status(200).json({ ok: false, message: summary });
        }
        return;
      }

      logger.info(`${serviceName} health check passed`);
      res.json({ ok: true, message: `${serviceName} connection verified` });
    } catch (err: any) {
      logger.error(`${serviceName} health check connection error`, { error: err.message });
      const summary = `Could not reach ${serviceName} service`;
      if (config.authDebugResponses) {
        res.status(200).json({
          ok: false,
          message: summary,
          diagnostics: { error: err.message },
        });
      } else {
        res.status(200).json({ ok: false, message: summary });
      }
    }
  };
}

// The four dashboard health checks. Adding a service = adding an entry here.
export function buildHealthRoutes() {
  return [
    {
      path: '/api/wms/health',
      handler: createHealthRoute({
        serviceName: 'WMS',
        buildUrl: () => `${config.wms.baseUrl}/wms-bam/employee/check-bind-code`,
        buildHeaders: (auth) => ({
          'Authorization': `Bearer ${auth.token}`,
          'x-tenant-id': auth.tenantId,
          'Content-Type': 'application/json',
        }),
      }),
    },
    {
      path: '/api/yms/health',
      handler: createHealthRoute({
        serviceName: 'YMS',
        buildUrl: () => `${config.yms.baseUrl}/task-board/employees/filters`,
        buildHeaders: (auth) => ({
          'Authorization': `Bearer ${auth.token}`,
          'x-tenant-id': auth.tenantId,
          'x-facility-id': auth.facilityId,
          'Item-Time-Zone': config.timezone,
        }),
      }),
    },
    {
      path: '/api/tms/health',
      handler: createHealthRoute({
        serviceName: 'TMS/FMS',
        buildUrl: () => `${config.tms.baseUrl}${config.tms.healthPath}`,
        buildHeaders: (auth) => ({
          'Authorization': `Bearer ${auth.token}`,
          'x-tenant-id': auth.tenantId,
          'x-facility-id': auth.facilityId,
          'Item-Time-Zone': config.timezone,
          'Content-Type': 'application/json',
        }),
        isHealthy: (res, parsed: any) => {
          const appLevelFailed = parsed && typeof parsed === 'object' && (
            parsed.success === false ||
            (typeof parsed.code === 'number' && parsed.code !== 0 && parsed.code !== 200)
          );
          return res.ok && !appLevelFailed;
        },
      }),
    },
    {
      // Ticket /v1/iam/... endpoints use the same IAM bearer token from the
      // user's authenticated session — no separate API key. Auth contract
      // confirmed via Ticket Ontology: GET /v1/iam/ticket/priorities/list
      // (internal, level2).
      path: '/api/ticket/health',
      handler: createHealthRoute({
        serviceName: 'Ticket',
        buildUrl: () => `${config.ticket.baseUrl}/v1/iam/ticket/priorities/list`,
        buildHeaders: (auth) => ({
          'Authorization': `Bearer ${auth.token}`,
          'x-tenant-id': auth.tenantId,
          'User-Agent': 'WISE-Dashboard/1.0',
        }),
        isHealthy: (res, parsed: any) =>
          res.ok &&
          !!parsed && typeof parsed === 'object' &&
          parsed.success === true &&
          parsed.code === 200,
      }),
    },
  ];
}
