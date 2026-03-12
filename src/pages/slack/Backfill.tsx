import React, { useEffect, useState, useCallback } from 'react';
import { slackApi } from '../../api';

interface SlackChannel {
  id: string;
  name: string;
}

interface BackfillRun {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  channelId?: string;
  stats?: {
    totalMessages?: number;
    downloadedAttachments?: number;
    ingestedAttachments?: number;
    skipped?: number;
    errors?: number;
  };
}

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

export default function SlackBackfill() {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [allChannels, setAllChannels] = useState(true);
  const [runs, setRuns] = useState<BackfillRun[]>([]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const runChannelMap: Record<string, string> = (() => {
    try { return JSON.parse(localStorage.getItem('slack:runChannels') || '{}'); } catch { return {}; }
  })();

  const channelName = (chId?: string) => {
    if (!chId) return 'All channels';
    const rCh = runChannelMap[chId];
    const lookupId = rCh || chId;
    const ch = channels.find(c => c.id === lookupId);
    return ch ? `#${ch.name}` : lookupId.slice(0, 10) + '…';
  };

  const loadRuns = useCallback(() => {
    slackApi<any>('/api/backfill/runs')
      .then(data => {
        setRuns(Array.isArray(data) ? data : data?.runs || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    slackApi<SlackChannel[]>('/api/channels')
      .then(data => { if (Array.isArray(data)) setChannels(data); })
      .catch(() => {});
    loadRuns();
    const interval = setInterval(loadRuns, 15000);
    return () => clearInterval(interval);
  }, [loadRuns]);

  const startBackfill = async () => {
    setError('');
    setStarting(true);
    try {
      const body: any = {};
      if (!allChannels && selectedChannel) body.channelId = selectedChannel;
      const data = await slackApi<any>('/api/backfill/start', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (data?.runId) {
        setActiveRunId(data.runId);
        if (!allChannels && selectedChannel) {
          try {
            const m = JSON.parse(localStorage.getItem('slack:runChannels') || '{}');
            m[data.runId] = selectedChannel;
            localStorage.setItem('slack:runChannels', JSON.stringify(m));
          } catch {}
        }
      }
      loadRuns();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  };

  const cancelRun = async (runId: string) => {
    try {
      await slackApi('/api/backfill/pause', {
        method: 'POST',
        body: JSON.stringify({ runId }),
      });
      if (activeRunId === runId) setActiveRunId(null);
      loadRuns();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'paused');

  return (
    <div>
      <h1 className="page-title">⏪ Slack Backfill</h1>
      {error && <div className="error-box">{error}</div>}

      {/* Start form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px' }}>Start Backfill</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#aaa' }}>Channel</label>
            <select
              value={allChannels ? '__all__' : selectedChannel}
              onChange={e => {
                if (e.target.value === '__all__') { setAllChannels(true); setSelectedChannel(''); }
                else { setAllChannels(false); setSelectedChannel(e.target.value); }
              }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #333', background: '#0a1628', color: '#eee' }}
            >
              <option value="__all__">All channels</option>
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={startBackfill}
          disabled={starting || activeRuns.length > 0}
          style={{
            padding: '10px 20px', borderRadius: 6, border: 'none', fontWeight: 600,
            cursor: starting || activeRuns.length > 0 ? 'not-allowed' : 'pointer',
            background: starting || activeRuns.length > 0 ? '#333' : '#3b82f6', color: '#fff',
          }}
        >
          {starting ? '⏳ Starting...' : '▶ Start Backfill'}
        </button>
        {activeRuns.length > 0 && (
          <span style={{ marginLeft: 12, fontSize: 13, color: '#f59e0b' }}>
            ⚠ A backfill is already running — pause it first
          </span>
        )}
      </div>

      {/* Run History */}
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
                <th>Channel</th>
                <th>Messages</th>
                <th>Downloaded</th>
                <th>Errors</th>
                <th>Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => {
                const started = new Date(run.startedAt);
                const completed = run.completedAt ? new Date(run.completedAt) : null;
                const dur = completed ? Math.round((completed.getTime() - started.getTime()) / 1000) : null;
                const sc = statusColor(run.status);
                const expanded = expandedRun === run.runId;

                return (
                  <React.Fragment key={run.runId}>
                    <tr onClick={() => setExpandedRun(expanded ? null : run.runId)} style={{ cursor: 'pointer' }}>
                      <td>{started.toLocaleString()}</td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontWeight: 600, fontSize: 12,
                          background: sc.bg, color: sc.fg,
                        }}>
                          {run.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{channelName(run.channelId)}</td>
                      <td>{run.stats?.totalMessages ?? '—'}</td>
                      <td>{run.stats?.downloadedAttachments ?? '—'}</td>
                      <td style={{ color: (run.stats?.errors ?? 0) > 0 ? '#f44336' : undefined }}>
                        {run.stats?.errors ?? '—'}
                      </td>
                      <td>{dur !== null ? formatDuration(dur) : '—'}</td>
                      <td>
                        {(run.status === 'running' || run.status === 'paused') && (
                          <button
                            onClick={e => { e.stopPropagation(); cancelRun(run.runId); }}
                            style={{ padding: '4px 10px', borderRadius: 4, border: 'none', fontWeight: 600, fontSize: 11, cursor: 'pointer', background: '#7f1d1d', color: '#fca5a5' }}
                          >
                            ✕ Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={8} style={{ background: '#0d1f3c', padding: 12, fontSize: 12 }}>
                          <div><strong>Run ID:</strong> <code>{run.runId}</code></div>
                          <div><strong>Started:</strong> {started.toISOString()}</div>
                          {completed && <div><strong>Completed:</strong> {completed.toISOString()}</div>}
                          {run.stats?.ingestedAttachments != null && (
                            <div><strong>Ingested:</strong> {run.stats.ingestedAttachments}</div>
                          )}
                          {run.stats?.skipped != null && (
                            <div><strong>Skipped:</strong> {run.stats.skipped}</div>
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
