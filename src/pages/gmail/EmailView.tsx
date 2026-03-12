import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { gmailApi } from '../../api';

interface EmailDetail {
  uid: number;
  flags: string[];
  date: string;
  subject: string;
  from: Array<{ name?: string; address?: string }>;
  to: Array<{ name?: string; address?: string }>;
  cc?: Array<{ name?: string; address?: string }>;
  textBody?: string;
  htmlBody?: string;
  attachments: Array<{ filename?: string; size: number; contentType: string }>;
}

function formatAddrs(addrs?: Array<{ name?: string; address?: string }>): string {
  if (!addrs || addrs.length === 0) return '';
  return addrs.map(a => a.name ? `${a.name} <${a.address}>` : (a.address || '')).join(', ');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function EmailView() {
  const { uid } = useParams<{ uid: string }>();
  const [searchParams] = useSearchParams();
  const mailbox = searchParams.get('mailbox') || 'INBOX';

  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHtml, setShowHtml] = useState(true);

  useEffect(() => {
    if (!uid) return;
    gmailApi<EmailDetail>(`/api/emails/${uid}?mailbox=${encodeURIComponent(mailbox)}`)
      .then(setEmail)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [uid, mailbox]);

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 16 }}>
        <Link to={`/gmail/mailbox/${encodeURIComponent(mailbox)}`} style={{ color: '#888', textDecoration: 'none' }}>
          ← Back to {mailbox}
        </Link>
      </div>

      {loading && <p>Loading email…</p>}
      {error && <p style={{ color: '#f44336' }}>Error: {error}</p>}

      {email && (
        <>
          <h1 style={{ fontSize: '1.25rem', marginBottom: 16, lineHeight: 1.4 }}>
            {email.subject || '(no subject)'}
          </h1>

          <div style={{ background: '#1e1e2e', borderRadius: 8, padding: 16, marginBottom: 20, fontSize: '0.85rem', lineHeight: 1.8 }}>
            <div><span style={{ color: '#888', width: 60, display: 'inline-block' }}>From:</span> {formatAddrs(email.from)}</div>
            <div><span style={{ color: '#888', width: 60, display: 'inline-block' }}>To:</span> {formatAddrs(email.to)}</div>
            {email.cc && email.cc.length > 0 && (
              <div><span style={{ color: '#888', width: 60, display: 'inline-block' }}>CC:</span> {formatAddrs(email.cc)}</div>
            )}
            <div><span style={{ color: '#888', width: 60, display: 'inline-block' }}>Date:</span> {email.date ? new Date(email.date).toLocaleString() : ''}</div>
            {email.attachments.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <span style={{ color: '#888' }}>Attachments: </span>
                {email.attachments.map((att, i) => (
                  <span key={i} style={{ marginRight: 12, background: '#2a2a3c', padding: '2px 8px', borderRadius: 4 }}>
                    📎 {att.filename || 'attachment'} ({formatSize(att.size)})
                  </span>
                ))}
              </div>
            )}
          </div>

          {email.htmlBody && email.textBody && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setShowHtml(true)} style={{ padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', background: showHtml ? '#4a4a7c' : '#2a2a3c', color: '#e0e0e0' }}>HTML</button>
              <button onClick={() => setShowHtml(false)} style={{ padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', background: !showHtml ? '#4a4a7c' : '#2a2a3c', color: '#e0e0e0' }}>Plain Text</button>
            </div>
          )}

          <div style={{ background: '#1e1e2e', borderRadius: 8, overflow: 'hidden' }}>
            {(email.htmlBody && showHtml) ? (
              <iframe
                srcDoc={email.htmlBody}
                sandbox="allow-same-origin"
                style={{ width: '100%', minHeight: 500, border: 'none', background: '#fff' }}
                title="Email body"
              />
            ) : (
              <pre style={{
                padding: 16, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontSize: '0.85rem', lineHeight: 1.6, color: '#d0d0d0', fontFamily: 'inherit',
              }}>
                {email.textBody || '(no body)'}
              </pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}
