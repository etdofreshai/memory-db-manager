const API_URL = (import.meta.env.VITE_MEMORY_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_TOKEN = import.meta.env.VITE_MEMORY_API_TOKEN || '';

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_TOKEN) h['Authorization'] = `Bearer ${API_TOKEN}`;
  return h;
}

export async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string> || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export function fileUrl(recordId: string): string {
  return `${API_URL}/api/attachments/${recordId}/file?token=${encodeURIComponent(API_TOKEN)}`;
}

export { API_URL, API_TOKEN };
