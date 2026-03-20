import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { apiFetch } from '../api';

/* ── Types ───────────────────────────────────────────── */

interface AppViewDatabaseProps {
  service: string;
  serviceLabel: string;
  serviceKey: string;
}

interface DbMessage {
  id: number;
  record_id: string;
  source_id: number;
  external_id: string;
  sender: string;
  sender_id: string | null;
  recipient: string | null;
  recipient_id: string | null;
  content: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
  source_name?: string;
}

interface ChannelGroup {
  id: string;
  name: string;
  group: string;
  count: number;
  latestTimestamp: string;
}

interface GroupOfChannels {
  name: string;
  channels: ChannelGroup[];
}

/* ── Source name mapping ─────────────────────────────── */

const SOURCE_NAME_MAP: Record<string, string> = {
  discord: 'discord',
  slack: 'slack',
  chatgpt: 'chatgpt',
  gmail: 'email',
  openclaw: 'openclaw',
  anthropic: 'anthropic',
};

/* ── Service theme colors (shared with AppViewLive) ── */

const SERVICE_THEMES: Record<string, {
  accent: string;
  sidebarBg: string;
  sidebarBorder: string;
  selectedBg: string;
  headerBg: string;
  prefix?: string;
  msgBubbleBg?: string;
}> = {
  discord: {
    accent: '#5865F2',
    sidebarBg: '#2b2d31',
    sidebarBorder: '#1e1f22',
    selectedBg: '#35373c',
    headerBg: '#313338',
    prefix: '#',
    msgBubbleBg: '#2b2d31',
  },
  slack: {
    accent: '#4A154B',
    sidebarBg: '#1a1d21',
    sidebarBorder: '#522653',
    selectedBg: '#1164a3',
    headerBg: '#1a1d21',
    prefix: '#',
    msgBubbleBg: '#222529',
  },
  chatgpt: {
    accent: '#10a37f',
    sidebarBg: '#171717',
    sidebarBorder: '#2d2d2d',
    selectedBg: '#2d2d2d',
    headerBg: '#212121',
    msgBubbleBg: '#2d2d2d',
  },
  gmail: {
    accent: '#c71610',
    sidebarBg: '#1a1a2e',
    sidebarBorder: '#333',
    selectedBg: '#2a2a4e',
    headerBg: '#1e1e3a',
    msgBubbleBg: '#1e1e3a',
  },
  openclaw: {
    accent: '#ff6b35',
    sidebarBg: '#1a1a1a',
    sidebarBorder: '#333',
    selectedBg: '#2a2020',
    headerBg: '#1e1a1a',
    msgBubbleBg: '#221a1a',
  },
  anthropic: {
    accent: '#d4a574',
    sidebarBg: '#1a1816',
    sidebarBorder: '#332e28',
    selectedBg: '#2a2520',
    headerBg: '#1e1c18',
    msgBubbleBg: '#231f1a',
  },
};

/* ── Channel extraction from metadata ────────────────── */

