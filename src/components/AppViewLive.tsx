import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { discordApi, slackApi, chatgptApi, gmailApi, openclawApi, apiFetch } from '../api';

/* ── Types ───────────────────────────────────────────── */

interface AppViewLiveProps {
  service: string;
  serviceLabel: string;
  serviceKey: string;
}

interface SidebarItem {
  id: string;
  name: string;
  group?: string;
  count?: number;
  meta?: Record<string, unknown>;
}

interface ItemGroup {
  name: string;
  items: SidebarItem[];
  collapsed?: boolean;
}

interface LiveMessage {
  id?: string | number;
  sender: string;
  content: string;
  timestamp: string;
  isAssistant?: boolean;
  metadata?: Record<string, unknown>;
}

/* ── Service theme colors ────────────────────────────── */

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

/* ── Source name mapping (for DB queries) ────────────── */

const SOURCE_NAME_MAP: Record<string, string> = {
  discord: 'discord',
  slack: 'slack',
  chatgpt: 'chatgpt',
  gmail: 'email',
  openclaw: 'openclaw',
  anthropic: 'anthropic',
};

/* ── Service-specific sidebar fetchers ───────────────── */

async function fetchDiscord(): Promise<SidebarItem[]> {
  const data = await discordApi<Record<string, { channelName: string; guildId: string | null; guildName: string | null }>>('/api/channels');
  return Object.entries(data).map(([id, info]) => ({
    id,
    name: info.channelName || id,
    group: info.guildName || 'Direct Messages',
    meta: { guildId: info.guildId },
  }));
}

async function fetchSlack(): Promise<SidebarItem[]> {
  const data = await slackApi<any>('/api/channels');
  const channels = Array.isArray(data) ? data : (data?.channels || []);
  return channels.map((ch: any) => ({
    id: ch.id,
    name: ch.name || ch.id,
    group: ch.is_channel ? 'Channels' : ch.is_im ? 'Direct Messages' : ch.is_group ? 'Groups' : 'Channels',
    count: ch.num_members,
    meta: ch,
  }));
}

async function fetchChatGPT(): Promise<SidebarItem[]> {
  const data = await chatgptApi<any>('/api/conversations');
  const conversations = Array.isArray(data) ? data : (data?.conversations || []);
  return conversations.map((c: any) => ({
    id: c.id,
    name: c.title || 'Untitled',
    group: 'Conversations',
    meta: {
      create_time: c.create_time,
      update_time: c.update_time,
      mapping: c.mapping,
    },
  }));
}

async function fetchGmail(): Promise<SidebarItem[]> {
  const data = await gmailApi<any>('/api/mailboxes');
  const mailboxes = Array.isArray(data) ? data : (data?.mailboxes || []);
  return mailboxes.map((mb: any) => {
    const name = typeof mb === 'string' ? mb : (mb.name || mb.path || mb.id || 'Unknown');
    const id = typeof mb === 'string' ? mb : (mb.id || mb.path || mb.name || 'unknown');
    return {
      id: String(id),
      name: String(name),
      group: 'Mailboxes',
      count: typeof mb === 'object' ? mb.messages : undefined,
      meta: typeof mb === 'object' ? mb : {},
    };
  });
}

async function fetchOpenClaw(): Promise<SidebarItem[]> {
  const data = await openclawApi<any>('/api/sessions');
  const sessions = Array.isArray(data) ? data : (data?.sessions || []);
  return sessions
    .filter((s: any) => s.sessionKey)
    .map((s: any) => ({
      id: s.sessionKey!,
      name: s.label || s.sessionKey || 'unnamed',
      group: s.kind || 'other',
      meta: s,
    }));
}

async function fetchAnthropic(): Promise<SidebarItem[]> {
  const data = await apiFetch<any>('/proxy/anthropic-ingestor/api/conversations');
  const conversations = Array.isArray(data) ? data : (data?.conversations || []);
  return conversations.map((c: any) => ({
    id: c.id || c.conversation_id || String(Math.random()),
    name: c.title || c.name || 'Conversation',
    group: 'Conversations',
    meta: c,
  }));
}

const FETCH_FN: Record<string, () => Promise<SidebarItem[]>> = {
  discord: fetchDiscord,
  slack: fetchSlack,
  chatgpt: fetchChatGPT,
  gmail: fetchGmail,
  openclaw: fetchOpenClaw,
  anthropic: fetchAnthropic,
};

