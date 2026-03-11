import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';

export default function Sources() {
  const [sources, setSources] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/api/sources'),
      apiFetch('/api/stats'),
    ]).then(([srcData, statsData]) => {
      setSources(srcData.sources || []);
      // Use cleanup stats for per-source counts
      apiFetch('/api/cleanup/stats').then(cleanupData => {
        const map: Record<number, number> = {};
        (cleanupData.sources || []).forEach((s: any) => { map[s.source_id] = s.count; });
        setStats(map);
      }).catch(() => {});
    }).catch(e => setError(e.message))
    .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="page-title">📡 Sources</h1>
      {error && <div className="error-box">{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead><tr>
            <th>ID</th><th>Name</th><th style={{ textAlign: 'right' }}>Messages</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: '#888' }}>Loading…</td></tr>
              : sources.length === 0 ? <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: '#888' }}>No sources.</td></tr>
              : sources.map(s => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.name}</td>
                  <td style={{ textAlign: 'right' }}>{(stats[s.id] || 0).toLocaleString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
