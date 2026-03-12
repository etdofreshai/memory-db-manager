import React, { useEffect, useState, useCallback, useRef } from 'react';
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

export default function ConversationView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [title, setTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 50;

  const fetchMessages = useCallback(async (p: number, scrollToBottom = false) => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await apiFetch<MessagesResponse>(
        `/api/messages?source=chatgpt&recipient=${encodeURIComponent(id)}&page=${p}&limit=${PAGE_SIZE}&sort=asc`
      );
      setMessages(data.messages || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      if (scrollToBottom) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // On first load: jump to last page so most recent messages show, then scroll to bottom
  useEffect(() => {
    const init = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const first = await apiFetch<MessagesResponse>(
          `/api/messages?source=chatgpt&recipient=${encodeURIComponent(id)}&page=1&limit=${PAGE_SIZE}&sort=asc`
        );
        const lastPage = first.totalPages || 1;
        setTotalPages(lastPage);
        setTotal(first.total || 0);
        if (lastPage > 1) {
          const last = await apiFetch<MessagesResponse>(
            `/api/messages?source=chatgpt&recipient=${encodeURIComponent(id)}&page=${lastPage}&limit=${PAGE_SIZE}&sort=asc`
          );
          setMessages(last.messages || []);
          setPage(lastPage);
        } else {
          setMessages(first.messages || []);
          setPage(1);
        }
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id]);

  // Page changes after initial load
  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    fetchMessages(p, p === totalPages);
  }, [fetchMessages, totalPages]);

  // Try to get conversation title
  useEffect(() => {
    if (!id) return;
    chatgptApi<ConversationInfo[]>('/api/conversations').then(convs => {
      const match = convs.find(c => c.id === id);
      if (match?.title) setTitle(match.title);
    }).catch(() => {});
  }, [id]);

  const displayTitle = title || id || 'Conversation';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => navigate('/chatgpt/conversations')}
          className="btn-secondary"
          style={{ padding: '4px 10px', fontSize: 13 }}
        >
          ← Back
        </button>
        <h1 className="page-title" style={{ margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          💬 {displayTitle}
        </h1>
        <span style={{ color: '#888', fontSize: 13 }}>{total} messages</span>
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
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
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

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            disabled={page === 1}
            onClick={() => handlePageChange(1)}
            style={{ padding: '4px 12px', fontSize: 12 }}
          >
            ⟨⟨ Oldest
          </button>
          <button
            className="btn-secondary"
            disabled={page === 1}
            onClick={() => handlePageChange(Math.max(1, page - 1))}
            style={{ padding: '4px 12px' }}
          >
            ← Prev
          </button>
          <span style={{ color: '#888', fontSize: 13 }}>Page {page} of {totalPages}</span>
          <button
            className="btn-secondary"
            disabled={page === totalPages}
            onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
            style={{ padding: '4px 12px' }}
          >
            Next →
          </button>
          <button
            className="btn-secondary"
            disabled={page === totalPages}
            onClick={() => handlePageChange(totalPages)}
            style={{ padding: '4px 12px', fontSize: 12 }}
          >
            Newest ⟩⟩
          </button>
        </div>
      )}
    </div>
  );
}