/* ── Detail fetchers (messages for selected item) ────── */

async function fetchGmailEmails(mailboxName: string): Promise<any[]> {
  try {
    const data = await gmailApi<any>(`/api/mailbox/${encodeURIComponent(mailboxName)}`);
    return Array.isArray(data) ? data : (data?.emails || data?.messages || []);
  } catch {
    return [];
  }
}

/** Fetch messages from the memory DB for a given source + channel metadata match */
async function fetchDbMessagesForChannel(
  service: string,
  channelId: string,
): Promise<LiveMessage[]> {
  const sourceName = SOURCE_NAME_MAP[service] || service;

  try {
    // Fetch messages from the memory database API
    // We'll get a batch and filter by metadata in the client
    const data = await apiFetch<any>(
      `/api/messages?source=${sourceName}&limit=200&offset=0&sort=timestamp&order=desc`
    );
    const allMsgs: any[] = data.messages || [];

    // Filter messages that match this channel
    const filtered = allMsgs.filter(msg => {
      const meta = msg.metadata || {};
      switch (service) {
        case 'discord':
          return (meta.channelId || meta.channel_id) === channelId;
        case 'slack':
          return (meta.channelId || meta.channel_id || meta.channel) === channelId;
        case 'chatgpt':
          return (meta.conversationId || meta.conversation_id) === channelId;
        case 'anthropic':
          return (meta.conversationId || meta.conversation_id) === channelId;
        case 'openclaw':
          return (meta.sessionKey || meta.session_key || meta.sessionId || meta.session_id) === channelId;
        default:
          return false;
      }
    });

    return filtered.map(msg => ({
      id: msg.id,
      sender: msg.sender || 'Unknown',
      content: msg.content || '',
      timestamp: msg.timestamp || '',
      isAssistant: msg.sender === 'assistant' || msg.sender?.toLowerCase().includes('bot'),
      metadata: msg.metadata,
    }));
  } catch {
    return [];
  }
}

/** Try to fetch conversation content from ChatGPT ingestor */
async function fetchChatGPTConversation(conversationId: string): Promise<LiveMessage[]> {
  try {
    const data = await chatgptApi<any>(`/api/conversations/${conversationId}`);
    // Parse the conversation mapping into messages
    const mapping = data?.mapping || data?.conversation?.mapping || {};
    const messages: LiveMessage[] = [];

    for (const [, node] of Object.entries<any>(mapping)) {
      if (!node?.message?.content?.parts) continue;
      const msg = node.message;
      const role = msg.author?.role || 'unknown';
      const content = msg.content.parts.filter((p: any) => typeof p === 'string').join('\n');
      if (!content.trim()) continue;

      messages.push({
        id: msg.id,
        sender: role === 'assistant' ? 'ChatGPT' : role === 'user' ? 'You' : role,
        content,
        timestamp: msg.create_time ? new Date(msg.create_time * 1000).toISOString() : '',
        isAssistant: role === 'assistant',
      });
    }

    return messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  } catch {
    // Fall back to DB messages
    return fetchDbMessagesForChannel('chatgpt', conversationId);
  }
}

/** Try to fetch conversation from Anthropic ingestor */
async function fetchAnthropicConversation(conversationId: string): Promise<LiveMessage[]> {
  try {
    const data = await apiFetch<any>(`/proxy/anthropic-ingestor/api/conversations/${conversationId}`);
    const msgs = data?.messages || data?.chat_messages || [];
    if (Array.isArray(msgs) && msgs.length > 0) {
      return msgs.map((msg: any) => ({
        id: msg.uuid || msg.id,
        sender: msg.sender === 'human' ? 'You' : msg.sender === 'assistant' ? 'Claude' : (msg.sender || 'Unknown'),
        content: typeof msg.text === 'string' ? msg.text : (
          Array.isArray(msg.content) ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') : (msg.content || '')
        ),
        timestamp: msg.created_at || msg.timestamp || '',
        isAssistant: msg.sender === 'assistant',
      }));
    }
    return fetchDbMessagesForChannel('anthropic', conversationId);
  } catch {
    return fetchDbMessagesForChannel('anthropic', conversationId);
  }
}

