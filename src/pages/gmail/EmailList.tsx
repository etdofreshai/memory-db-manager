import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { gmailApi } from '../../api';

interface EmailEnvelope {
  uid: number;
  flags: string[];
  date: string;
  subject: string;
  from: Array<{ name?: string; address?: string }>;
  to: Array<{ name?: string; address?: string }>;
}

interface EmailsResponse {
  messages: EmailEnvelope[];
  total: number;
  page: number;
  limit: number;
}

function formatFrom(from: EmailEnvelope['from']): string {
  if (!from || from.length === 0) return '(unknown)';
  const f = from[0];
  return f.name || f.address || '(unknown)';
}

export default function EmailList() {
  const { mailbox } = useParams<{ mailbox: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const decodedMailbox = mailbox ? decodeURIComponent(mailbox) : 'INBOX';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = 20;

  const [emails, setEmails] = useState<EmailEnvelope[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [pendingSearch, setPendingSearch] = useState(search);

  useEffect(() => {
    setLoading(true);
    setError('');
    const q = searchParams.get('q') || '';
    setSearch(q);
    setPendingSearch(q);

    const fetchFn = q
      ? gmailApi<EmailsResponse>(`/api/emails/search?q=${encodeURIComponent(q)}&mailbox=${encodeURIComponent(decodedMailbox)}&page=${page}&limit=${limit}`)
      : gmailApi<EmailsResponse>(`/api/emails?mailbox=${encodeURIComponent(decodedMailbox)}&page=${page}&limit=${limit}`);

    fetchFn
      .then(data => {
        setEmails(data.messages || []);
        setTotal(data.total || 0);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [decodedMailbox, page, searchParams]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const p: Record<string, string> = { page: '1' };
    if (pendingSearch) p.q = pendingSearch;
    setSearchParams(p);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Link to="/gmail/mailboxes" style={{ color: '#888', textDecoration: 'none' }}>← Mailboxes</Link>
        <span style={{ color: '#555' }}>/</span>
        <h1 className="page-title" style={{ margin: 0 }}>📁 {decodedMailbox}</h1>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search emails (Gmail syntax supported)…"
          value={pendingSearch}
          onChange={e => setPendingSearch(e.target.value)}
          style={{
            flex: 1, padding: '8px 12px',
            background: '#1e1e2e', border: '1px solid #333', borderRadius: 6,
            color: '#e0e0e0', fontSize: '0.9rem',
          }}
        />
        <button type="submit" style={{ padding: '8px 16px', background: '#3a3a5c', border: 'none', borderRadius: 6, color: '#e0e0e0', cursor: 'pointer' }}>
          Search
        </button>
        {search && (
          <button type="button" onClick={() => { setPendingSearch(''); setSearchParams({ page: '1' }); }}
            style={{ padding: '8px 12px', background: '#2a2a3c', border: 'none', borderRadius: 6, color: '#aaa', cursor: 'pointer' }}>
            Clear
          </button>
        )}
      </form>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: '#f44336' }}>Error: {error}</p>}

      <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: 12 }}>
        {total.toLocaleString()} email{total !== 1 ? 's' : ''}{search ? ` matching "${search}"` : ''}
        {totalPages > 1 && ` — Page ${page} of ${totalPages}`}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {emails.map(email => (
          <Link
            key={email.uid}
            to={`/gmail/email/${email.uid}?mailbox=${encodeURIComponent(decodedMailbox)}`}
            style={{
              display: 'grid', gridTemplateColumns: '200px 1fr 140px',
              gap: 12, padding: '10px 16px', background: '#1e1e2e', borderRadius: 6,
              textDecoration: 'none', color: '#e0e0e0', alignItems: 'center',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
              {formatFrom(email.from)}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: email.flags?.includes('\\Seen') ? 400 : 600 }}>
              {email.subject || '(no subject)'}
            </span>
            <span style={{ color: '#888', fontSize: '0.75rem', textAlign: 'right' }}>
              {email.date ? new Date(email.date).toLocaleDateString() : ''}
            </span>
          </Link>
        ))}
        {!loading && emails.length === 0 && <p style={{ color: '#666' }}>No emails found.</p>}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'center' }}>
          {page > 1 && (
            <button onClick={() => setSearchParams({ page: String(page - 1), ...(search ? { q: search } : {}) })}
              style={{ padding: '6px 16px', background: '#2a2a3c', border: 'none', borderRadius: 6, color: '#e0e0e0', cursor: 'pointer' }}>
              ← Prev
            </button>
          )}
          <span style={{ color: '#888', padding: '6px 12px' }}>{page} / {totalPages}</span>
          {page < totalPages && (
            <button onClick={() => setSearchParams({ page: String(page + 1), ...(search ? { q: search } : {}) })}
              style={{ padding: '6px 16px', background: '#2a2a3c', border: 'none', borderRadius: 6, color: '#e0e0e0', cursor: 'pointer' }}>
              Next →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
