import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../api';
import { useNavigate } from 'react-router-dom';

interface ConvStat {
  messageCount: number;
  lastMessageAt: string | null;
  title: string | null;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

type SortCol = 'title' | 'messages' | 'lastMessage';

export default function ChatGPTConversations() {
  const [stats, setStats] = useState<Record<string, ConvStat>>({});
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('lastMessage');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const navigate = useNavigate();

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ stats: Record<string, ConvStat> }>('/api/chatgpt/conversations/stats');
      if (data?.stats) setStats(data.stats);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const sortIndicator = (col: SortCol) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const rows = Object.entries(stats)
    .filter(([id, s]) => {
      if (!filter) return true;
      const title = s.title || id;
      return title.toLowerCase().includes(filter.toLowerCase());
    })
    .sort(([aId, a], [bId, b]) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortCol === 'title') {
        return dir * (a.title || aId).localeCompare(b.title || bId);
      }
      if (sortCol === 'messages') {
        return dir * (a.messageCount - b.messageCount);
      }
      if (sortCol === 'lastMessage') {
        const at = a.lastMessageAt || '';
        const bt = b.lastMessageAt || '';
        return dir * at.localeCompare(bt);
      }
      return 0;
    });

  return (
    <div>
      <h1 className="page-title">💬 ChatGPT Conversations</h1>
      {error && <div className="error-box">{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search conversations…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ flex: 1, maxWidth: 400, padding: '6px 10px', borderRadius: 4, border: '1px solid #444', background: '#1e1e2e', color: '#cdd6f4', fontSize: 13 }}
        />
        <button onClick={fetchStats} className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>Loading conversations…</p>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('title')}>Title{sortIndicator('title')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('messages')}>Messages{sortIndicator('messages')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('lastMessage')}>Last Message{sortIndicator('lastMessage')}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={4} style={{ color: '#888', textAlign: 'center', padding: 20 }}>No conversations found.</td></tr>
              )}
              {rows.map(([id, s]) => (
                <tr
                  key={id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/chatgpt/conversation/${id}`)}
                >
                  <td style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                    {s.title || id}
                  </td>
                  <td>{s.messageCount}</td>
                  <td style={{ color: '#888', whiteSpace: 'nowrap' }}>{relativeTime(s.lastMessageAt)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '2px 10px', fontSize: 12 }}
                      onClick={() => navigate(`/chatgpt/conversation/${id}`)}
                    >
                      👁 View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