/** Fetch OpenClaw session history */
async function fetchOpenClawSession(sessionKey: string): Promise<LiveMessage[]> {
  try {
    const data = await openclawApi<any>(`/api/sessions/${encodeURIComponent(sessionKey)}/history`);
    const msgs = data?.messages || data?.history || [];
    if (Array.isArray(msgs) && msgs.length > 0) {
      return msgs.map((msg: any) => ({
        id: msg.id || msg.timestamp,
        sender: msg.role === 'assistant' ? 'OpenClaw' : msg.role === 'user' ? 'You' : (msg.sender || msg.role || 'Unknown'),
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
        timestamp: msg.timestamp || msg.created_at || '',
        isAssistant: msg.role === 'assistant',
      }));
    }
    return fetchDbMessagesForChannel('openclaw', sessionKey);
  } catch {
    return fetchDbMessagesForChannel('openclaw', sessionKey);
  }
}

/** Fetch Discord channel messages from DB */
async function fetchDiscordChannel(channelId: string): Promise<LiveMessage[]> {
  return fetchDbMessagesForChannel('discord', channelId);
}

/** Fetch Slack channel messages from DB */
async function fetchSlackChannel(channelId: string): Promise<LiveMessage[]> {
  return fetchDbMessagesForChannel('slack', channelId);
}

/* ── Component ───────────────────────────────────────── */

