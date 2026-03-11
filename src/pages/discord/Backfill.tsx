import React, { useEffect, useState, useRef, useCallback } from 'react';
import { discordApi } from '../../api';

/* ── Types ─────────────────────────────────────────────── */

interface ChannelInfo {
  channelName: string;
  guildId: string | null;
  guildName: string | null;
}

interface BackfillProgress {
  runId: string;
  page: number;
  totalPages: number;
  messagesProcessed: number;
  downloadedCount: number;
  ingestedCount: number;
  skippedCount: number;
  errorCount: number;
  startTime: string;
  currentTime: string;
  lastEvent?: string;
  estimatedRemaining?: number;
  recentItems?: { filename: string; messageId: string; status: string; size?: number }[];
}

interface BackfillRun {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  attachmentMode?: string;
  stats: {
    totalMessages?: number;
    messagesWithAttachments?: number;
    downloadedAttachments?: number;
    ingestedAttachments?: number;
    skipped?: number;
    errors?: number;
  };
}

/* ── Component ─────────────────────────────────────────── */

export default function DiscordBackfill() {
  // Channels
  const [channels, setChannels] = useState<Record<string, ChannelInfo>>({});
  const [selectedChannel, setSelectedChannel] = useState('');
  const [allChannels, setAllChannels] = useState(true);

  // Backfill options
  const [forceMode, setForceMode] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [limit, setLimit] = useState('');
  const [dryRun, setDryRun] = useState(false);

  // Active run
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const [runStatus, setRunStatus] = useState<string>('');
  const [eventLog, setEventLog] = useState<{ time: string; message: string }[]>([]);
  const [starting, setStarting] = useState(false);

  // History
  const [runs, setRuns] = useState<BackfillRun[]>([]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  // Errors
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const eventSourceRef = useRef<EventSource | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  /* ── Load channels ───────────────────────────────────── */

  useEffect(() => {
    discordApi<any>('/api/channels')
      .then(data => {
        // API returns Record<channelId, ChannelInfo>
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          // Could be { channels: {...} } or directly the map
          const chMap = data.channels || data;
          setChannels(chMap);
        }
      })
      .catch(() => {}); // Non-critical
  }, []);

  /* ── Load runs ───────────────────────────────────────── */

  const loadRuns = useCallback(() => {
    discordApi<any>('/api/backfill/runs')
      .then(data => {
        setRuns(data?.runs || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRuns();
    const interval = setInterval(loadRuns, 15000);
    return () => clearInterval(interval);
  }, [loadRuns]);

  /* ── SSE ─────────────────────────────────────────────── */

  const connectSSE = useCallback((runId: string) => {
    if (eventSourceRef.current) eventSourceRef.current.close();

    const es = new EventSource(`/proxy/discord-ingestor/api/backfill/events/${runId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const p: BackfillProgress = JSON.parse(event.data);
        setProgress(p);
        if (p.lastEvent) {
          setEventLog(prev => {
            const next = [{ time: new Date().toLocaleTimeString(), message: p.lastEvent! }, ...prev];
            return next.slice(0, 50);
          });
        }
      } catch {}
    };

    es.addEventListener('complete', () => {
      setRunStatus('complete');
      setActiveRunId(null);
      es.close();
      loadRuns();
    });

    es.addEventListener('error', (event) => {
      try {
        const data = JSON.parse((event as any).data);
        setRunStatus('error');
        setError(data.message || 'Backfill error');
      } catch {
        setRunStatus('error');
      }
      setActiveRunId(null);
      es.close();
      loadRuns();
    });

    es.onerror = () => {
      es.close();
    };
  }, [loadRuns]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  /* ── Actions ─────────────────────────────────────────── */

  const startBackfill = async () => {
    setError('');
    setStarting(true);
    try {
      // Use refetch/start which fetches from Discord API
      const body: any = {
        batchSize,
        dryRun,
        attachmentMode: forceMode ? 'force' : 'missing',
      };
      if (limit) body.limit = parseInt(limit);

      const data = await discordApi<any>('/api/refetch/start', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setActiveRunId(data.runId);
      setRunStatus('running');
      setProgress(data.progress || null);
      setEventLog([]);
      connectSSE(data.runId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  };

  const pauseBackfill = async () => {
    if (!activeRunId) return;
    try {
      await discordApi<any>('/api/backfill/pause', {
        method: 'POST',
        body: JSON.stringify({ runId: activeRunId }),
      });
      setRunStatus('paused');
      if (eventSourceRef.current) eventSourceRef.current.close();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const resumeBackfill = async () => {
    if (!activeRunId) return;
    try {
      await discordApi<any>(`/api/backfill/resume/${activeRunId}`, {
        method: 'POST',
      });
      setRunStatus('running');
      connectSSE(activeRunId);
    } catch (e: any) {
      setError(e.message);
    }
  };

  /* ── Auto-scroll log ─────────────────────────────────── */

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = 0; // newest first
    }
  }, [eventLog]);

  /* ── Derived ─────────────────────────────────────────── */

  const channelEntries = Object.entries(channels).sort((a, b) =>
    (a[1].guildName || '').localeCompare(b[1].guildName || '') ||
    a[1].channelName.localeCompare(b[1].channelName)
  );

  const isRunning = runStatus === 'running';
  const isPaused = runStatus === 'paused';
  const isActive = isRunning || isPaused;

  const pct = progress && progress.totalPages > 0
    ? Math.round((progress.page / progress.totalPages) * 100)
    : 0;

  const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'paused');
  const completedRuns = runs.filter(r => r.status !== 'running' && r.status !== 'paused');

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div>
      <h1 className="page-title">⏪ Discord Backfill</h1>
      {error && <div className="error-box">{error}</div>}

      {/* ── Start Backfill Form ─────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px' }}>Start Backfill</h3>

        {/* Mode explanation */}
        <div style={{ marginBottom: 16, padding: 12, background: '#0d1f3c', borderRadius: 6, fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={forceMode}
                onChange={e => setForceMode(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <strong style={{ color: forceMode ? '#f59e0b' : '#ccc' }}>Force Backfill</strong>
            </label>
            <div style={{ color: '#999', marginLeft: 26, marginTop: 2 }}>
              Re-download and overwrite existing messages, attachments, and content
            </div>
          </div>
          <div style={{ color: '#7facd6', marginLeft: 26, fontSize: 12 }}>
            {forceMode
              ? '⚠️ Will re-download everything, even if already present'
              : '✓ Default mode: skip messages that already have content and attachment links'}
          </div>
        </div>

        {/* Channel selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#aaa' }}>Channel</label>
            <select
              value={allChannels ? '__all__' : selectedChannel}
              onChange={e => {
                if (e.target.value === '__all__') {
                  setAllChannels(true);
                  setSelectedChannel('');
                } else {
                  setAllChannels(false);
                  setSelectedChannel(e.target.value);
                }
              }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #333', background: '#0a1628', color: '#eee' }}
            >
              <option value="__all__">All channels</option>
              {channelEntries.map(([id, info]) => (
                <option key={id} value={id}>
                  {info.guildName ? `${info.guildName} / ` : ''}{info.channelName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#aaa' }}>Batch Size</label>
            <input
              type="number"
              value={batchSize}
              onChange={e => setBatchSize(parseInt(e.target.value) || 10)}
              min={1}
              max={50}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #333', background: '#0a1628', color: '#eee' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#aaa' }}>Limit (blank = all)</label>
            <input
              type="number"
              value={limit}
              onChange={e => setLimit(e.target.value)}
              placeholder="No limit"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #333', background: '#0a1628', color: '#eee' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'end', paddingBottom: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
              Dry Run (download only, don't ingest)
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={startBackfill}
            disabled={starting || isActive}
            style={{
              padding: '10px 20px', borderRadius: 6, border: 'none', fontWeight: 600, cursor: starting || isActive ? 'not-allowed' : 'pointer',
              background: starting || isActive ? '#333' : '#3b82f6', color: '#fff',
            }}
          >
            {starting ? '⏳ Starting...' : '▶ Start Backfill'}
          </button>
          {isActive && (
            <>
              {isRunning && (
                <button
                  onClick={pauseBackfill}
                  style={{ padding: '10px 20px', borderRadius: 6, border: 'none', fontWeight: 600, cursor: 'pointer', background: '#f59e0b', color: '#000' }}
                >
                  ❚❚ Pause
                </button>
              )}
              {isPaused && (
                <button
                  onClick={resumeBackfill}
                  style={{ padding: '10px 20px', borderRadius: 6, border: 'none', fontWeight: 600, cursor: 'pointer', background: '#22c55e', color: '#000' }}
                >
                  ⟳ Resume
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Active Run Progress ────────────────────────── */}
      {isActive && progress && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px' }}>
            {isRunning ? '🔄 Running' : '⏸️ Paused'}
            <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>Run {activeRunId?.slice(0, 8)}</span>
          </h3>

          {/* Progress bar */}
          <div style={{ background: '#1a2744', borderRadius: 6, height: 24, overflow: 'hidden', marginBottom: 16 }}>
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #3b82f6, #2563eb)',
                transition: 'width 0.3s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 600, fontSize: 12,
              }}
            >
              {pct > 5 && `${pct}%`}
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Pages', value: `${progress.page} / ${progress.totalPages || '?'}` },
              { label: 'Downloaded', value: progress.downloadedCount },
              { label: 'Ingested', value: progress.ingestedCount },
              { label: 'Skipped', value: progress.skippedCount },
              { label: 'Errors', value: progress.errorCount, color: progress.errorCount > 0 ? '#f44336' : undefined },
            ].map(stat => (
              <div key={stat.label} style={{ background: '#0d1f3c', padding: 10, borderRadius: 6, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', marginBottom: 4 }}>{stat.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: stat.color || '#eee' }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* ETA */}
          {progress.estimatedRemaining != null && progress.estimatedRemaining > 0 && (
            <div style={{ padding: 8, background: '#0d2847', borderRadius: 4, borderLeft: '4px solid #3b82f6', marginBottom: 12, fontSize: 13 }}>
              <strong>ETA:</strong> {formatDuration(progress.estimatedRemaining / 1000)} remaining
            </div>
          )}

          {/* Recent items */}
          {progress.recentItems && progress.recentItems.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 6 }}>Recent Items</div>
              <div style={{ maxHeight: 150, overflowY: 'auto', background: '#0a1628', borderRadius: 4, border: '1px solid #1a2744' }}>
                {progress.recentItems.map((item, i) => (
                  <div key={i} style={{ padding: '6px 10px', borderBottom: '1px solid #1a2744', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#ccc' }}>{item.filename}</span>
                    <span style={{
                      color: item.status === 'ingested' ? '#4caf50' : item.status === 'error' ? '#f44336' : '#64b5f6',
                      fontWeight: 600, fontSize: 11,
                    }}>
                      {item.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live log */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#aaa', marginBottom: 6 }}>Live Events</div>
            <div
              ref={logContainerRef}
              style={{
                maxHeight: 200, overflowY: 'auto', background: '#0a1628', borderRadius: 4,
                border: '1px solid #1a2744', fontFamily: 'monospace', fontSize: 12,
              }}
            >
              {eventLog.length === 0 ? (
                <div style={{ padding: 12, color: '#555', textAlign: 'center' }}>Waiting for events...</div>
              ) : (
                eventLog.map((e, i) => (
                  <div key={i} style={{ padding: '4px 10px', borderBottom: '1px solid #111d33', display: 'flex', gap: 10 }}>
                    <span style={{ color: '#555', whiteSpace: 'nowrap' }}>[{e.time}]</span>
                    <span style={{ color: '#aaa', wordBreak: 'break-word' }}>{e.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Run History ────────────────────────────────── */}
      <div className="card">
        <h3 style={{ margin: '0 0 12px' }}>Backfill History</h3>
        {loading ? <p>Loading...</p> : runs.length === 0 ? (
          <p style={{ color: '#888' }}>No backfill runs found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Mode</th>
                <th>Messages</th>
                <th>Downloaded</th>
                <th>Ingested</th>
                <th>Skipped</th>
                <th>Errors</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => {
                const started = new Date(run.startedAt);
                const completed = run.completedAt ? new Date(run.completedAt) : null;
                const dur = completed ? Math.round((completed.getTime() - started.getTime()) / 1000) : null;
                const expanded = expandedRun === run.runId;

                return (
                  <React.Fragment key={run.runId}>
                    <tr
                      onClick={() => setExpandedRun(expanded ? null : run.runId)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{started.toLocaleString()}</td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontWeight: 600, fontSize: 12,
                          background: statusColor(run.status).bg, color: statusColor(run.status).fg,
                        }}>
                          {run.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{run.attachmentMode === 'force' ? '⚡ Force' : '📋 Default'}</td>
                      <td>{run.stats?.totalMessages ?? '—'}</td>
                      <td>{run.stats?.downloadedAttachments ?? '—'}</td>
                      <td>{run.stats?.ingestedAttachments ?? '—'}</td>
                      <td>{run.stats?.skipped ?? '—'}</td>
                      <td style={{ color: (run.stats?.errors ?? 0) > 0 ? '#f44336' : undefined }}>
                        {run.stats?.errors ?? '—'}
                      </td>
                      <td>{dur != null ? formatDuration(dur) : '—'}</td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={9} style={{ background: '#0d1f3c', padding: 12, fontSize: 12 }}>
                          <div><strong>Run ID:</strong> <code>{run.runId}</code></div>
                          <div><strong>Started:</strong> {started.toISOString()}</div>
                          {completed && <div><strong>Completed:</strong> {completed.toISOString()}</div>}
                          <div><strong>Attachment Mode:</strong> {run.attachmentMode || 'missing'}</div>
                          {run.stats?.messagesWithAttachments != null && (
                            <div><strong>Messages w/ Attachments:</strong> {run.stats.messagesWithAttachments}</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────── */

function statusColor(status: string) {
  switch (status) {
    case 'complete': return { bg: '#064e3b', fg: '#6ee7b7' };
    case 'running': return { bg: '#1e3a5f', fg: '#93c5fd' };
    case 'error': return { bg: '#7f1d1d', fg: '#fca5a5' };
    case 'paused': return { bg: '#78350f', fg: '#fcd34d' };
    default: return { bg: '#333', fg: '#ccc' };
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
