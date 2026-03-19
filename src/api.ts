export async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export function fileUrl(recordId: string): string {
  return `/api/attachments/${recordId}/file`;
}

// Service-specific API helpers
export function discordApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`/proxy/discord-ingestor${path}`, init);
}

export function gmailApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`/proxy/gmail-ingestor${path}`, init);
}

export function slackApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`/proxy/slack-ingestor${path}`, init);
}

export function chatgptApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`/proxy/chatgpt-ingestor${path}`, init);
}

export function openclawApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`/proxy/openclaw-ingestor${path}`, init);
}

// Subscription API helpers
export function getSubscriptions(service?: string): Promise<{ subscriptions: Array<Record<string, unknown>> }> {
  const path = service ? `/api/subscriptions/${service}` : '/api/subscriptions';
  return apiFetch(path);
}

export function saveSubscriptions(service: string, items: Array<Record<string, unknown>>): Promise<{ subscriptions: Array<Record<string, unknown>>; count: number }> {
  return apiFetch(`/api/subscriptions/${service}`, {
    method: 'PUT',
    body: JSON.stringify(items),
  });
}

export function toggleSubscription(service: string, channelId: string, body?: Record<string, unknown>): Promise<{ subscription: Record<string, unknown> }> {
  return apiFetch(`/api/subscriptions/${service}/${encodeURIComponent(channelId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body || {}),
  });
}

export function getSyncStatus(service: string): Promise<{ service: string; syncStatus: Array<Record<string, unknown>> }> {
  return apiFetch(`/api/subscriptions/${service}/sync-status`);
}

export interface ServiceConfig {
  [name: string]: { configured: boolean };
}

let cachedConfig: ServiceConfig | null = null;
let configFetchedAt = 0;

export async function getServiceConfig(): Promise<ServiceConfig> {
  if (cachedConfig && Date.now() - configFetchedAt < 60000) return cachedConfig;
  cachedConfig = await apiFetch<ServiceConfig>('/service-config');
  configFetchedAt = Date.now();
  return cachedConfig;
}

// Health check with caching
const healthCache: Record<string, { ok: boolean; ts: number }> = {};

export async function checkHealth(service: string): Promise<boolean> {
  const cached = healthCache[service];
  if (cached && Date.now() - cached.ts < 60000) return cached.ok;
  try {
    // Try /api/health first, fall back to /api/scheduler/status for ingestors that don't have /health
    let res = await fetch(`/proxy/${service}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (res.status === 404) res = await fetch(`/proxy/${service}/api/status`, { signal: AbortSignal.timeout(5000) });
    if (res.status === 404) res = await fetch(`/proxy/${service}/api/scheduler/status`, { signal: AbortSignal.timeout(5000) });
    const ok = res.ok;
    healthCache[service] = { ok, ts: Date.now() };
    return ok;
  } catch {
    // Try /api/status as fallback
    try {
      const res = await fetch(`/proxy/${service}/api/status`, { signal: AbortSignal.timeout(5000) });
      const ok = res.ok;
      healthCache[service] = { ok, ts: Date.now() };
      return ok;
    } catch {
      healthCache[service] = { ok: false, ts: Date.now() };
      return false;
    }
  }
}
