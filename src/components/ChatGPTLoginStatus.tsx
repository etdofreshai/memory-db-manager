import React, { useEffect, useState } from 'react';

interface SessionStatus {
  authenticated: boolean;
  user?: string;
  email?: string;
  error?: string;
}

export default function ChatGPTLoginStatus() {
  const [status, setStatus] = useState<SessionStatus | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/proxy/chatgpt-ingestor/api/session/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const dot = () => {
    if (!status) return '⚫';
    if (status.authenticated) return '🟢';
    return '🔴';
  };

  const label = () => {
    if (!status) return 'Unknown';
    if (status.authenticated) return status.email || status.user || 'Authenticated';
    return 'Not logged in';
  };

  return (
    <div style={{ padding: '4px 12px 6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' }}>
      <span title={status?.error}>{dot()} {label()}</span>
      <button
        onClick={() => window.open('/proxy/chatgpt-ingestor/login', '_blank')}
        title="Open ChatGPT login"
        style={{ fontSize: 11, padding: '1px 5px', cursor: 'pointer', borderRadius: 3, border: '1px solid #555', background: 'transparent', color: '#aaa' }}
      >
        Sign In ↗
      </button>
    </div>
  );
}
