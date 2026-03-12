import React, { useEffect, useState, useCallback, useRef } from 'react';
import { discordApi } from '../../api';

/* ── Types ─────────────────────────────────────────────── */

interface ChannelInfo {
  channelName: string;
  guildId?: string | null;
  guildName?: string | null;
}

interface BackfillRun {
  runId: string;
  channelId?: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  attachmentMode?: string;
  stats?: {
    totalMessages?: number;
    messagesWithAttachments?: number;
    downloadedAttachments?: number;
    ingestedAttachments?: number;
    skipped?: number;
    errors?: number;
  };
}

interface SyncRun {
  id: string;
  runId?: string;
  jobId: string;
  channel?: string;
  channelId?: string;
  channelName?: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  completedAt?: string;
  insertedCount?: number;
  fetchedCount?: number;
  messagesIngested?: number;
  errors?: number;
}

interface UnifiedJob {
  id: string;
  type: 'Backfill' | 'Sync' | 'Queued';
  channelId?: string;
  channelName: string;
  serverName: string;
  status: string;
  queuedAt?: string;
  startedAt: string;
  completedAt?: string;
  duration: string;
  messages: number;
  errors: number;
  progress?: string;
  canCancel: boolean;
  canPause: boolean;
  raw: any;
}

/* ── Helpers ───────────────────────────────────────────── */

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function durationStr(start: string, end?: string): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'running' || s === 'in_progress') return '#22c55e';
  if (s === 'completed' || s === 'success') return '#3b82f6';
  if (s === 'failed' || s === 'error') return '#ef4444';
  if (s === 'paused') return '#f59e0b';
  if (s === 'cancelled' || s === 'canceled') return '#6b7280';
  if (s === 'queued' || s === 'pending') return '#f59e0b';
  return '#9ca3af';
}

