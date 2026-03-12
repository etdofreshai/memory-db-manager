import React, { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, chatgptApi } from '../../api';

interface Message {
  id: string;
  sender: string;
  recipient: string;
  content: string;
  timestamp: string;
  metadata?: {
    role?: string;
    parts?: any[];
  };
}

interface ConversationInfo {
  id: string;
  title?: string;
}

interface MessagesResponse {
  messages: Message[];
  total: number;
  page: number;
  totalPages: number;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function isUserMessage(msg: Message): boolean {
  const role = msg.metadata?.role || msg.sender;
  return role === 'user' || role === 'human';
}

function formatMessagesForCopy(msgs: Message[]): string {
  return msgs
    .map(msg => {
      const label = isUserMessage(msg) ? 'You' : 'ChatGPT';
      return `${label}: ${msg.content}`;
    })
    .join('\n\n');
}

export default function ConversationView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [title, setTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState('');
  const [loadedPage, setLoadedPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // copy feedback: key = button id, value = boolean (showing "Copied!")
  const [copyFeedback, setCopyFeedback] = useState<Record<string, boolean>>({});

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // After prepend, we need to restore scroll position
  const pendingScrollRestore = useRef<number | null>(null);
  const PAGE_SIZE = 50;

  const triggerCopyFeedback = (key: string) => {
    setCopyFeedback(prev => ({ ...prev, [key]: true }));
    setTimeout(() => setCopyFeedback(prev => ({ ...prev, [key]: false })), 1500);
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      triggerCopyFeedback(key);
    } catch {
      // fallback
    }
  };

  // Fetch a range of pages (newest-first pages p1..p2 inclusive), return reversed (oldest first) combined array
  const fetchPageRange = useCallback(async (p1: number, p2: number): Promise<Message[]> => {
    if (!id) return [];
    const pages = [];
    for (let p = p1; p <= p2; p++) pages.push(p);
    const results = await Promise.all(
      pages.map(p =>
        apiFetch<MessagesResponse>(
          `/api/messages?source=chatgpt&recipient=${encodeURIComponent(id)}&page=${p}&limit=${PAGE_SIZE}`
        )
      )
    );
    // Each page is newest-first within that page. Pages p1..p2 where p1=newer, p2=older.
    // To get oldest-first overall: reverse page order, then reverse each page's messages
    const combined: Message[] = [];
    for (let i = results.length - 1; i >= 0; i--) {
      const reversed = [...(results[i].messages || [])].reverse();
      combined.push(...reversed);
    }
    return combined;
  }, [id]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const data = await apiFetch<MessagesResponse>(
          `/api/messages?source=chatgpt&recipient=${encodeURIComponent(id)}&page=1&limit=${PAGE_SIZE}`
        );
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
        setMessages([...(data.messages || [])].reverse());
        setLoadedPage(1);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id]);

  // After prepend: restore scroll position using layout effect
  useLayoutEffect(() => {
    if (pendingScrollRestore.current !== null && scrollRef.current) {
      const container = scrollRef.current;
      container.scrollTop = container.scrollHeight - pendingScrollRestore.current;
      pendingScrollRestore.current = null;
    }
  });

