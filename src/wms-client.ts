import { config } from './config';
import { logger } from './logger';
import type { AuthContext } from './types';

export interface OrderStatusChangeEvent {
  id: string;
  orderId: string;
  oldStatus: string;
  newStatus: string;
  processStatus: string;
  createdTime: string;
  updatedTime: string;
  tenantId?: string;
}

interface PagingResponse {
  list: OrderStatusChangeEvent[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPage: number;
}

interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
}

async function wmsRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  auth?: AuthContext
): Promise<T> {
  const url = `${config.wms.baseUrl}${path}`;

  const token = auth?.token || config.wms.authToken;
  const tenantId = auth?.tenantId || config.wms.tenantId;
  const facilityId = auth?.facilityId || config.wms.facilityId;

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-tenant-id': tenantId,
      'x-facility-id': facilityId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WMS API ${method} ${path} returned ${res.status}: ${text}`);
  }

  const json = (await res.json()) as ApiResponse<T>;
  if (json.code !== 0) {
    throw new Error(`WMS API error: code=${json.code} message=${json.message}`);
  }

  return json.data;
}

export async function searchStatusChangeEvents(
  page: number = 1,
  auth?: AuthContext
): Promise<PagingResponse> {
  return wmsRequest<PagingResponse>(
    'POST',
    '/wms/outbound/order-status-change-event/search-by-paging',
    {
      currentPage: page,
      pageSize: config.poller.pageSize,
    },
    auth
  );
}

export async function markEventProcessed(eventId: string, auth?: AuthContext): Promise<void> {
  await wmsRequest(
    'PUT',
    '/wms/outbound/order-status-change-event',
    { id: eventId, processStatus: 'PROCESSED' },
    auth
  );
  logger.info(`Marked event ${eventId} as PROCESSED`);
}
