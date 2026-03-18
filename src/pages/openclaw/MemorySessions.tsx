import React, { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '../../api';

/* ── Types ─────────────────────────────────────────────── */

interface DbMessage {
  id: number;
  record_id?: string;
  source_name?: string;
  sender?: string;
  recipient?: string;
  content?: string;
  timestamp?: string;
  external_id?: string;
  metadata?: string | Record<string, any> | null;
}

interface SessionGroup {
  sessionKey: string;
  messages: DbMessage[];
  firstDate: Date;
  lastDate: Date;
}

/* ── Helpers ───────────────────────────────────────────── */

function parseSessionKey(msg: DbMessage): string {
  // Try metadata.sessionId first
  if (msg.metadata) {
    const meta = typeof msg.metadata === 'string' ? tryParse(msg.metadata) : msg.metadata;
    if (meta?.sessionId) return meta.sessionId;
    if (meta?.session_id) return meta.session_id;
  }
  // Fallback: parse from external_id — split from RIGHT on ':' once
  if (msg.external_id) {
    const lastColon = msg.external_id.lastIndexOf(':');
    if (lastColon > 0) return msg.external_id.slice(0, lastColon);
  }
  return 'unknown';
}

function tryParse(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function formatDate(d: Date): string {
  return d.toLocaleString();
}

function truncate(s: string, max = 200): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

function senderIcon(sender?: string): string {
  if (!sender) return '⚙️';
  const s = sender.toLowerCase();
  if (s === 'openclaw' || s === 'assistant' || s === 'bot') return '🤖';
  return '👤';
}

function sessionDisplayName(key: string): string {
  if (!key || key === 'agent:main:main') return 'Heartbeat';

  const parts = key.replace(/^agent:main:/, '').split(':');
  const channel = parts[0];

  if (channel === 'telegram') {
    if (parts[1] === 'group') return `Telegram Group ${parts[2] || ''}`;
    return `Telegram DM ${parts[1] || ''}`;
  }
  if (channel === 'discord') {
    const channelId = parts[parts.length - 1];
    return `Discord ${channelId}`;
  }
  if (channel === 'subagent') return `Subagent ${parts.slice(1).join(':').slice(0, 16)}`;
  if (channel === 'main') return 'Main Session';

  return `${channel.charAt(0).toUpperCase() + channel.slice(1)} ${parts.slice(1).join(':')}`.trim();
}

/* ── Component ─────────────────────────────────────────── */

export default function OpenClawMemorySessions() {
  const [allMessages, setAllMessages] = useState<DbMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ messages: DbMessage[]; total?: number }>('/api/messages?source=openclaw&limit=1000&sort=timestamp&order=desc')
      .then(data => {
        setAllMessages(data.messages || []);
        setError('');
      })
      .catch((e: any) => setError(e.message || 'Failed to load messages'))
      .finally(() => setLoading(false));
  }, []);

  const sessionGroups = useMemo<SessionGroup[]>(() => {
    const map = new Map<string, DbMessage[]>();
    for (const msg of allMessages) {
      const key = parseSessionKey(msg);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(msg);
    }
    const groups: SessionGroup[] = [];
    for (const [sessionKey, msgs] of map) {
      // Sort messages within group by timestamp ascending
      msgs.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return ta - tb;
      });
      const timestamps = msgs
        .map(m => m.timestamp ? new Date(m.timestamp) : null)
        .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
      const firstDate = timestamps.length > 0 ? timestamps[0] : new Date(0);
      const lastDate = timestamps.length > 0 ? timestamps[timestamps.length - 1] : new Date(0);
      groups.push({ sessionKey, messages: msgs, firstDate, lastDate });
    }
    // Sort by last message date descending
    groups.sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
    return groups;
  }, [allMessages]);

  const filteredGroups = useMemo(() => {
    if (!filter) return sessionGroups;
    const f = filter.toLowerCase();
    return sessionGroups.filter(g => g.sessionKey.toLowerCase().includes(f));
  }, [sessionGroups, filter]);

  const totalMessages = allMessages.length;
  const totalSessions = sessionGroups.length;

  const handleExpand = (key: string) => {
    setExpandedKey(prev => prev === key ? null : key);
  };

  return (
    <div>
      <h1 className="page-title">🗄️ Memory Sessions</h1>
      <p style={{ color: '#888', fontSize: 13, margin: '-8px 0 16px' }}>
        All OpenClaw sessions ingested into the Memory Database.
      </p>

      {error && <div className="error-box">{error}</div>}

      {!loading && !error && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ padding: '12px 20px', flex: '0 0 auto' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{totalSessions}</div>
            <div style={{ fontSize: 12, color: '#888' }}>Sessions</div>
          </div>
          <div className="card" style={{ padding: '12px 20px', flex: '0 0 auto' }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{totalMessages.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: '#888' }}>Messages</div>
          </div>
        </div>
      )}

      <div className="filters-bar">
        <input
          placeholder="Filter by session key..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ minWidth: 280 }}
        />
        <span style={{ color: '#888', fontSize: 13 }}>
          {filteredGroups.length} session{filteredGroups.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>Loading sessions from memory database...</p>
      ) : filteredGroups.length === 0 ? (
        <p style={{ color: '#888' }}>
          {filter ? 'No sessions match your filter.' : 'No OpenClaw sessions found in the memory database.'}
        </p>
      ) : (
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #444', fontSize: 12, color: '#888' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Session</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Messages</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>First Message</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Last Message</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map(g => {
                const isExpanded = expandedKey === g.sessionKey;
                // Show last 10 messages (most recent first for display)
                const previewMessages = g.messages.slice(-10).reverse();
                return (
                  <React.Fragment key={g.sessionKey}>
                    <tr
                      onClick={() => handleExpand(g.sessionKey)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid #333',
                        background: isExpanded ? '#0d1f3c' : undefined,
                      }}
                    >
                      <td style={{ padding: '8px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{sessionDisplayName(g.sessionKey)}</div>
                        <code style={{ fontSize: 11, color: '#666' }}>{g.sessionKey}</code>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                        {g.messages.length}
                      </td>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap', fontSize: 13 }}>
                        {formatDate(g.firstDate)}
                      </td>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap', fontSize: 13 }}>
                        <span title={formatDate(g.lastDate)}>
                          {relativeTime(g.lastDate)}
                        </span>
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
                            <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
                              Showing last {previewMessages.length} of {g.messages.length} messages
                            </div>
                            {previewMessages.length === 0 ? (
                              <p style={{ color: '#888', margin: 0 }}>No messages.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {previewMessages.map((msg, i) => (
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
                                      {senderIcon(msg.sender)}
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
                                          {msg.sender || 'unknown'}
                                        </span>
                                        <span style={{ color: '#555', fontSize: 11 }}>
                                          {msg.timestamp
                                            ? relativeTime(new Date(msg.timestamp))
                                            : ''}
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
                                        {truncate(msg.content || '(empty)')}
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