  const handleLoadMore = useCallback(async () => {
    if (!id || loadingMore || loadedPage >= totalPages) return;
    const container = scrollRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;

    setLoadingMore(true);
    try {
      const nextPage = loadedPage + 1;
      const data = await apiFetch<MessagesResponse>(
        `/api/messages?source=chatgpt&recipient=${encodeURIComponent(id)}&page=${nextPage}&limit=${PAGE_SIZE}`
      );
      const older = [...(data.messages || [])].reverse();
      // Store scroll height before state update so layout effect can restore
      pendingScrollRestore.current = prevScrollHeight;
      setMessages(prev => [...older, ...prev]);
      setLoadedPage(nextPage);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [id, loadingMore, loadedPage, totalPages]);

  const handleLoadN = useCallback(async (n: number) => {
    if (!id || loadingAll || loadedPage >= totalPages) return;
    const pagesToLoad = Math.min(n, totalPages - loadedPage);
    if (pagesToLoad <= 0) return;
    const approxMessages = pagesToLoad * PAGE_SIZE;
    if (approxMessages > 500) {
      const ok = window.confirm(`Load ~${approxMessages} more messages? This may be slow.`);
      if (!ok) return;
    }
    const container = scrollRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;
    setLoadingAll(true);
    try {
      const pages: Promise<MessagesResponse>[] = [];
      for (let p = loadedPage + 1; p <= loadedPage + pagesToLoad; p++) {
        pages.push(apiFetch<MessagesResponse>(
          `/api/messages?source=chatgpt&recipient=${encodeURIComponent(id)}&page=${p}&limit=${PAGE_SIZE}`
        ));
      }
      const results = await Promise.all(pages);
      const combined: Message[] = [];
      for (let i = results.length - 1; i >= 0; i--) {
        combined.push(...[...(results[i].messages || [])].reverse());
      }
      pendingScrollRestore.current = prevScrollHeight;
      setMessages(prev => [...combined, ...prev]);
      setLoadedPage(prev => prev + pagesToLoad);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingAll(false);
    }
  }, [id, loadingAll, loadedPage, totalPages]);

  // Scroll detection for floating button
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- Copy handlers ---
  const handleCopyPage = async () => {
    const text = formatMessagesForCopy(messages);
    await copyText(text, 'page');
  };

  const handleCopyLast = async (count: number) => {
    if (!id) return;
    const key = `last${count}`;
    const pagesNeeded = Math.ceil(count / PAGE_SIZE);
    try {
      // Pages 1..pagesNeeded are the newest
      const results = await Promise.all(
        Array.from({ length: pagesNeeded }, (_, i) =>
          apiFetch<MessagesResponse>(
            `/api/messages?source=chatgpt&recipient=${encodeURIComponent(id)}&page=${i + 1}&limit=${PAGE_SIZE}`
          )
        )
      );
      // Combine oldest-first: reverse page order, reverse each page
      const combined: Message[] = [];
      for (let i = results.length - 1; i >= 0; i--) {
        combined.push(...[...(results[i].messages || [])].reverse());
      }
      const slice = combined.slice(-count);
      await copyText(formatMessagesForCopy(slice), key);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleCopyAll = async () => {
    if (!id) return;
    try {
      const allPages = await Promise.all(
        Array.from({ length: totalPages }, (_, i) =>
          apiFetch<MessagesResponse>(
            `/api/messages?source=chatgpt&recipient=${encodeURIComponent(id)}&page=${i + 1}&limit=${PAGE_SIZE}`
          )
        )
      );
      const combined: Message[] = [];
      for (let i = allPages.length - 1; i >= 0; i--) {
        combined.push(...[...(allPages[i].messages || [])].reverse());
      }
      await copyText(formatMessagesForCopy(combined), 'all');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const displayTitle = title || id || 'Conversation';
  const canLoadMore = loadedPage < totalPages;

  // Try to get conversation title
  useEffect(() => {
    if (!id) return;
    chatgptApi<ConversationInfo[]>('/api/conversations').then(convs => {
      const match = convs.find(c => c.id === id);
      if (match?.title) setTitle(match.title);
    }).catch(() => {});
  }, [id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Title bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button
          onClick={() => navigate('/chatgpt/conversations')}
          className="btn-secondary"
          style={{ padding: '4px 10px', fontSize: 13, flexShrink: 0 }}
        >
          ← Back
        </button>
        <h1 className="page-title" style={{ margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          💬 {displayTitle}
        </h1>
        <span style={{ color: '#888', fontSize: 13, flexShrink: 0 }}>{total} messages</span>
      </div>

      {/* Copy toolbar */}
      <div style={{
        display: 'flex',
        gap: 6,
        marginBottom: 10,
        flexWrap: 'wrap',
        padding: '6px 8px',
        background: '#1e1e2e',
        borderRadius: 8,
        border: '1px solid #313244',
      }}>
        <button
          className="btn-secondary"
          onClick={handleCopyPage}
          style={{ padding: '4px 10px', fontSize: 12 }}
        >
          {copyFeedback['page'] ? '✓ Copied!' : '📋 Copy page'}
        </button>
        {total >= 100 && (
          <button
            className="btn-secondary"
            onClick={() => handleCopyLast(100)}
            style={{ padding: '4px 10px', fontSize: 12 }}
          >
            {copyFeedback['last100'] ? '✓ Copied!' : '📋 Copy last 100'}
          </button>
        )}
        {total >= 500 && (
          <button
            className="btn-secondary"
            onClick={() => handleCopyLast(500)}
            style={{ padding: '4px 10px', fontSize: 12 }}
          >
            {copyFeedback['last500'] ? '✓ Copied!' : '📋 Copy last 500'}
          </button>
        )}
        <button
          className="btn-secondary"
          onClick={handleCopyAll}
          style={{ padding: '4px 10px', fontSize: 12 }}
        >
          {copyFeedback['all'] ? '✓ Copied!' : `📋 Copy all (${total})`}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <p style={{ color: '#888' }}>Loading messages…</p>
      ) : messages.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: '#888' }}>
          <p>No messages found for this conversation.</p>
          <p style={{ fontSize: 12, marginTop: 8 }}>The conversation may not have been synced yet.</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}
        >
          {/* Load N pages buttons at top */}
          {canLoadMore && (() => {
            const remaining = totalPages - loadedPage;
            const busy = loadingMore || loadingAll;
            const opts = [
              { label: '+1 page', n: 1 },
              { label: '+10 pages', n: 10 },
              { label: '+100 pages', n: 100 },
              { label: '+500 pages', n: 500 },
            ].filter(o => o.n <= remaining || o.n === 1);
            return (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', padding: '8px 0 4px' }}>
                {busy && <span style={{ color: '#888', fontSize: 13, alignSelf: 'center' }}>⏳ Loading…</span>}
                {!busy && opts.map(o => (
                  <button
                    key={o.n}
                    className="btn-secondary"
                    onClick={() => o.n === 1 ? handleLoadMore() : handleLoadN(o.n)}
                    style={{ padding: '4px 10px', fontSize: 12 }}
                  >
                    ⬆ {o.label}
                  </button>
                ))}
                {!busy && remaining > 1 && (
                  <button
                    className="btn-secondary"
                    onClick={() => handleLoadN(remaining)}
                    style={{ padding: '4px 10px', fontSize: 12, color: '#64b5f6' }}
                  >
                    ⬆⬆ Load all ({remaining * PAGE_SIZE}+ msgs)
                  </button>
                )}
              </div>
            );
          })()}

          {messages.map(msg => {
            const isUser = isUserMessage(msg);
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                  padding: '0 4px',
                }}
              >
                <div
                  style={{
                    maxWidth: '75%',
                    background: isUser ? '#3b82f6' : '#2a2a3e',
                    color: '#cdd6f4',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    padding: '8px 14px',
                    fontSize: 14,
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content}
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2, padding: '0 4px' }}>
                  {isUser ? 'You' : 'ChatGPT'} · {formatTime(msg.timestamp)}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Floating scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            zIndex: 10,
          }}
          title="Scroll to bottom"
        >
          ↓
        </button>
      )}
    </div>
  );
}
