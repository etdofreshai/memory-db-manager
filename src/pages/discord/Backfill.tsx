import React, { useEffect, useState } from 'react';
import { discordApi } from '../../api';

interface BackfillRun {
  id: string;
  status: string;
  channelId?: string;
  channelName?: string;
  startedAt?: string;
  completedAt?: string;
  messagesProcessed?: number;
  totalMessages?: number;
  progress?: number;
}

export default function DiscordBackfill() {
  const [runs, setRuns] = useState<BackfillRun[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    discordApi<any>('/api/backfill/runs')
      .then(data => {
        setRuns(Array.isArray(data) ? data : data?.runs || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const activeRuns = runs.filter(r => r.status === 'running' || r.status === 'paused');
  const completedRuns = runs.filter(r => r.status !== 'running' && r.status !== 'paused');

  return (
    <div>
      <h1 className="page-title">⏪ Discord Backfill</h1>
      {error && <div className="error-box">{error}</div>}
      {loading ? <p>Loading...</p> : (
        <>
          {activeRuns.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 12px' }}>Active Backfills</h3>
              {activeRuns.map(run => (
                <div key={run.id} style={{ marginBottom: 12, padding: '8px 12px', background: '#1a2744', borderRadius: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong>{run.channelName || run.channelId || run.id}</strong>
                    <span style={{ color: run.status === 'running' ? '#4caf50' : '#ff9800' }}>{run.status}</span>
                  </div>
                  {run.progress !== undefined && (
                    <div style={{ background: '#333', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ background: '#64b5f6', height: '100%', width: `${Math.min(100, run.progress)}%` }} />
                    </div>
                  )}
                  {run.messagesProcessed !== undefined && (
                    <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                      {run.messagesProcessed.toLocaleString()} messages processed
                      {run.totalMessages ? ` / ${run.totalMessages.toLocaleString()}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h3 style={{ margin: '0 0 12px' }}>Backfill History</h3>
            {completedRuns.length === 0 ? <p style={{ color: '#888' }}>No backfill runs found.</p> : (
              <table>
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Status</th>
                    <th>Messages</th>
                    <th>Started</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {completedRuns.map(run => (
                    <tr key={run.id}>
                      <td>{run.channelName || run.channelId || run.id}</td>
                      <td style={{ color: run.status === 'completed' ? '#4caf50' : '#f44336' }}>{run.status}</td>
                      <td>{run.messagesProcessed?.toLocaleString() ?? '—'}</td>
                      <td>{run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}</td>
                      <td>{run.completedAt ? new Date(run.completedAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
