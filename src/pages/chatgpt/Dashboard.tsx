import React, { useEffect, useState } from 'react';
import { chatgptApi, getServiceConfig } from '../../api';

interface RunInfo {
  id: string;
  jobId: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  completedAt?: string;
  insertedCount?: number;
  messagesIngested?: number;
  errors?: number;
  channel?: string;
  channelName?: string;
}

interface SchedulerStatus {
  running: boolean;
  nextRunAt?: string;
  jobCount?: number;
}

interface ConversationInfo {
  id: string;
  title?: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function durationStr(start: string, end?: string): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'running' || s === 'in_progress') return '#22c55e';
  if (s === 'completed' || s === 'success') return '#3b82f6';
  if (s === 'failed' || s === 'error') return '#ef4444';
  if (s === 'queued' || s === 'pending') return '#f59e0b';
  return '#9ca3af';
}

export default function ChatGPTDashboard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [convMap, setConvMap] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const config = await getServiceConfig();
      const cfg = config['chatgpt-ingestor']?.configured;
      setConfigured(cfg);
      if (!cfg) return;

      try {
        const [runsData, schedData, convData] = await Promise.allSettled([
          chatgptApi<any>('/api/runs?limit=20'),
          chatgptApi<any>('/api/scheduler/status'),
          chatgptApi<any>('/api/conversations'),
        ]);
        if (runsData.status === 'fulfilled') {
          setRuns(Array.isArray(runsData.value) ? runsData.value : runsData.value?.runs || []);
        }
        if (schedData.status === 'fulfilled') {
          setSchedulerStatus(schedData.value);
        }
        if (convData.status === 'fulfilled' && Array.isArray(convData.value)) {
          const map: Record<string, string> = {};
          for (const c of convData.value as ConversationInfo[]) {
            map[c.id] = c.title || c.id;
          }
          setConvMap(map);
        }
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  if (configured === null) return <p>Loading...</p>;
  if (!configured) return (
    <div className="placeholder-page">
      <div className="placeholder-icon">🤖</div>
      <h1 className="page-title">ChatGPT Ingestor</h1>
      <div className="placeholder-status unconfigured">⚠️ Not Configured</div>
      <p style={{ color: '#888', textAlign: 'center', maxWidth: 400 }}>
        Set <code>CHATGPT_INGESTOR_URL</code> and <code>CHATGPT_INGESTOR_TOKEN</code> environment variables to enable.
      </p>
    </div>
  );

  const totalIngested = runs.reduce((sum, r) => sum + (r.insertedCount || r.messagesIngested || 0), 0);
  const totalErrors = runs.reduce((sum, r) => sum + (r.errors || 0), 0);
  const lastRun = runs[0];

  return (
    <div>
      <h1 className="page-title">🤖 ChatGPT Ingestor</h1>
      {error && <div className="error-box">{error}</div>}

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-value">{runs.length}</div>
          <div className="stat-label">Recent Runs</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">{totalIngested.toLocaleString()}</div>
          <div className="stat-label">Messages Ingested</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: totalErrors > 0 ? '#f44336' : undefined }}>{totalErrors}</div>
          <div className="stat-label">Errors</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: schedulerStatus?.running ? '#22c55e' : '#9ca3af' }}>
            {schedulerStatus?.running ? 'Active' : schedulerStatus ? 'Idle' : '—'}
          </div>
          <div className="stat-label">Scheduler</div>
        </div>
      </div>

      {lastRun && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">Last Run</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '8px 0' }}>
            <div><span style={{ color: '#888' }}>Status: </span><span style={{ color: statusColor(lastRun.status) }}>{lastRun.status}</span></div>
            <div><span style={{ color: '#888' }}>When: </span>{relativeTime(lastRun.startedAt)}</div>
            <div><span style={{ color: '#888' }}>Duration: </span>{durationStr(lastRun.startedAt, lastRun.finishedAt || lastRun.completedAt)}</div>
            <div><span style={{ color: '#888' }}>Messages: </span>{lastRun.insertedCount || lastRun.messagesIngested || 0}</div>
            {lastRun.channel && (
              <div><span style={{ color: '#888' }}>Conversation: </span>{convMap[lastRun.channel] || lastRun.channelName || lastRun.channel}</div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">Recent Sync Runs</div>
        {runs.length === 0 ? (
          <p style={{ color: '#888', padding: '12px 0' }}>No runs yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Conversation</th>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Messages</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id}>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.channel ? (convMap[r.channel] || r.channelName || r.channel) : '—'}
                  </td>
                  <td><span style={{ color: statusColor(r.status) }}>{r.status}</span></td>
                  <td style={{ color: '#888', whiteSpace: 'nowrap' }}>{relativeTime(r.startedAt)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{durationStr(r.startedAt, r.finishedAt || r.completedAt)}</td>
                  <td>{r.insertedCount || r.messagesIngested || 0}</td>
                  <td style={{ color: (r.errors || 0) > 0 ? '#f44336' : undefined }}>{r.errors || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
