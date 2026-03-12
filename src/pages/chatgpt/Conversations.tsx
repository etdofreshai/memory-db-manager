import React, { useEffect, useState, useCallback, useRef } from 'react';
import { chatgptApi, apiFetch } from '../../api';
import { useNavigate } from 'react-router-dom';

interface Conversation {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  lastSyncedAt?: string;
}

interface ConversationStats {
  messageCount: number;
  lastMessageAt: string | null;
}

interface Job {
  id: string;
  channel: string;
  name?: string;
  cadencePreset?: string;
  intervalMinutes?: number;
  enabled?: boolean;
  lastRunAt?: string;
  lastSyncedAt?: string;
  startDate?: string;
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

const CADENCE_OPTIONS = [
  { label: 'Every hour',     value: '1h',  minutes: 60 },
  { label: 'Every 4 hours',  value: '4h',  minutes: 240 },
  { label: 'Every day',      value: '1d',  minutes: 1440 },
  { label: 'Every 2 days',   value: '2d',  minutes: 2880 },
  { label: 'Every week',     value: '1w',  minutes: 10080 },
  { label: 'Every month',    value: '1mo', minutes: 43200 },
];

export default function ChatGPTConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Record<string, ConversationStats>>({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortCol, setSortCol] = useState<'title' | 'messages' | 'lastUpdated' | 'lastSynced'>('lastUpdated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [scheduleMenuOpen, setScheduleMenuOpen] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [startDateModal, setStartDateModal] = useState<Conversation | null>(null);
  const [startDateInput, setStartDateInput] = useState('');
  const [startDateLoading, setStartDateLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [convData, jobsData, statsData] = await Promise.allSettled([
        chatgptApi<Conversation[]>('/api/conversations'),
        chatgptApi<Job[]>('/api/jobs'),
        apiFetch<{ stats: Record<string, ConversationStats> }>('/api/chatgpt/conversations/stats'),
      ]);
      if (convData.status === 'fulfilled' && Array.isArray(convData.value)) {
        setConversations(convData.value);
      }
      if (jobsData.status === 'fulfilled' && Array.isArray(jobsData.value)) {
        setJobs(jobsData.value);
      }
      if (statsData.status === 'fulfilled' && statsData.value?.stats) {
        setStats(statsData.value.stats);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const jobMap = new Map<string, Job>(jobs.map(j => [j.channel, j]));

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const sortIndicator = (col: typeof sortCol) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const filtered = conversations
    .filter(c => {
      if (!filter) return true;
      const title = c.title || c.id;
      return title.toLowerCase().includes(filter.toLowerCase());
    })
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortCol === 'title') {
        return dir * (a.title || a.id).localeCompare(b.title || b.id);
      }
      if (sortCol === 'messages') {
        const am = stats[a.id]?.messageCount ?? 0;
        const bm = stats[b.id]?.messageCount ?? 0;
        return dir * (am - bm);
      }
      if (sortCol === 'lastUpdated') {
        const at = stats[a.id]?.lastMessageAt || a.updatedAt || '';
        const bt = stats[b.id]?.lastMessageAt || b.updatedAt || '';
        return dir * at.localeCompare(bt);
      }
      if (sortCol === 'lastSynced') {
        const aj = jobMap.get(a.id);
        const bj = jobMap.get(b.id);
        const at = aj?.lastSyncedAt || '';
        const bt = bj?.lastSyncedAt || '';
        return dir * at.localeCompare(bt);
      }
      return 0;
    });

  const handleSyncNow = async (conv: Conversation) => {
    setActionLoading(prev => ({ ...prev, [conv.id]: 'sync' }));
    try {
      await chatgptApi('/api/sync', {
        method: 'POST',
        body: JSON.stringify({ channel: conv.id, sincePreset: '1d' }),
      });
    } catch (e: any) {
      alert(`Sync failed: ${e.message}`);
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[conv.id]; return n; });
      fetchAll();
    }
  };

  const handleSchedule = async (conv: Conversation, cadence: { value: string; minutes: number }) => {
    setScheduleMenuOpen(null);
    setMenuOpen(null);
    const existing = jobMap.get(conv.id);
    try {
      if (existing) {
        await chatgptApi(`/api/jobs/${existing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ cadencePreset: cadence.value, intervalMinutes: cadence.minutes, enabled: true }),
        });
      } else {
        await chatgptApi('/api/jobs', {
          method: 'POST',
          body: JSON.stringify({
            name: conv.title || conv.id,
            channel: conv.id,
            cadencePreset: cadence.value,
            intervalMinutes: cadence.minutes,
            enabled: true,
          }),
        });
      }
    } catch (e: any) {
      alert(`Schedule failed: ${e.message}`);
    }
    fetchAll();
  };

  const handleResetSync = async (conv: Conversation) => {
    setMenuOpen(null);
    const existing = jobMap.get(conv.id);
    if (!existing) return;
    if (!confirm(`Reset sync for "${conv.title || conv.id}"? Next run will re-fetch from startDate or beginning.`)) return;
    try {
      await chatgptApi(`/api/jobs/${existing.id}/reset-sync`, { method: 'POST' });
    } catch (e: any) {
      alert(`Reset failed: ${e.message}`);
    }
    fetchAll();
  };

  const handleSetStartDate = async (conv: Conversation, dateStr: string) => {
    setStartDateLoading(true);
    const existing = jobMap.get(conv.id);
    if (!existing) { setStartDateLoading(false); return; }
    try {
      await chatgptApi(`/api/jobs/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ startDate: dateStr || null }),
      });
      setStartDateModal(null);
    } catch (e: any) {
      alert(`Failed to set start date: ${e.message}`);
    } finally {
      setStartDateLoading(false);
    }
    fetchAll();
  };

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
        <button onClick={fetchAll} className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }}>
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
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('lastUpdated')}>Last Updated{sortIndicator('lastUpdated')}</th>
                <th>Scheduled</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('lastSynced')}>Last Synced{sortIndicator('lastSynced')}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ color: '#888', textAlign: 'center', padding: 20 }}>No conversations found.</td></tr>
              )}
              {filtered.map(conv => {
                const job = jobMap.get(conv.id);
                const convStats = stats[conv.id];
                return (
                  <tr
                    key={conv.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/chatgpt/conversation/${conv.id}`)}
                  >
                    <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {conv.title || conv.id}
                    </td>
                    <td>{convStats?.messageCount ?? conv.messageCount ?? '—'}</td>
                    <td style={{ color: '#888', whiteSpace: 'nowrap' }}>{relativeTime(convStats?.lastMessageAt || conv.updatedAt)}</td>
                    <td style={{ whiteSpace: 'nowrap', color: '#888' }}>
                      {job ? (
                        <span style={{ color: job.enabled ? '#22c55e' : '#9ca3af' }}>
                          {job.cadencePreset || `${job.intervalMinutes}m`}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: job?.lastSyncedAt ? '#4ade80' : '#555' }} title={job?.lastSyncedAt || 'Never synced'}>
                      {job ? (job.lastSyncedAt ? relativeTime(job.lastSyncedAt) : '—') : ''}
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                      <div ref={menuOpen === conv.id ? menuRef : undefined} style={{ display: 'inline-block', position: 'relative' }}>
                        <button
                          className="btn-secondary"
                          style={{ padding: '2px 8px', fontSize: 13 }}
                          onClick={() => setMenuOpen(menuOpen === conv.id ? null : conv.id)}
                        >
                          ⋯
                        </button>
                        {menuOpen === conv.id && (
                          <div style={{
                            position: 'absolute', right: 0, top: '100%', zIndex: 100,
                            background: '#1e1e2e', border: '1px solid #444', borderRadius: 6,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.4)', minWidth: 160, padding: '4px 0',
                          }}>
                            <button
                              className="menu-item"
                              onClick={() => { setMenuOpen(null); handleSyncNow(conv); }}
                              disabled={!!actionLoading[conv.id]}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', background: 'none', border: 'none', color: '#cdd6f4', cursor: 'pointer', fontSize: 13 }}
                            >
                              {actionLoading[conv.id] === 'sync' ? 'Syncing…' : '🔄 Sync Now'}
                            </button>
                            <button
                              className="menu-item"
                              onClick={() => { setMenuOpen(null); navigate(`/chatgpt/conversation/${conv.id}`); }}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', background: 'none', border: 'none', color: '#cdd6f4', cursor: 'pointer', fontSize: 13 }}
                            >
                              💬 View Messages
                            </button>
                            <div style={{ position: 'relative' }}>
                              <button
                                className="menu-item"
                                onClick={() => setScheduleMenuOpen(scheduleMenuOpen === conv.id ? null : conv.id)}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', background: 'none', border: 'none', color: '#cdd6f4', cursor: 'pointer', fontSize: 13 }}
                              >
                                ⏰ Schedule…
                              </button>
                              {scheduleMenuOpen === conv.id && (
                                <div style={{
                                  position: 'absolute', right: '100%', top: 0, zIndex: 200,
                                  background: '#1e1e2e', border: '1px solid #444', borderRadius: 6,
                                  boxShadow: '0 4px 16px rgba(0,0,0,0.4)', minWidth: 150, padding: '4px 0',
                                }}>
                                  {CADENCE_OPTIONS.map(c => (
                                    <button
                                      key={c.value}
                                      onClick={() => handleSchedule(conv, c)}
                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', background: 'none', border: 'none', color: '#cdd6f4', cursor: 'pointer', fontSize: 13 }}
                                    >
                                      {c.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            {job && (
                              <button
                                className="menu-item"
                                onClick={() => { setMenuOpen(null); setStartDateInput(job.startDate ? job.startDate.split('T')[0] : ''); setStartDateModal(conv); }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', background: 'none', border: 'none', color: '#cdd6f4', cursor: 'pointer', fontSize: 13 }}
                              >
                                ⚙ Set start date…
                              </button>
                            )}
                            {job && (
                              <button
                                className="menu-item"
                                onClick={() => handleResetSync(conv)}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px', background: 'none', border: 'none', color: '#f88', cursor: 'pointer', fontSize: 13 }}
                              >
                                ↺ Reset sync
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {startDateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1e1e2e', border: '1px solid #444', borderRadius: 8, padding: 24, minWidth: 320 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>⚙ Set start date for "{startDateModal.title || startDateModal.id}"</h3>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>Sync will never fetch conversations updated before this date.</p>
            <input
              type="date"
              value={startDateInput}
              onChange={e => setStartDateInput(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #444', background: '#2a2a3e', color: '#cdd6f4', fontSize: 14, marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setStartDateModal(null)} style={{ padding: '6px 16px', background: '#333', border: 'none', borderRadius: 4, color: '#cdd6f4', cursor: 'pointer' }}>Cancel</button>
              <button
                disabled={startDateLoading}
                onClick={() => handleSetStartDate(startDateModal, startDateInput ? `${startDateInput}T00:00:00.000Z` : '')}
                style={{ padding: '6px 16px', background: '#1a3a6a', border: 'none', borderRadius: 4, color: '#fff', cursor: startDateLoading ? 'wait' : 'pointer' }}
              >
                {startDateLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