export default function AppViewLive({ service, serviceLabel, serviceKey }: AppViewLiveProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [items, setItems] = useState<SidebarItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [detailData, setDetailData] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [channelMessages, setChannelMessages] = useState<LiveMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const theme = SERVICE_THEMES[service] || SERVICE_THEMES.discord;

  // Auto-fetch on mount
  useEffect(() => {
    handleFetch();
  }, [service]);

  const handleFetch = async () => {
    const fetchFn = FETCH_FN[service];
    if (!fetchFn) {
      setStatus('error');
      setError(`No live data fetcher for ${serviceLabel}`);
      return;
    }

    setStatus('loading');
    setError('');
    try {
      const data = await fetchFn();
      setItems(data);
      setStatus('done');
    } catch (e: unknown) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Failed to fetch data');
    }
  };

  // Filter items
  const filtered = useMemo(() => {
    if (!filter) return items;
    const f = filter.toLowerCase();
    return items.filter(item =>
      item.name.toLowerCase().includes(f) ||
      item.id.toLowerCase().includes(f) ||
      (item.group || '').toLowerCase().includes(f)
    );
  }, [items, filter]);

  // Group items
  const groups = useMemo((): ItemGroup[] => {
    const groupMap: Record<string, SidebarItem[]> = {};
    for (const item of filtered) {
      const key = item.group || 'Other';
      (groupMap[key] ||= []).push(item);
    }
    return Object.entries(groupMap)
      .map(([name, groupItems]) => ({ name, items: groupItems }))
      .sort((a, b) => {
        if (a.name === 'Direct Messages' || a.name === 'Other') return 1;
        if (b.name === 'Direct Messages' || b.name === 'Other') return -1;
        return a.name.localeCompare(b.name);
      });
  }, [filtered]);

  const selectedItem = useMemo(() => items.find(i => i.id === selectedId), [items, selectedId]);

  // Fetch detail data + messages when item selected
  const handleSelect = useCallback(async (item: SidebarItem) => {
    setSelectedId(item.id);
    setDetailData([]);
    setChannelMessages([]);
    setMessagesLoading(true);

    try {
      switch (service) {
        case 'gmail': {
          setDetailLoading(true);
          try {
            const emails = await fetchGmailEmails(item.name);
            setDetailData(emails);
          } catch {
            // ignore
          } finally {
            setDetailLoading(false);
          }
          break;
        }
        case 'discord': {
          const msgs = await fetchDiscordChannel(item.id);
          setChannelMessages(msgs);
          break;
        }
        case 'slack': {
          const msgs = await fetchSlackChannel(item.id);
          setChannelMessages(msgs);
          break;
        }
        case 'chatgpt': {
          const msgs = await fetchChatGPTConversation(item.id);
          setChannelMessages(msgs);
          break;
        }
        case 'anthropic': {
          const msgs = await fetchAnthropicConversation(item.id);
          setChannelMessages(msgs);
          break;
        }
        case 'openclaw': {
          const msgs = await fetchOpenClawSession(item.id);
          setChannelMessages(msgs);
          break;
        }
        default: {
          const msgs = await fetchDbMessagesForChannel(service, item.id);
          setChannelMessages(msgs);
        }
      }
    } finally {
      setMessagesLoading(false);
    }
  }, [service]);

  const toggleGroup = (name: string) => {
    setCollapsedGroups(prev => ({ ...prev, [name]: !prev[name] }));
  };

  /* ── Render: loading/error states ──────────────────── */

  if (status === 'idle' || status === 'loading') {
    return (
      <div>
        <h1 className="page-title">🔴 {serviceLabel} — Live View</h1>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <p style={{ color: '#888' }}>Connecting to {serviceLabel}…</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div>
        <h1 className="page-title">🔴 {serviceLabel} — Live View</h1>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Connection Failed</h2>
          <p style={{ color: '#888', maxWidth: 500, margin: '0 auto 20px', lineHeight: 1.6 }}>
            Could not connect to {serviceLabel} ingestor. Make sure it's configured and running.
          </p>
          {error && (
            <div className="error-box" style={{ maxWidth: 500, margin: '0 auto 16px', textAlign: 'left', fontSize: 13 }}>
              {error}
            </div>
          )}
          <button onClick={handleFetch} style={{ padding: '10px 24px', borderColor: theme.accent, color: theme.accent }}>
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  /* ── Render: App-like view ─────────────────────────── */

  return (
    <div>
      <h1 className="page-title">🔴 {serviceLabel} — Live View</h1>
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
          width: 260,
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
              {serviceLabel}
            </span>
            <span style={{ fontSize: 12, color: '#888' }}>
              {filtered.length} items
            </span>
          </div>

          {/* Search */}
          <div style={{ padding: '8px 10px' }}>
            <input
              placeholder="Search…"
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

          {/* Items list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 8px' }}>
            {groups.map(group => {
              const isCollapsed = collapsedGroups[group.name] ?? false;
              return (
                <div key={group.name}>
                  {/* Group header */}
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
                        {group.items.length}
                      </span>
                    </div>
                  )}

                  {/* Group items */}
                  {!isCollapsed && group.items.map(item => {
                    const isSelected = item.id === selectedId;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        style={{
                          padding: '6px 10px',
                          margin: '1px 0',
                          borderRadius: 4,
                          cursor: 'pointer',
                          background: isSelected ? theme.selectedBg : 'transparent',
                          color: isSelected ? '#fff' : '#b5bac1',
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'background 0.1s',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = theme.selectedBg + '80';
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                        }}
                      >
                        {theme.prefix && (
                          <span style={{ color: '#888', fontSize: 16, fontWeight: 400 }}>{theme.prefix}</span>
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                          {item.name}
                        </span>
                        {item.count !== undefined && (
                          <span style={{ fontSize: 11, color: '#666', flexShrink: 0 }}>{item.count}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#666', fontSize: 13 }}>
                {filter ? 'No matches' : 'No items found'}
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
          {!selectedItem ? (
            /* No selection placeholder */
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>
                {service === 'discord' ? '👾' : service === 'slack' ? '💬' : service === 'chatgpt' ? '🤖' : service === 'gmail' ? '📬' : service === 'openclaw' ? '🦞' : '📋'}
              </div>
              <p style={{ fontSize: 16 }}>Select an item from the sidebar</p>
              <p style={{ fontSize: 13, color: '#555' }}>{filtered.length} items available</p>
            </div>
          ) : (
            /* Selected item with messages */
            <>
              {/* Header bar */}
              <div style={{
                padding: '14px 20px',
                borderBottom: `1px solid ${theme.sidebarBorder}`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexShrink: 0,
              }}>
                {theme.prefix && <span style={{ color: '#888', fontSize: 20 }}>{theme.prefix}</span>}
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, flex: 1 }}>{selectedItem.name}</h2>
                {selectedItem.group && (
                  <span style={{ fontSize: 12, color: '#888' }}>
                    {selectedItem.group}
                  </span>
                )}
                {channelMessages.length > 0 && (
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {channelMessages.length} messages
                  </span>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {service === 'gmail' ? (
                  renderGmailDetail(selectedItem, detailData, detailLoading, theme)
                ) : messagesLoading ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                    Loading messages…
                  </div>
                ) : channelMessages.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {channelMessages.map((msg, i) => (
                      <LiveMessageBubble key={msg.id || i} msg={msg} service={service} theme={theme} />
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: 40, textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 12, color: '#555' }}>💬</div>
                    <p style={{ color: '#888', fontSize: 14, marginBottom: 8 }}>No messages found</p>
                    <p style={{ color: '#555', fontSize: 13 }}>
                      Messages for this {service === 'chatgpt' || service === 'anthropic' ? 'conversation' : 'channel'} may not be synced to the database yet.
                    </p>
                    {renderItemInfo(service, selectedItem)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Refresh button */}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleFetch} style={{ fontSize: 12, padding: '6px 14px', color: '#888' }}>
          🔄 Refresh data
        </button>
      </div>
    </div>
  );
}

/* ── Live message bubble ─────────────────────────────── */

function LiveMessageBubble({ msg, service, theme }: {
  msg: LiveMessage;
  service: string;
  theme: typeof SERVICE_THEMES.discord;
}) {
  const ts = msg.timestamp ? new Date(msg.timestamp) : null;
  const timeStr = ts && !isNaN(ts.getTime()) ? ts.toLocaleString() : '';

  const isChatService = service === 'chatgpt' || service === 'anthropic' || service === 'openclaw';

  return (
    <div style={{
      padding: '8px 12px',
      background: theme.msgBubbleBg || '#2a2a3a',
      borderRadius: 6,
      borderLeft: `3px solid ${
        isChatService
          ? (msg.isAssistant ? theme.accent : '#888')
          : theme.accent + '60'
      }`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{
          fontWeight: 600,
          fontSize: 13,
          color: isChatService
            ? (msg.isAssistant ? theme.accent : '#e0e0e0')
            : theme.accent,
        }}>
          {msg.sender}
        </span>
        <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>{timeStr}</span>
      </div>
      <div style={{
        fontSize: 14,
        lineHeight: 1.5,
        color: '#ddd',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: 400,
        overflow: 'auto',
      }}>
        {msg.content || '(no content)'}
      </div>
    </div>
  );
}

/* ── Item info (shown when no messages) ──────────────── */

function renderItemInfo(service: string, item: SidebarItem) {
  return (
    <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 400, margin: '16px auto 0' }}>
      <InfoField label="ID" value={item.id} />
      {item.group && <InfoField label="Group" value={item.group} />}
      {item.meta && Object.entries(item.meta).slice(0, 4).map(([k, v]) => (
        v && typeof v !== 'object' ? <InfoField key={k} label={k} value={String(v)} /> : null
      ))}
    </div>
  );
}

/* ── Gmail detail (special case — shows email list) ─── */

function renderGmailDetail(
  item: SidebarItem,
  emails: any[],
  loading: boolean,
  theme: typeof SERVICE_THEMES.gmail,
) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: '#c7161020',
          borderRadius: 8,
          border: '1px solid #c7161040',
        }}>
          <span style={{ fontSize: 20 }}>📁</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</span>
          {item.count !== undefined && (
            <span style={{ fontSize: 12, color: '#888' }}>({item.count})</span>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Loading emails…</div>
      ) : emails.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>No emails in this mailbox or fetching not supported</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {emails.slice(0, 50).map((email: any, i: number) => (
            <div key={email.uid || email.id || i} style={{
              padding: '10px 14px',
              background: '#1e1e3a',
              borderRadius: 6,
              border: '1px solid #2a2a4e',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: email.flags?.includes('\\Seen') ? 400 : 700,
                  fontSize: 14,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {email.subject || '(no subject)'}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {email.from || email.sender || 'Unknown sender'}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#666', flexShrink: 0, whiteSpace: 'nowrap' }}>
                {email.date ? new Date(email.date).toLocaleDateString() : ''}
              </div>
            </div>
          ))}
          {emails.length > 50 && (
            <div style={{ padding: 8, textAlign: 'center', color: '#666', fontSize: 12 }}>
              Showing 50 of {emails.length} emails
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Helper components ───────────────────────────────── */

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}
