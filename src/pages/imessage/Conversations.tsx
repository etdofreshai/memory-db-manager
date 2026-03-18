import React, { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '../../api';

interface Conversation {
  conversation_id: string;
  display_name: string;
  last_message: string;
  last_message_at: string;
  message_count: number;
  is_group: boolean;
}

interface Message {
  id: number;
  record_id: string;
  content: string;
  sender: string;
  recipient: string;
  timestamp: string;
  is_from_me: boolean;
  attachments: Attachment[];
}

interface Attachment {
  record_id: string;
  mime_type: string;
  original_file_name: string;
  url_local: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fullTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function dateDivider(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function avatarColor(name: string): string {
  const colors = ['#5e72e4','#11cdef','#2dce89','#fb6340','#f5365c','#8965e0','#f3a4b5','#ffd600'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function IMessageConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState('');
  const [msgError, setMsgError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async (q = '') => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{ conversations: Conversation[] }>(
        `/api/imessage/conversations?q=${encodeURIComponent(q)}&limit=100`
      );
      setConversations(data.conversations || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    const t = setTimeout(() => fetchConversations(search), 300);
    return () => clearTimeout(t);
  }, [search, fetchConversations]);

  const fetchMessages = useCallback(async (conv: Conversation, p = 1, prepend = false) => {
    setLoadingMsgs(true);
    setMsgError('');
    try {
      const data = await apiFetch<{ messages: Message[]; has_more: boolean }>(
        `/api/imessage/messages/${encodeURIComponent(conv.conversation_id)}?page=${p}&limit=50`
      );
      const msgs = data.messages || [];
      if (prepend) {
        setMessages(prev => [...msgs, ...prev]);
      } else {
        setMessages(msgs);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
      setHasMore(data.has_more || false);
    } catch (e: any) {
      setMsgError(e.message);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const selectConversation = (conv: Conversation) => {
    setSelected(conv);
    setPage(1);
    setMessages([]);
    fetchMessages(conv, 1);
  };

  const loadOlder = () => {
    if (!selected || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchMessages(selected, nextPage, true);
  };

  // Group messages by date for dividers
  const groupedMessages = () => {
    const groups: { divider: string; msgs: Message[] }[] = [];
    let lastDivider = '';
    for (const msg of messages) {
      const div = dateDivider(msg.timestamp);
      if (div !== lastDivider) {
        groups.push({ divider: div, msgs: [] });
        lastDivider = div;
      }
      groups[groups.length - 1].msgs.push(msg);
    }
    return groups;
  };

  const filteredConvos = conversations; // already filtered server-side

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', background: '#1c1c1e', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif' }}>
      {/* Conversation List */}
      <div style={{
        width: selected ? '320px' : '100%',
        minWidth: '280px',
        borderRight: '1px solid #2c2c2e',
        display: 'flex',
        flexDirection: 'column',
        background: '#1c1c1e',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid #2c2c2e' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 10 }}>💬 iMessage</div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 12px', borderRadius: 10,
              background: '#2c2c2e', border: 'none',
              color: '#fff', fontSize: 14, outline: 'none',
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ color: '#8e8e93', padding: 20, textAlign: 'center' }}>Loading…</div>}
          {error && <div style={{ color: '#ff453a', padding: 16 }}>{error}</div>}
          {!loading && filteredConvos.length === 0 && (
            <div style={{ color: '#8e8e93', padding: 20, textAlign: 'center' }}>No conversations found</div>
          )}
          {filteredConvos.map(conv => {
            const isActive = selected?.conversation_id === conv.conversation_id;
            const color = avatarColor(conv.display_name);
            return (
              <div
                key={conv.conversation_id}
                onClick={() => selectConversation(conv)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', cursor: 'pointer',
                  background: isActive ? '#2c2c2e' : 'transparent',
                  borderBottom: '1px solid #2c2c2e',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = '#242426'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: color, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 600, color: '#fff',
                }}>
                  {conv.is_group ? '👥' : initials(conv.display_name)}
                </div>
                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 600, color: '#fff', fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                      {conv.display_name}
                    </span>
                    <span style={{ color: '#8e8e93', fontSize: 12, flexShrink: 0 }}>
                      {relativeTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div style={{ color: '#8e8e93', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {conv.last_message || '(attachment)'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat View */}
      {selected && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#000', minWidth: 0 }}>
          {/* Header */}
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid #2c2c2e',
            display: 'flex', alignItems: 'center', gap: 12, background: '#1c1c1e',
          }}>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', color: '#007AFF', fontSize: 16, cursor: 'pointer', padding: '4px 0' }}
            >
              ← Back
            </button>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: avatarColor(selected.display_name),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 600, color: '#fff',
            }}>
              {selected.is_group ? '👥' : initials(selected.display_name)}
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>{selected.display_name}</div>
              <div style={{ color: '#8e8e93', fontSize: 12 }}>{selected.message_count.toLocaleString()} messages</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
            <div ref={messagesTopRef} />

            {/* Load older */}
            {hasMore && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <button
                  onClick={loadOlder}
                  disabled={loadingMsgs}
                  style={{ background: '#2c2c2e', border: 'none', color: '#007AFF', padding: '8px 16px', borderRadius: 16, cursor: 'pointer', fontSize: 13 }}
                >
                  {loadingMsgs ? 'Loading…' : 'Load older messages'}
                </button>
              </div>
            )}

            {msgError && <div style={{ color: '#ff453a', textAlign: 'center', marginBottom: 12 }}>{msgError}</div>}
            {loadingMsgs && messages.length === 0 && (
              <div style={{ color: '#8e8e93', textAlign: 'center', padding: 40 }}>Loading messages…</div>
            )}

            {groupedMessages().map(({ divider, msgs }) => (
              <div key={divider}>
                {/* Date divider */}
                <div style={{ textAlign: 'center', margin: '16px 0 8px', color: '#8e8e93', fontSize: 12, fontWeight: 500 }}>
                  {divider}
                </div>
                {msgs.map((msg, idx) => {
                  const isMe = msg.is_from_me;
                  const prevMsg = idx > 0 ? msgs[idx - 1] : null;
                  const sameAsPrev = prevMsg && prevMsg.is_from_me === msg.is_from_me;
                  const hasContent = msg.content && msg.content.trim();

                  return (
                    <div key={msg.id} style={{
                      display: 'flex',
                      flexDirection: isMe ? 'row-reverse' : 'row',
                      alignItems: 'flex-end',
                      marginBottom: sameAsPrev ? 2 : 8,
                      gap: 8,
                    }}>
                      <div style={{ maxWidth: '70%' }}>
                        {/* Attachments */}
                        {msg.attachments?.map(att => {
                          const isImage = att.mime_type?.startsWith('image/');
                          const isVideo = att.mime_type?.startsWith('video/');
                          const isAudio = att.mime_type?.startsWith('audio/');
                          const fileUrl = `/api/attachments/${att.record_id}/file`;
                          return (
                            <div key={att.record_id} style={{ marginBottom: 4 }}>
                              {isImage && (
                                <img
                                  src={fileUrl}
                                  alt={att.original_file_name}
                                  onClick={() => setLightbox(fileUrl)}
                                  style={{
                                    maxWidth: 240, maxHeight: 240, borderRadius: 16,
                                    cursor: 'pointer', display: 'block',
                                    border: '1px solid #2c2c2e',
                                  }}
                                />
                              )}
                              {isVideo && (
                                <video controls style={{ maxWidth: 280, borderRadius: 16, display: 'block' }}>
                                  <source src={fileUrl} type={att.mime_type} />
                                </video>
                              )}
                              {isAudio && (
                                <audio controls style={{ maxWidth: 280 }}>
                                  <source src={fileUrl} type={att.mime_type} />
                                </audio>
                              )}
                              {!isImage && !isVideo && !isAudio && (
                                <a
                                  href={fileUrl}
                                  download={att.original_file_name}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 14px', borderRadius: 16,
                                    background: isMe ? '#007AFF' : '#2c2c2e',
                                    color: '#fff', textDecoration: 'none', fontSize: 13,
                                  }}
                                >
                                  📎 {att.original_file_name || 'Download file'}
                                </a>
                              )}
                            </div>
                          );
                        })}

                        {/* Text bubble */}
                        {hasContent && (
                          <div
                            title={fullTime(msg.timestamp)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: sameAsPrev
                                ? (isMe ? '18px 4px 4px 18px' : '4px 18px 18px 4px')
                                : '18px',
                              background: isMe ? '#007AFF' : '#2c2c2e',
                              color: '#fff',
                              fontSize: 15,
                              lineHeight: 1.4,
                              wordBreak: 'break-word',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {msg.content}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, cursor: 'zoom-out',
          }}
        >
          <img src={lightbox} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
