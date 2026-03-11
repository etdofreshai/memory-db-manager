import React, { useEffect, useState } from 'react';
import { discordApi } from '../../api';

interface Channel {
  id: string;
  name: string;
  type?: string | number;
  guildId?: string;
  guildName?: string;
  category?: string;
  enabled?: boolean;
}

export default function DiscordChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    discordApi<any>('/api/channels')
      .then(data => {
        setChannels(Array.isArray(data) ? data : data?.channels || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = channels.filter(ch =>
    ch.name?.toLowerCase().includes(filter.toLowerCase()) ||
    ch.guildName?.toLowerCase().includes(filter.toLowerCase()) ||
    ch.category?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <h1 className="page-title">📺 Discord Channels</h1>
      {error && <div className="error-box">{error}</div>}

      <div className="filters-bar">
        <input
          placeholder="Filter channels..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ minWidth: 250 }}
        />
        <span style={{ color: '#888', fontSize: 13 }}>{filtered.length} channels</span>
      </div>

      {loading ? <p>Loading...</p> : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Guild</th>
                <th>Category</th>
                <th>Type</th>
                <th>ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ch => (
                <tr key={ch.id}>
                  <td><strong>{ch.name}</strong></td>
                  <td>{ch.guildName || '—'}</td>
                  <td>{ch.category || '—'}</td>
                  <td><code>{ch.type ?? '—'}</code></td>
                  <td><code style={{ fontSize: 11 }}>{ch.id}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
