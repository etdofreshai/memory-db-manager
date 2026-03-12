import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gmailApi, apiFetch, getServiceConfig } from '../../api';

interface Mailbox {
  path: string;
  name: string;
  flags: string[];
}

export default function GmailDashboard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [totalEmails, setTotalEmails] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const config = await getServiceConfig();
      const cfg = config['gmail-ingestor']?.configured;
      setConfigured(cfg);
      if (!cfg) return;

      const [healthRes, mboxRes, emailCountRes] = await Promise.allSettled([
        fetch('/proxy/gmail-ingestor/api/health').then(r => r.json()),
        gmailApi<Mailbox[]>('/api/mailboxes'),
        apiFetch<any>('/api/messages?source=email&limit=1'),
      ]);

      if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
      if (mboxRes.status === 'fulfilled') setMailboxes(mboxRes.value);
      if (emailCountRes.status === 'fulfilled') setTotalEmails(emailCountRes.value?.total ?? null);
      if (mboxRes.status === 'rejected') setError((mboxRes.reason as Error).message);
    })();
  }, []);

  if (configured === null) return <p>Loading...</p>;
  if (!configured) return (
    <div className="placeholder-page">
      <div className="placeholder-icon">📧</div>
      <h1 className="page-title">Gmail Ingestor</h1>
      <div className="placeholder-status unconfigured">⚠️ Not Configured — set GMAIL_INGESTOR_URL and GMAIL_INGESTOR_TOKEN</div>
    </div>
  );

  const isHealthy = health?.status === 'ok';

  return (
    <div className="page">
      <h1 className="page-title">📧 Gmail Dashboard</h1>

      <div className="stats-grid" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div className="stat-card" style={{ background: '#1e1e2e', borderRadius: 8, padding: '16px 24px', minWidth: 160 }}>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 4 }}>IMAP Status</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: isHealthy ? '#4caf50' : '#f44336' }}>
            {isHealthy ? '● Connected' : '● Offline'}
          </div>
        </div>
        <div className="stat-card" style={{ background: '#1e1e2e', borderRadius: 8, padding: '16px 24px', minWidth: 160 }}>
          <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 4 }}>Mailboxes</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{mailboxes.length}</div>
        </div>
        {totalEmails !== null && (
          <div className="stat-card" style={{ background: '#1e1e2e', borderRadius: 8, padding: '16px 24px', minWidth: 160 }}>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: 4 }}>Emails in Memory DB</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{totalEmails.toLocaleString()}</div>
          </div>
        )}
      </div>

      {error && <div style={{ color: '#f44336', marginBottom: 16 }}>Error: {error}</div>}

      <h2 style={{ fontSize: '1rem', marginBottom: 12, color: '#aaa' }}>Mailboxes</h2>
      {mailboxes.length === 0 && !error && <p style={{ color: '#666' }}>Loading mailboxes…</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {mailboxes.map(mb => (
          <Link
            key={mb.path}
            to={`/gmail/mailbox/${encodeURIComponent(mb.path)}`}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 16px', background: '#1e1e2e', borderRadius: 6,
              textDecoration: 'none', color: '#e0e0e0',
            }}
          >
            <span>📁 {mb.path}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
