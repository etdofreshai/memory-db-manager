import React, { useEffect, useState } from 'react';

interface LoginStatus {
  status: 'idle' | 'logging_in' | 'logged_in' | 'error';
  message?: string;
  hasSavedSession?: boolean;
  username?: string;
}

export default function DiscordLoginStatus() {
  const [status, setStatus] = useState<LoginStatus | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/proxy/discord-ingestor/discord-login/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
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

  const handleStop = async () => {
    try {
      await fetch('/proxy/discord-ingestor/discord-login/stop', { method: 'POST' });
      setTimeout(fetchStatus, 500);
    } catch {}
  };

  const dot = () => {
    if (!status) return '⚫';
    if (status.status === 'logged_in' || status.hasSavedSession) return '🟢';
    if (status.status === 'logging_in') return '🟡';
    return '🔴';
  };

  const label = () => {
    if (!status) return 'Unknown';
    if (status.status === 'logged_in') return status.username || 'Logged in';
    if (status.hasSavedSession) return 'Session saved';
    if (status.status === 'logging_in') return 'Signing in…';
    return 'Not logged in';
  };

  return (
    <div style={{ padding: '4px 12px 6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' }}>
      <span title={status?.message}>{dot()} {label()}</span>
      <button
        onClick={() => window.open('/proxy/discord-ingestor/discord-login', '_blank')}
        title="Open Discord login"
        style={{ fontSize: 11, padding: '1px 5px', cursor: 'pointer', borderRadius: 3, border: '1px solid #555', background: 'transparent', color: '#aaa' }}
      >
        Sign In ↗
      </button>
      {status?.status === 'logging_in' && (
        <button
          onClick={handleStop}
          title="Stop login attempt"
          style={{ fontSize: 11, padding: '1px 5px', cursor: 'pointer', borderRadius: 3, border: '1px solid #555', background: 'transparent', color: '#f88' }}
        >
          Stop
        </button>
      )}
    </div>
  );
}