function typeBadge(type: string) {
  const colors: Record<string, { bg: string; fg: string }> = {
    Backfill: { bg: '#1e3a5f', fg: '#60a5fa' },
    Sync: { bg: '#14532d', fg: '#4ade80' },
    Queued: { bg: '#78350f', fg: '#fbbf24' },
  };
  const c = colors[type] || { bg: '#374151', fg: '#9ca3af' };
  return (
    <span style={{ background: c.bg, color: c.fg, padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
      {type}
    </span>
  );
}

/* ── Component ─────────────────────────────────────────── */

export default function DiscordJobs() {
  const [channels, setChannels] = useState<Record<string, ChannelInfo>>({});
  const [activeJobs, setActiveJobs] = useState<UnifiedJob[]>([]);
  const [recentJobs, setRecentJobs] = useState<UnifiedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resolveChannel = useCallback((channelId: string | undefined, chMap: Record<string, ChannelInfo>) => {
    if (!channelId) return { name: '—', server: '' };
    const ch = chMap[channelId];
    return ch ? { name: ch.channelName, server: ch.guildName || '' } : { name: channelId.slice(0, 8) + '…', server: '' };
  }, []);

  const normalizeBackfill = useCallback((r: BackfillRun, chMap: Record<string, ChannelInfo>): UnifiedJob => {
    const ch = resolveChannel(r.channelId, chMap);
    const isActive = ['running', 'paused'].includes(r.status?.toLowerCase());
    const msgs = r.stats?.totalMessages || r.stats?.downloadedAttachments || 0;
    return {
      id: r.runId,
      type: 'Backfill',
      channelId: r.channelId,
      channelName: ch.name,
      serverName: ch.server,
      status: r.status,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      duration: durationStr(r.startedAt, r.completedAt),
      messages: msgs,
      errors: r.stats?.errors || 0,
      canCancel: isActive,
      canPause: r.status?.toLowerCase() === 'running',
      raw: r,
    };
  }, [resolveChannel]);

  const normalizeSyncRun = useCallback((r: SyncRun, chMap: Record<string, ChannelInfo>): UnifiedJob => {
    const chId = r.channel || r.channelId;
    const ch = r.channelName ? { name: r.channelName, server: chMap[chId || '']?.guildName || '' } : resolveChannel(chId, chMap);
    const isActive = ['running', 'in_progress'].includes(r.status?.toLowerCase());
    const finished = r.finishedAt || r.completedAt;
    return {
      id: r.runId || r.id,
      type: 'Sync',
      channelId: chId,
      channelName: ch.name,
      serverName: ch.server,
      status: r.status,
      startedAt: r.startedAt,
      completedAt: finished,
      duration: durationStr(r.startedAt, finished),
      messages: r.insertedCount || r.fetchedCount || r.messagesIngested || 0,
      errors: r.errors || 0,
      canCancel: isActive,
      canPause: false,
      raw: r,
    };
  }, [resolveChannel]);

  const fetchData = useCallback(async (chMap?: Record<string, ChannelInfo>) => {
    try {
      const cm = chMap || channels;

      const [backfillRes, syncRes, queueRes] = await Promise.allSettled([
        discordApi<any>('/api/backfill/runs?limit=50'),
        discordApi<any>('/api/runs?limit=50'),
        discordApi<any>('/api/backfill/queue'),
      ]);

      const backfillRuns: BackfillRun[] = backfillRes.status === 'fulfilled'
        ? (Array.isArray(backfillRes.value) ? backfillRes.value : backfillRes.value?.runs || [])
        : [];

      const syncRuns: SyncRun[] = syncRes.status === 'fulfilled'
        ? (Array.isArray(syncRes.value) ? syncRes.value : syncRes.value?.runs || [])
        : [];

      const queueItems: any[] = queueRes.status === 'fulfilled'
        ? (Array.isArray(queueRes.value) ? queueRes.value : queueRes.value?.queue || [])
        : [];

      // Normalize all
      const allBackfill = backfillRuns.map(r => normalizeBackfill(r, cm));
      const allSync = syncRuns.map(r => normalizeSyncRun(r, cm));

      const queueJobs: UnifiedJob[] = queueItems.map((q: any, i: number) => {
        const ch = resolveChannel(q.channelId, cm);
        return {
          id: q.id || `queue-${i}`,
          type: 'Queued' as const,
          channelId: q.channelId,
          channelName: ch.name,
          serverName: ch.server,
          status: 'queued',
          queuedAt: q.addedAt || q.queuedAt,
          startedAt: q.addedAt || new Date().toISOString(),
          duration: '—',
          messages: 0,
          errors: 0,
          canCancel: true,
          canPause: false,
          raw: q,
        };
      });

      // Split active vs recent
      const activeStatuses = ['running', 'paused', 'in_progress', 'queued', 'pending'];
      const active = [...allBackfill, ...allSync, ...queueJobs]
        .filter(j => activeStatuses.includes(j.status?.toLowerCase()))
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

      const recent = [...allBackfill, ...allSync]
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
        .slice(0, 50);

      setActiveJobs(active);
      setRecentJobs(recent);
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, [channels, normalizeBackfill, normalizeSyncRun, resolveChannel]);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const chData = await discordApi<Record<string, ChannelInfo>>('/api/channels');
        setChannels(chData || {});
        await fetchData(chData || {});
      } catch (e: any) {
        setError(e.message);
      }
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 15s when active jobs exist
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (activeJobs.length > 0) {
      timerRef.current = setInterval(() => fetchData(), 15000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeJobs.length, fetchData]);

  const handleCancel = async (job: UnifiedJob) => {
    try {
      if (job.type === 'Backfill') {
        await discordApi(`/api/backfill/pause`, { method: 'POST', body: JSON.stringify({ runId: job.id }) });
      } else if (job.type === 'Queued') {
        await discordApi(`/api/backfill/queue/${job.id}`, { method: 'DELETE' });
      }
      await fetchData();
    } catch (e: any) {
      setError(`Cancel failed: ${e.message}`);
    }
  };

  const handleForceCancel = async (job: UnifiedJob) => {
    try {
      await discordApi(`/api/backfill/runs/${job.id}/force-cancel`, { method: 'POST' });
      await fetchData();
    } catch (e: any) {
      setError(`Force cancel failed: ${e.message}`);
    }
  };

  const isGhostRun = (job: UnifiedJob) =>
    job.type === 'Backfill' && job.status === 'running';

  const handlePause = async (job: UnifiedJob) => {
    try {
      await discordApi(`/api/backfill/pause`, { method: 'POST', body: JSON.stringify({ runId: job.id }) });
      await fetchData();
    } catch (e: any) {
      setError(`Pause failed: ${e.message}`);
    }
  };

  if (loading) return <p style={{ padding: 24, color: '#9ca3af' }}>Loading jobs…</p>;

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>📋 Jobs</h1>
      <p style={{ color: '#9ca3af', margin: '0 0 24px', fontSize: 14 }}>
        All active and recent Discord ingestor jobs — backfill runs, scheduled syncs, and queued items.
      </p>

      {error && (
        <div style={{ background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 8, padding: '8px 12px', marginBottom: 16, color: '#fca5a5', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Active Jobs */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: activeJobs.length ? '#22c55e' : '#6b7280', animation: activeJobs.length ? 'pulse 2s infinite' : 'none' }} />
          Active / In-Progress
          <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 400 }}>({activeJobs.length})</span>
        </h2>

        {activeJobs.length === 0 ? (
          <div style={{ background: '#1f2937', borderRadius: 8, padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
            No active jobs
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeJobs.map(job => (
              <div key={job.id} style={{ background: '#1f2937', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: '1px solid #374151' }}>
                {typeBadge(job.type)}
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontWeight: 500 }}>{job.channelName}</div>
                  {job.serverName && <div style={{ fontSize: 12, color: '#9ca3af' }}>{job.serverName}</div>}
                </div>
                <span style={{ color: statusColor(job.status), fontSize: 13, fontWeight: 600 }}>{job.status}</span>
                {job.messages > 0 && <span style={{ fontSize: 12, color: '#9ca3af' }}>{job.messages} msgs</span>}
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{relativeTime(job.startedAt)}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {job.canPause && (
                    <button onClick={() => handlePause(job)} style={{ background: '#78350f', color: '#fbbf24', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                      ⏸ Pause
                    </button>
                  )}
                  {job.canCancel && (
                    <button onClick={() => handleCancel(job)} style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                      ✕ Cancel
                    </button>
                  )}
                  {isGhostRun(job) && (
                    <button onClick={() => handleForceCancel(job)} style={{ background: '#450a0a', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer', marginLeft: 4 }}>
                      ☠ Force Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent History */}
      <section>
        <h2 style={{ fontSize: 18, margin: '0 0 12px' }}>
          Recent History
          <span style={{ fontSize: 13, color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>({recentJobs.length})</span>
        </h2>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #374151', color: '#9ca3af', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Type</th>
                <th style={{ padding: '8px 12px' }}>Channel</th>
                <th style={{ padding: '8px 12px' }}>Status</th>
                <th style={{ padding: '8px 12px' }}>Queued</th>
                <th style={{ padding: '8px 12px' }}>Started</th>
                <th style={{ padding: '8px 12px' }}>Duration</th>
                <th style={{ padding: '8px 12px' }}>Messages</th>
                <th style={{ padding: '8px 12px' }}>Errors</th>
                <th style={{ padding: '8px 12px' }}></th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>No recent jobs</td></tr>
              ) : (
                recentJobs.map(job => (
                  <tr key={`${job.type}-${job.id}`} style={{ borderBottom: '1px solid #1f2937' }}>
                    <td style={{ padding: '8px 12px' }}>{typeBadge(job.type)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div>{job.channelName}</div>
                      {job.serverName && <div style={{ fontSize: 11, color: '#6b7280' }}>{job.serverName}</div>}
                    </td>
                    <td style={{ padding: '8px 12px', color: statusColor(job.status), fontWeight: 600 }}>{job.status}</td>
                    <td style={{ padding: '8px 12px', color: '#9ca3af' }}>{job.queuedAt ? relativeTime(job.queuedAt) : '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#9ca3af' }}>{relativeTime(job.startedAt)}</td>
                    <td style={{ padding: '8px 12px', color: '#9ca3af' }}>{job.completedAt ? durationStr(job.startedAt, job.completedAt) : (job.status === 'running' ? durationStr(job.startedAt, new Date().toISOString()) : '—')}</td>
                    <td style={{ padding: '8px 12px' }}>{job.messages || '—'}</td>
                    <td style={{ padding: '8px 12px', color: job.errors ? '#ef4444' : '#6b7280' }}>{job.errors || '—'}</td>
                    <td style={{ padding: '8px 12px', display: 'flex', gap: 4 }}>
                      {job.canCancel && (
                        <button onClick={() => handleCancel(job)} style={{ background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                          ✕ Cancel
                        </button>
                      )}
                      {isGhostRun(job) && (
                        <button onClick={() => handleForceCancel(job)} style={{ background: '#450a0a', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>
                          ☠ Force
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
