import React, { useEffect, useState, useCallback, useRef } from 'react';
import { slackApi } from '../../api';
import BackfillOptions, { BackfillConfig, defaultBackfillConfig } from '../../components/BackfillOptions';
import { usePersistedFilters } from '../../hooks/usePersistedFilters';
import ResetFiltersButton from '../../components/ResetFiltersButton';
import ConflictModeSelector from '../../components/ConflictModeSelector';
import { useConflictMode } from '../../hooks/useConflictMode';

interface BackfillRun {
  runId: string;
  channelId?: string;
  channelName?: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  progress?: {
    processed?: number;
    total?: number;
    currentChannel?: string;
  };
  stats?: {
    totalMessages?: number;
    downloadedAttachments?: number;
    skipped?: number;
    errors?: number;
  };
}

interface SlackChannel {
  id: string;
  name: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
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
  return '#9ca3af';
}

export default function SlackBackfill() {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [runs, setRuns] = useState<BackfillRun[]>([]);
  const [activeStatus, setActiveStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persisted Slack-specific + shared backfill config
  const SLACK_DEFAULTS = {
    selectedChannel: '',
    ...defaultBackfillConfig,
  };
  const [bfFilters, setBfFilters, resetBfFilters, isBfDirty] = usePersistedFilters('filters:slack-backfill-v2', SLACK_DEFAULTS);
  const { selectedChannel } = bfFilters;
  const setSelectedChannel = (v: string) => setBfFilters({ selectedChannel: v });

  const backfillConfig: BackfillConfig = {
    existingMessages: bfFilters.existingMessages,
    dryRun: bfFilters.dryRun,
    downloadAttachments: bfFilters.downloadAttachments,
    existingAttachments: bfFilters.existingAttachments,
  };
  const setBackfillConfig = (cfg: BackfillConfig) => setBfFilters(cfg);

  const [conflictMode, setConflictMode] = useConflictMode();
  const channelMap = Object.fromEntries(channels.map(c => [c.id, c.name]));

  const fetchData = useCallback(async () => {
    try {
      const [runsRes, statusRes] = await Promise.allSettled([
        slackApi<any>('/api/backfill/runs?limit=30'),
        slackApi<any>('/api/backfill/status'),
      ]);
      if (runsRes.status === 'fulfilled') {
        const data = runsRes.value;
        setRuns(Array.isArray(data) ? data : data?.runs || []);
      }
      if (statusRes.status === 'fulfilled') {
        setActiveStatus(statusRes.value);
      }
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const chData = await slackApi<SlackChannel[]>('/api/channels');
        setChannels(Array.isArray(chData) ? chData : []);
        await fetchData();
      } catch (e: any) {
        setError(e.message);
      }
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (activeStatus?.status === 'running' || activeStatus?.status === 'paused') {
      timerRef.current = setInterval(fetchData, 5000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeStatus?.status, fetchData]);

  const handleStart = async () => {
    if (!selectedChannel) return;
    setStarting(true);
    try {
      // Map BackfillConfig → Slack API params (best-effort)
      const body: Record<string, any> = {
        channelId: selectedChannel,
        dryRun: backfillConfig.dryRun,
        downloadAttachments: backfillConfig.downloadAttachments,
        conflictMode,
      };
      if (backfillConfig.existingMessages === 'overwrite') body.force = true;
      if (backfillConfig.existingMessages === 'append') body.appendMessages = true;
      if (backfillConfig.existingAttachments === 'overwrite') body.overwriteAttachments = true;
      if (backfillConfig.existingAttachments === 'append') body.appendAttachments = true;

      await slackApi('/api/backfill/start', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  };

  const handlePause = async () => {
    if (!activeStatus?.runId) return;
    try {
      await slackApi('/api/backfill/pause', {
        method: 'POST',
        body: JSON.stringify({ runId: activeStatus.runId }),
      });
      await fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleResume = async () => {
    if (!activeStatus?.runId) return;
    try {
      await slackApi('/api/backfill/resume', {
        method: 'POST',
        body: JSON.stringify({ runId: activeStatus.runId }),
      });
      await fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) return <p style={{ padding: 24, color: '#9ca3af' }}>Loading backfill…</p>;

  const isRunning = activeStatus?.status === 'running';
  const isPaused = activeStatus?.status === 'paused';
  const isActive = isRunning || isPaused;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>⏪ Slack Backfill</h1>
      <p style={{ color: '#9ca3af', margin: '0 0 24px', fontSize: 14 }}>
        Download historical Slack messages for a channel.
      </p>

      {error && (
        <div style={{ background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 8, padding: '8px 12px', marginBottom: 16, color: '#fca5a5', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Active Status */}
      {isActive && activeStatus && (
        <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: isRunning ? '#22c55e' : '#f59e0b', animation: isRunning ? 'pulse 2s infinite' : 'none' }} />
            <strong style={{ fontSize: 16 }}>Backfill {activeStatus.status}</strong>
            {activeStatus.startedAt && (
              <span style={{ color: '#9ca3af', fontSize: 13 }}>{relativeTime(activeStatus.startedAt)}</span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {isRunning && (
                <button onClick={handlePause} style={{ background: '#78350f', color: '#fbbf24', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer' }}>
                  ⏸ Pause
                </button>
              )}
              {isPaused && (
                <button onClick={handleResume} style={{ background: '#14532d', color: '#4ade80', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer' }}>
                  ▶ Resume
                </button>
              )}
            </div>
          </div>
          {activeStatus.progress && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#9ca3af' }}>
              {activeStatus.progress.processed != null && activeStatus.progress.total != null && (
                <>
                  <div style={{ background: '#374151', borderRadius: 4, height: 6, marginBottom: 6 }}>
                    <div style={{ background: '#22c55e', height: 6, borderRadius: 4, width: `${Math.min(100, (activeStatus.progress.processed / activeStatus.progress.total) * 100)}%`, transition: 'width 0.5s' }} />
                  </div>
                  {activeStatus.progress.processed.toLocaleString()} / {activeStatus.progress.total.toLocaleString()} processed
                </>
              )}
              {activeStatus.progress.currentChannel && <div>Channel: {channelMap[activeStatus.progress.currentChannel] || activeStatus.progress.currentChannel}</div>}
            </div>
          )}
        </div>
      )}

      {/* Start new backfill */}
      {!isActive && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Start Backfill</h3>
            <ResetFiltersButton onReset={resetBfFilters} visible={isBfDirty} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#aaa' }}>Channel</label>
            <select
              value={selectedChannel}
              onChange={e => setSelectedChannel(e.target.value)}
              style={{ width: '100%', maxWidth: 400, padding: '8px 10px', background: '#1e1e1e', border: '1px solid #555', borderRadius: 4, color: '#e0e0e0' }}
            >
              <option value="">Select a channel…</option>
              {channels.map(c => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Conflict Mode */}
      <div className="card" style={{ marginBottom: 20 }}>
        <ConflictModeSelector
          value={conflictMode}
          onChange={setConflictMode}
          disabled={isActive}
        />
      </div>

      {/* Shared Backfill Options */}
      <BackfillOptions
        value={backfillConfig}
        onChange={setBackfillConfig}
        disabled={isActive}
      />

      {/* Start button */}
      {!isActive && (
        <div className="card" style={{ marginBottom: 24 }}>
          <button
            onClick={handleStart}
            disabled={!selectedChannel || starting}
            style={{
              padding: '10px 20px',
              background: selectedChannel && !starting ? (backfillConfig.dryRun ? '#92400e' : '#1a3a6a') : '#374151',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              cursor: selectedChannel && !starting ? 'pointer' : 'not-allowed',
            }}
          >
            {starting ? '⏳ Starting…' : '▶ Start Backfill'}
          </button>
        </div>
      )}

      {/* Run history */}
      <div className="card">
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Run History</h3>
        {runs.length === 0 ? (
          <p style={{ color: '#888' }}>No backfill runs found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #444', color: '#888' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Channel</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Started</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Duration</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Messages</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Errors</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => {
                const chName = run.channelName || (run.channelId ? (channelMap[run.channelId] ? `#${channelMap[run.channelId]}` : run.channelId) : '—');
                return (
                  <tr key={run.runId} style={{ borderBottom: '1px solid #333' }}>
                    <td style={{ padding: '6px 8px' }}>{chName}</td>
                    <td style={{ padding: '6px 8px', color: statusColor(run.status), fontWeight: 600 }}>{run.status}</td>
                    <td style={{ padding: '6px 8px', color: '#9ca3af' }}>{relativeTime(run.startedAt)}</td>
                    <td style={{ padding: '6px 8px', color: '#9ca3af' }}>{durationStr(run.startedAt, run.completedAt)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{run.stats?.totalMessages?.toLocaleString() ?? '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: run.stats?.errors ? '#ef4444' : '#6b7280' }}>{run.stats?.errors ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
