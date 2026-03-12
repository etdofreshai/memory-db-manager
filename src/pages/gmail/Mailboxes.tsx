import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gmailApi } from '../../api';

interface Mailbox {
  path: string;
  name: string;
  flags: string[];
}

export default function Mailboxes() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    gmailApi<Mailbox[]>('/api/mailboxes')
      .then(setMailboxes)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = mailboxes.filter(mb =>
    mb.path.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <h1 className="page-title">📬 Mailboxes</h1>
      <input
        type="text"
        placeholder="Search mailboxes…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '8px 12px', marginBottom: 16,
          background: '#1e1e2e', border: '1px solid #333', borderRadius: 6,
          color: '#e0e0e0', fontSize: '0.9rem', boxSizing: 'border-box',
        }}
      />
      {loading && <p>Loading…</p>}
      {error && <p style={{ color: '#f44336' }}>Error: {error}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.map(mb => (
          <Link
            key={mb.path}
            to={`/gmail/mailbox/${encodeURIComponent(mb.path)}`}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', background: '#1e1e2e', borderRadius: 6,
              textDecoration: 'none', color: '#e0e0e0',
            }}
          >
            <span>📁 {mb.path}</span>
            <span style={{ color: '#888', fontSize: '0.8rem' }}>{mb.flags.join(', ')}</span>
          </Link>
        ))}
        {!loading && filtered.length === 0 && <p style={{ color: '#666' }}>No mailboxes found.</p>}
      </div>
    </div>
  );
}
