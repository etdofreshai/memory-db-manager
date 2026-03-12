import React, { useEffect, useState, useCallback } from 'react';
import { chatgptApi } from '../../api';

interface SyncRun {
  id: string;
  jobId: string;
  channel?: string;
  channelName?: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  completedAt?: string;
  insertedCount?: number;
  messagesIngested?: number;
  errors?: number;
}

interface Job {
  id: string;
  name?: string;
  channel: string;
  cadencePreset?: string;
  intervalMinutes?: number;
  enabled?: boolean;
  lastRunAt?: string;
  lastStatus?: string;
}

interface ConversationInfo {
  id: string;
  title?: string;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
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

export default function ChatGPTJobs() {
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [convMap, setConvMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingEnabled, setTogglingEnabled] = useState<Record<string, boolean>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [runsData, jobsData, convData] = await Promise.allSettled([
        chatgptApi<any>('/api/runs?limit=100'),
        chatgptApi<Job[]>('/api/jobs'),
        chatgptApi<ConversationInfo[]>('/api/conversations'),
      ]);
      if (runsData.status === 'fulfilled') {
        setRuns(Array.isArray(runsData.value) ? runsData.value : runsData.value?.runs || []);
      }
      if (jobsData.status === 'fulfilled' && Array.isArray(jobsData.value)) {
        setJobs(jobsData.value);
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleToggleJob = async (job: Job) => {
    setTogglingEnabled(prev => ({ ...prev, [job.id]: true }));
    try {
      await chatgptApi(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      fetchAll();
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    } finally {
      setTogglingEnabled(prev => { const n = { ...prev }; delete n[job.id]; return n; });
    }
  };

  const handleRunNow = async (job: Job) => {
    try {
      await chatgptApi(`/api/jobs/${job.id}/run`, { method: 'POST' });
      setTimeout(fetchAll, 1000);
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    }
  };

  const handleDeleteJob = async (job: Job) => {
    if (!confirm(`Delete scheduled job for "${convMap[job.channel] || job.name || job.channel}"?`)) return;
    try {
      await chatgptApi(`/api/jobs/${job.id}`, { method: 'DELETE' });
      fetchAll();
    } catch (e: any) {
      alert(`Failed: ${e.message}`);
    }
  };

  return (
    <div>
      <h1 className="page-title">📋 ChatGPT Jobs</h1>
      {error && <div className="error-box">{error}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Scheduled Jobs</span>
          <button onClick={fetchAll} className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }}>Refresh</button>
        </div>
        {loading ? (
          <p style={{ color: '#888', padding: '12px 0' }}>Loading…</p>
        ) : jobs.length === 0 ? (
          <p style={{ color: '#888', padding: '12px 0' }}>No scheduled jobs. Go to Conversations to schedule syncs.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Conversation</th>
                <th>Cadence</th>
                <th>Status</th>
                <th>Last Run</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id}>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {convMap[job.channel] || job.name || job.channel}
                  </td>
                  <td>{job.cadencePreset || (job.intervalMinutes ? `${job.intervalMinutes}m` : '—')}</td>
                  <td>
                    <span style={{ color: job.enabled ? '#22c55e' : '#9ca3af' }}>
                      {job.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {job.lastStatus && (
                      <span style={{ marginLeft: 8, color: statusColor(job.lastStatus), fontSize: 12 }}>
                        ({job.lastStatus})
                      </span>
                    )}
                  </td>
                  <td style={{ color: '#888', whiteSpace: 'nowrap' }}>{relativeTime(job.lastRunAt)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => handleRunNow(job)}
                    >
                      ▶ Run
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => handleToggleJob(job)}
                      disabled={togglingEnabled[job.id]}
                    >
                      {job.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '2px 8px', color: '#f88', borderColor: '#f44' }}
                      onClick={() => handleDeleteJob(job)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-header">Recent Sync Runs</div>
        {loading ? (
          <p style={{ color: '#888', padding: '12px 0' }}>Loading…</p>
        ) : runs.length === 0 ? (
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
                  <td>{durationStr(r.startedAt, r.finishedAt || r.completedAt)}</td>
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
