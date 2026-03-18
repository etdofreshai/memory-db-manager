import React, { useEffect, useState, useCallback } from 'react';
import { openclawApi } from '../../api';

/* ── Types ─────────────────────────────────────────────── */

interface SessionInfo {
  key: string;
  sessionKey?: string;
  kind: string;
  label?: string;
  displayName?: string;
  updatedAt?: number;
  lastMessageAt?: string;
}

interface MessageInfo {
  id: string;
  role: string;
  content: string | ContentBlock[];
  timestamp?: string | number;
  model?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/* ── Helpers ───────────────────────────────────────────── */

function relativeTime(ts: number | string | null | undefined): string {
  if (!ts) return '—';
  const ms = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (isNaN(ms) || ms === 0) return '—';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function extractText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  return content
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text!)
    .join('\n');
}

function truncate(s: string, max = 200): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

function getDisplayName(s: SessionInfo): string {
  return s.displayName || s.label || s.key;
}

function getUpdatedMs(s: SessionInfo): number {
  if (s.updatedAt) return s.updatedAt;
  if (s.lastMessageAt) return new Date(s.lastMessageAt).getTime();
  return 0;
}

function roleIcon(role: string): string {
  if (role === 'user') return '👤';
  if (role === 'assistant') return '🤖';
  return '⚙️';
}

function kindColor(kind: string): { bg: string; fg: string } {
  switch (kind) {
    case 'main':
      return { bg: '#064e3b', fg: '#6ee7b7' };
    case 'subagent':
      return { bg: '#1e3a5f', fg: '#93c5fd' };
    case 'cron':
      return { bg: '#78350f', fg: '#fcd34d' };
    default:
      return { bg: '#333', fg: '#ccc' };
  }
}

/* ── Component ─────────────────────────────────────────── */

export default function OpenClawLiveSessions() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState('');

  const fetchSessions = useCallback(async () => {
    try {
      const data = await openclawApi<SessionInfo[]>('/api/sessions');
      const sorted = (Array.isArray(data) ? data : []).sort(
        (a, b) => getUpdatedMs(b) - getUpdatedMs(a),
      );
      setSessions(sorted);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleExpand = async (key: string) => {
    if (expandedKey === key) {
      setExpandedKey(null);
      setMessages([]);
      return;
    }
    setExpandedKey(key);
    setMessagesLoading(true);
    setMessagesError('');
    setMessages([]);
    try {
      const data = await openclawApi<MessageInfo[]>(
        `/api/sessions/${encodeURIComponent(key)}/messages?limit=20`,
      );
      setMessages(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setMessagesError(e.message || 'Failed to load messages');
    } finally {
      setMessagesLoading(false);
    }
  };

  const filtered = filter
    ? sessions.filter(s => {
        const f = filter.toLowerCase();
        return (
          s.key.toLowerCase().includes(f) ||
          getDisplayName(s).toLowerCase().includes(f) ||
          (s.kind || '').toLowerCase().includes(f)
        );
      })
    : sessions;

  return (
    <div>
      <h1 className="page-title">🔴 Live Sessions</h1>
      <p style={{ color: '#888', fontSize: 13, margin: '-8px 0 16px' }}>
        Sessions currently active in the OpenClaw Gateway. Only sessions loaded in memory are shown.
      </p>
      {error && <div className="error-box">{error}</div>}

      <div className="filters-bar">
        <input
          placeholder="Filter sessions by name, key, kind..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ minWidth: 280 }}
        />
        <span style={{ color: '#888', fontSize: 13 }}>
          {filtered.length} session{filtered.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => { setLoading(true); fetchSessions(); }}
          style={{
            marginLeft: 'auto', padding: '5px 12px', background: '#1a2a3a',
            border: '1px solid #4a9eff', borderRadius: 6, color: '#4a9eff',
            cursor: 'pointer', fontSize: 12,
          }}
        >
          ⟳ Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>Loading sessions...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#888' }}>
          {filter
            ? 'No sessions match your filter.'
            : 'No sessions currently active in gateway memory.'}
        </p>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #444', fontSize: 12, color: '#888' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Kind</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Key</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const key = s.key;
                const isExpanded = expandedKey === key;
                return (
                  <React.Fragment key={key}>
                    <tr
                      onClick={() => handleExpand(key)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid #333',
                        background: isExpanded ? '#0d1f3c' : undefined,
                      }}
                    >
                      <td style={{ padding: '8px' }}>
                        <strong>{getDisplayName(s)}</strong>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            background: kindColor(s.kind).bg,
                            color: kindColor(s.kind).fg,
                          }}
                        >
                          {s.kind || 'unknown'}
                        </span>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <code style={{ fontSize: 11, color: '#888' }}>{s.key}</code>
                      </td>
                      <td
                        style={{ padding: '8px', whiteSpace: 'nowrap' }}
                        title={
                          s.updatedAt
                            ? new Date(s.updatedAt).toISOString()
                            : s.lastMessageAt || ''
                        }
                      >
                        {relativeTime(s.updatedAt ?? s.lastMessageAt ?? null)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={4} style={{ padding: 0 }}>
                          <div
                            style={{
                              background: '#0a1628',
                              borderBottom: '2px solid #1a2744',
                              padding: 16,
                              maxHeight: 500,
                              overflowY: 'auto',
                            }}
                          >
                            {messagesLoading ? (
                              <p style={{ color: '#888', margin: 0 }}>Loading messages...</p>
                            ) : messagesError ? (
                              <p style={{ color: '#f44336', margin: 0 }}>{messagesError}</p>
                            ) : messages.length === 0 ? (
                              <p style={{ color: '#888', margin: 0 }}>No messages found.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {messages.map((msg, i) => (
                                  <div
                                    key={msg.id || i}
                                    style={{
                                      display: 'flex',
                                      gap: 10,
                                      padding: '8px 12px',
                                      background: '#111d33',
                                      borderRadius: 6,
                                      fontSize: 13,
                                    }}
                                  >
                                    <span style={{ fontSize: 16, flexShrink: 0 }}>
                                      {roleIcon(msg.role)}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div
                                        style={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          marginBottom: 4,
                                        }}
                                      >
                                        <span style={{ fontWeight: 600, color: '#aaa', fontSize: 12 }}>
                                          {msg.role}
                                          {msg.model && (
                                            <span style={{ color: '#555', marginLeft: 6 }}>
                                              ({msg.model})
                                            </span>
                                          )}
                                        </span>
                                        <span style={{ color: '#555', fontSize: 11 }}>
                                          {msg.timestamp ? relativeTime(msg.timestamp) : ''}
                                        </span>
                                      </div>
                                      <div
                                        style={{
                                          color: '#ccc',
                                          whiteSpace: 'pre-wrap',
                                          wordBreak: 'break-word',
                                          lineHeight: 1.5,
                                        }}
                                      >
                                        {truncate(extractText(msg.content))}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