function extractChannelInfo(service: string, msg: DbMessage): { channelId: string; channelName: string } {
  const meta = (msg.metadata && typeof msg.metadata === 'object') ? msg.metadata as Record<string, any> : {};

  switch (service) {
    case 'discord': {
      const channelId = meta.channelId || meta.channel_id || '';
      const channelName = meta.channelName || meta.channel_name || (channelId ? `channel-${channelId}` : '');
      return { channelId: channelId || 'unknown', channelName: channelName || channelId || 'unknown' };
    }
    case 'slack': {
      const channelId = meta.channelId || meta.channel_id || meta.channel || '';
      const channelName = meta.channelName || meta.channel_name || channelId || '';
      return { channelId: channelId || 'unknown', channelName: channelName || channelId || 'unknown' };
    }
    case 'chatgpt': {
      const convId = meta.conversationId || meta.conversation_id || '';
      const convTitle = meta.conversationTitle || meta.conversation_title || meta.title || '';
      return { channelId: convId || 'unknown', channelName: convTitle || convId || 'Untitled' };
    }
    case 'anthropic': {
      const convId = meta.conversationId || meta.conversation_id || '';
      const convTitle = meta.conversationTitle || meta.conversation_title || meta.title || '';
      return { channelId: convId || 'unknown', channelName: convTitle || convId || 'Conversation' };
    }
    case 'openclaw': {
      const sessionKey = meta.sessionKey || meta.session_key || meta.sessionId || meta.session_id || '';
      return { channelId: sessionKey || 'unknown', channelName: sessionKey || 'unknown' };
    }
    case 'gmail': {
      // Extract mailbox from external_id: "gmail:[Gmail]/All Mail:{uid}"
      if (msg.external_id) {
        const match = msg.external_id.match(/^gmail:(.+?):\d+$/);
        if (match) {
          return { channelId: match[1], channelName: match[1] };
        }
      }
      // Fallback: group by sender/recipient thread
      const threadId = meta.threadId || meta.thread_id || meta.message_id || '';
      return { channelId: threadId || 'inbox', channelName: threadId || 'Inbox' };
    }
    default: {
      // Generic fallback: try common metadata fields
      const id = meta.channelId || meta.channel_id || meta.conversationId || meta.sessionKey || '';
      const name = meta.channelName || meta.channel_name || meta.conversationTitle || id || '';
      return { channelId: id || 'unknown', channelName: name || 'unknown' };
    }
  }
}

function inferGroup(service: string, msg: DbMessage): string {
  const meta = (msg.metadata && typeof msg.metadata === 'object') ? msg.metadata as Record<string, any> : {};

  switch (service) {
    case 'discord':
      return meta.guildName || meta.guild_name || meta.server_name || 'Discord';
    case 'gmail':
      return 'Mailboxes';
    case 'chatgpt':
      return 'Conversations';
    case 'anthropic':
      return 'Conversations';
    case 'openclaw': {
      const sessionKey = meta.sessionKey || meta.session_key || '';
      if (typeof sessionKey === 'string' && sessionKey.includes(':')) {
        const parts = sessionKey.split(':');
        return parts[0] || 'Sessions';
      }
      return 'Sessions';
    }
    case 'slack':
      return 'Channels';
    default:
      return 'Other';
  }
}

/* ── Component ───────────────────────────────────────── */

