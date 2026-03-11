import React, { useEffect, useState } from 'react';
import { discordApi, getServiceConfig } from '../../api';

interface RunInfo {
  id: string;
  jobId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  messagesIngested?: number;
  errors?: number;
}

export default function DiscordDashboard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const config = await getServiceConfig();
      const cfg = config['discord-ingestor']?.configured;
      setConfigured(cfg);
      if (!cfg) return;

      try {
        const [runsData, schedData] = await Promise.allSettled([
          discordApi<any>('/api/runs?limit=20'),
          discordApi<any>('/api/scheduler/status'),
        ]);
        if (runsData.status === 'fulfilled') {
          setRuns(Array.isArray(runsData.value) ? runsData.value : runsData.value?.runs || []);
        }
        if (schedData.status === 'fulfilled') {
          setSchedulerStatus(schedData.value);
        }
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  if (configured === null) return <p>Loading...</p>;
  if (!configured) return (
    <div className="placeholder-page">
      <div className="placeholder-icon">🔵</div>
      <h1 className="page-title">Discord Ingestor</h1>
      <div className="placeholder-status unconfigured">⚠️ Not Configured</div>
    </div>
  );

  const lastRun = runs[0];
  const totalIngested = runs.reduce((sum, r) => sum + (r.messagesIngested || 0), 0);
  const totalErrors = runs.reduce((sum, r) => sum + (r.errors || 0), 0);

  return (
    <div>
      <h1 className="page-title">🔵 Discord Ingestor</h1>
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
          <div className="stat-value" style={{ fontSize: 16 }}>
            {lastRun ? new Date(lastRun.startedAt).toLocaleString() : '—'}
          </div>
          <div className="stat-label">Last Sync</div>
        </div>
      </div>

      {schedulerStatus && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 8px' }}>Scheduler</h3>
          <p style={{ margin: 0, color: '#888' }}>
            Status: <strong style={{ color: ( schedulerStatus.concurrency > 0 || schedulerStatus.runningIds !== undefined) ? '#4caf50' : '#f44336' }}>
              {( schedulerStatus.concurrency > 0 || schedulerStatus.runningIds !== undefined) ? 'Running' : 'Stopped'}
            </strong>
            {schedulerStatus.nextRun && <> · Next: {new Date(schedulerStatus.nextRun).toLocaleString()}</>}
          </p>
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: '0 0 12px' }}>Recent Runs</h3>
        {runs.length === 0 ? <p style={{ color: '#888' }}>No runs found.</p> : (
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Messages</th>
                <th>Errors</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => {
                const dur = run.completedAt
                  ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
                  : null;
                return (
                  <tr key={run.id}>
                    <td>{new Date(run.startedAt).toLocaleString()}</td>
                    <td>
                      <span style={{
                        color: run.status === 'completed' ? '#4caf50' : run.status === 'failed' ? '#f44336' : '#ff9800'
                      }}>
                        {run.status}
                      </span>
                    </td>
                    <td>{run.messagesIngested ?? '—'}</td>
                    <td>{run.errors ?? '—'}</td>
                    <td>{dur !== null ? `${dur}s` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