export default function AppViewDatabase({ service, serviceLabel, serviceKey }: AppViewDatabaseProps) {
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [error, setError] = useState('');
  const [channels, setChannels] = useState<ChannelGroup[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [messagesOffset, setMessagesOffset] = useState(0);
  const [filter, setFilter] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [loadProgress, setLoadProgress] = useState('');

  // Store all fetched messages for channel-level filtering
  const allMessagesRef = useRef<DbMessage[]>([]);
  // Map channelId -> channel name (from Discord ingestor, etc.)
  const channelNamesRef = useRef<Record<string, string>>({});

  const theme = SERVICE_THEMES[service] || SERVICE_THEMES.discord;
  const sourceName = SOURCE_NAME_MAP[service] || service;
  const PAGE_SIZE = 50;
  const FETCH_LIMIT = 200; // API max per request

  // Fetch all messages for this source across multiple pages
  useEffect(() => {
    fetchChannels();
  }, [service]);

  const fetchChannels = async () => {
    setStatus('loading');
    setError('');
    setLoadProgress('Loading...');

    try {
      // For Discord, try to fetch channel names from the ingestor
      if (service === 'discord') {
        try {
          const channelData = await apiFetch<Record<string, { channelName: string; guildId: string | null; guildName: string | null }>>('/proxy/discord-ingestor/api/channels');
          const names: Record<string, string> = {};
          for (const [id, info] of Object.entries(channelData)) {
            if (info.channelName) names[id] = info.channelName;
          }
          channelNamesRef.current = names;
        } catch {
          // Discord ingestor might not be available; proceed without names
        }
      }

      // Paginate through messages to discover all channels
      let allMsgs: DbMessage[] = [];
      let offset = 0;
      let total = Infinity;

      while (offset < total && offset < 10000) { // Cap at 10k to avoid huge fetches
        setLoadProgress(`Loading messages... ${offset} fetched`);
        const data = await apiFetch<any>(
          `/api/messages?source=${sourceName}&limit=${FETCH_LIMIT}&offset=${offset}&sort=timestamp&order=desc`
        );
        const msgs: DbMessage[] = data.messages || [];
        total = data.total || 0;
        allMsgs = allMsgs.concat(msgs);
        offset += FETCH_LIMIT;

        if (msgs.length < FETCH_LIMIT) break; // No more pages
      }

      allMessagesRef.current = allMsgs;
      setLoadProgress('');

      // Group by channel using metadata
      const channelMap = new Map<string, { name: string; group: string; count: number; latest: string }>();

      for (const msg of allMsgs) {
        const { channelId, channelName } = extractChannelInfo(service, msg);

        // For Discord, override with ingestor channel names if available
        const displayName = (service === 'discord' && channelNamesRef.current[channelId])
          ? channelNamesRef.current[channelId]
          : channelName;

        const existing = channelMap.get(channelId);
        if (existing) {
          existing.count++;
          if (msg.timestamp > existing.latest) existing.latest = msg.timestamp;
          // Update name if we got a better one
          if (displayName && displayName !== channelId && existing.name === channelId) {
            existing.name = displayName;
          }
        } else {
          channelMap.set(channelId, {
            name: displayName,
            group: inferGroup(service, msg),
            count: 1,
            latest: msg.timestamp,
          });
        }
      }

      const channelList = Array.from(channelMap.entries())
        .map(([id, info]) => ({
          id,
          name: info.name,
          group: info.group,
          count: info.count,
          latestTimestamp: info.latest,
        }))
        .sort((a, b) => b.latestTimestamp.localeCompare(a.latestTimestamp));

      setChannels(channelList);
      setStatus('done');
    } catch (e: unknown) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Failed to fetch data');
      setLoadProgress('');
    }
  };

  // Get messages for selected channel from in-memory store + paginate
  const getChannelMessages = useCallback((channelId: string, offset: number): { msgs: DbMessage[]; total: number } => {
    // Filter all messages by channel
    const channelMsgs = allMessagesRef.current.filter(msg => {
      const { channelId: msgChannelId } = extractChannelInfo(service, msg);
      return msgChannelId === channelId;
    });

    // Sort by timestamp ascending (chronological)
    channelMsgs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      msgs: channelMsgs.slice(offset, offset + PAGE_SIZE),
      total: channelMsgs.length,
    };
  }, [service]);

  const handleSelectChannel = useCallback((ch: ChannelGroup) => {
    setSelectedChannelId(ch.id);
    setMessagesOffset(0);
    setMessagesLoading(true);

    // Small timeout to let state update and show loading
    setTimeout(() => {
      const { msgs, total } = getChannelMessages(ch.id, 0);
      setMessages(msgs);
      setMessagesTotal(total);
      setMessagesOffset(0);
      setMessagesLoading(false);
    }, 0);
  }, [getChannelMessages]);

  const handlePage = useCallback((direction: 'prev' | 'next') => {
    if (!selectedChannelId) return;
    const newOffset = direction === 'next'
      ? messagesOffset + PAGE_SIZE
      : Math.max(0, messagesOffset - PAGE_SIZE);

    setMessagesLoading(true);
    setTimeout(() => {
      const { msgs, total } = getChannelMessages(selectedChannelId, newOffset);
      setMessages(msgs);
      setMessagesTotal(total);
      setMessagesOffset(newOffset);
      setMessagesLoading(false);
    }, 0);
  }, [selectedChannelId, messagesOffset, getChannelMessages]);

  // Filter channels
  const filtered = useMemo(() => {
    if (!filter) return channels;
    const f = filter.toLowerCase();
    return channels.filter(ch =>
      ch.name.toLowerCase().includes(f) ||
      ch.id.toLowerCase().includes(f) ||
      ch.group.toLowerCase().includes(f)
    );
  }, [channels, filter]);

  // Group channels
  const groups = useMemo((): GroupOfChannels[] => {
    const groupMap: Record<string, ChannelGroup[]> = {};
    for (const ch of filtered) {
      (groupMap[ch.group] ||= []).push(ch);
    }
    return Object.entries(groupMap)
      .map(([name, chs]) => ({ name, channels: chs }))
      .sort((a, b) => {
        if (a.name === 'Other') return 1;
        if (b.name === 'Other') return -1;
        return a.name.localeCompare(b.name);
      });
  }, [filtered]);

  const selectedChannel = channels.find(ch => ch.id === selectedChannelId);

  const toggleGroup = (name: string) => {
    setCollapsedGroups(prev => ({ ...prev, [name]: !prev[name] }));
  };

  /* ── Render: loading/error states ──────────────────── */

  if (status === 'loading') {
    return (
      <div>
        <h1 className="page-title">🗄️ {serviceLabel} — Database View</h1>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <p style={{ color: '#888' }}>Loading {serviceLabel} data from database…</p>
          {loadProgress && <p style={{ color: '#666', fontSize: 13 }}>{loadProgress}</p>}
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div>
        <h1 className="page-title">🗄️ {serviceLabel} — Database View</h1>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Database Error</h2>
          <p style={{ color: '#888', maxWidth: 500, margin: '0 auto 20px' }}>
            Could not load {serviceLabel} data from the memory database.
          </p>
          {error && <div className="error-box" style={{ maxWidth: 500, margin: '0 auto 16px', textAlign: 'left', fontSize: 13 }}>{error}</div>}
          <button onClick={fetchChannels} style={{ padding: '10px 24px', borderColor: theme.accent, color: theme.accent }}>
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  /* ── Render: App-like view ─────────────────────────── */

  return (
    <div>
      <h1 className="page-title">🗄️ {serviceLabel} — Database View</h1>
      <div style={{
        display: 'flex',
        border: `1px solid ${theme.sidebarBorder}`,
        borderRadius: 10,
        overflow: 'hidden',
        height: 'calc(100vh - 120px)',
        minHeight: 500,
      }}>
        {/* ── Left sidebar ─────────────────────────────── */}
        <div style={{
          width: 280,
          flexShrink: 0,
          background: theme.sidebarBg,
          borderRight: `1px solid ${theme.sidebarBorder}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Sidebar header */}
          <div style={{
            padding: '12px 14px',
            borderBottom: `1px solid ${theme.sidebarBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>
              {serviceLabel} <span style={{ color: '#888', fontWeight: 400 }}>DB</span>
            </span>
            <span style={{ fontSize: 12, color: '#888' }}>
              {channels.length} channels
            </span>
          </div>

          {/* Search */}
          <div style={{ padding: '8px 10px' }}>
            <input
              placeholder="Search channels…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                width: '100%',
                background: '#1a1a2a',
                border: '1px solid #333',
                borderRadius: 4,
                padding: '6px 10px',
                fontSize: 13,
                color: '#ccc',
              }}
            />
          </div>

          {/* Channels list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 8px' }}>
            {groups.map(group => {
              const isCollapsed = collapsedGroups[group.name] ?? false;
              return (
                <div key={group.name}>
                  {groups.length > 1 && (
                    <div
                      onClick={() => toggleGroup(group.name)}
                      style={{
                        padding: '8px 8px 4px',
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: '#888',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        userSelect: 'none',
                      }}
                    >
                      <span style={{ fontSize: 9 }}>{isCollapsed ? '▸' : '▾'}</span>
                      {group.name}
                      <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 10 }}>
                        {group.channels.length}
                      </span>
                    </div>
                  )}

                  {!isCollapsed && group.channels.map(ch => {
                    const isSelected = ch.id === selectedChannelId;
                    return (
                      <div
                        key={ch.id}
                        onClick={() => handleSelectChannel(ch)}
                        style={{
                          padding: '6px 10px',
                          margin: '1px 0',
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: isSelected ? theme.selectedBg : 'transparent',
                          color: isSelected ? '#fff' : '#b5bac1',
                          fontSize: 13,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = theme.selectedBg + '80';
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                        }}
                      >
                        {theme.prefix && (
                          <span style={{ color: '#888', fontSize: 14 }}>{theme.prefix}</span>
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {ch.name}
                        </span>
                        <span style={{
                          fontSize: 10,
                          color: '#666',
                          background: '#1a1a2a',
                          padding: '1px 6px',
                          borderRadius: 8,
                          flexShrink: 0,
                        }}>
                          {ch.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#666', fontSize: 13 }}>
                {filter ? 'No matches' : 'No channels found in database'}
              </div>
            )}
          </div>
        </div>

        {/* ── Main content area ────────────────────────── */}
        <div style={{
          flex: 1,
          background: theme.headerBg,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {!selectedChannel ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🗄️</div>
              <p style={{ fontSize: 16 }}>Select a channel to view messages</p>
              <p style={{ fontSize: 13, color: '#555' }}>
                {allMessagesRef.current.length} total messages across {channels.length} channels
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{
                padding: '14px 20px',
                borderBottom: `1px solid ${theme.sidebarBorder}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0,
              }}>
                {theme.prefix && <span style={{ color: '#888', fontSize: 20 }}>{theme.prefix}</span>}
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, flex: 1 }}>{selectedChannel.name}</h2>
                <span style={{ fontSize: 12, color: '#888' }}>
                  {messagesTotal > 0 ? `${messagesTotal} messages` : `${selectedChannel.count} in batch`}
                </span>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {messagesLoading ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Loading messages…</div>
                ) : messages.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>No messages found</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {messages.map((msg, i) => (
                      <MessageBubble key={msg.id || i} msg={msg} service={service} theme={theme} />
                    ))}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {messagesTotal > PAGE_SIZE && (
                <div style={{
                  padding: '8px 16px',
                  borderTop: `1px solid ${theme.sidebarBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  flexShrink: 0,
                }}>
                  <button
                    onClick={() => handlePage('prev')}
                    disabled={messagesOffset === 0}
                    style={{ padding: '4px 12px', fontSize: 12 }}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: 12, color: '#888' }}>
                    {messagesOffset + 1}–{Math.min(messagesOffset + PAGE_SIZE, messagesTotal)} of {messagesTotal}
                  </span>
                  <button
                    onClick={() => handlePage('next')}
                    disabled={messagesOffset + PAGE_SIZE >= messagesTotal}
                    style={{ padding: '4px 12px', fontSize: 12 }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Refresh */}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={fetchChannels} style={{ fontSize: 12, padding: '6px 14px', color: '#888' }}>
          🔄 Refresh data
        </button>
      </div>
    </div>
  );
}

/* ── Message bubble component ────────────────────────── */

function MessageBubble({ msg, service, theme }: {
  msg: DbMessage;
  service: string;
  theme: typeof SERVICE_THEMES.discord;
}) {
  const ts = msg.timestamp ? new Date(msg.timestamp) : null;
  const timeStr = ts ? ts.toLocaleString() : '';

  // Service-specific sender styling
  const isBot = msg.sender?.toLowerCase().includes('bot') ||
    msg.sender?.toLowerCase().includes('assistant') ||
    msg.sender === 'assistant';
  const isUser = msg.sender === 'user';

  // For chat services, differentiate user vs assistant
  const isChatService = service === 'chatgpt' || service === 'anthropic' || service === 'openclaw';

  return (
    <div style={{
      padding: '8px 12px',
      background: theme.msgBubbleBg || '#2a2a3a',
      borderRadius: 6,
      borderLeft: `3px solid ${
        isChatService
          ? (isBot ? theme.accent : '#888')
          : theme.accent + '60'
      }`,
    }}>
      {/* Header: sender + time */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{
          fontWeight: 600,
          fontSize: 13,
          color: isChatService
            ? (isBot ? theme.accent : '#e0e0e0')
            : theme.accent,
        }}>
          {msg.sender || 'Unknown'}
        </span>
        {msg.recipient && !isChatService && (
          <>
            <span style={{ color: '#555', fontSize: 12 }}>→</span>
            <span style={{ fontSize: 12, color: '#888' }}>{msg.recipient}</span>
          </>
        )}
        <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>{timeStr}</span>
      </div>

      {/* Content */}
      <div style={{
        fontSize: 14,
        lineHeight: 1.5,
        color: '#ddd',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: 300,
        overflow: 'auto',
      }}>
        {msg.content || '(no content)'}
      </div>
    </div>
  );
}
