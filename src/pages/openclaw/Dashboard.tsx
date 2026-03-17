import React, { useEffect, useState } from 'react';
import { getServiceConfig, checkHealth } from '../../api';

type Status = 'loading' | 'connected' | 'disconnected' | 'unconfigured';

export default function OpenClawDashboard() {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    (async () => {
      try {
        const config = await getServiceConfig();
        if (!config['openclaw-ingestor']?.configured) {
          setStatus('unconfigured');
          return;
        }
        const ok = await checkHealth('openclaw-ingestor');
        setStatus(ok ? 'connected' : 'disconnected');
      } catch {
        setStatus('disconnected');
      }
    })();
  }, []);

  if (status === 'loading') {
    return (
      <div className="placeholder-page">
        <div className="placeholder-icon">🐾</div>
        <h1 className="page-title">OpenClaw Ingestor</h1>
        <p style={{ color: '#888' }}>Checking status...</p>
      </div>
    );
  }

  if (status === 'unconfigured') {
    return (
      <div className="placeholder-page">
        <div className="placeholder-icon">🐾</div>
        <h1 className="page-title">OpenClaw Ingestor</h1>
        <div className="placeholder-status unconfigured">⚠️ Not Configured</div>
        <p style={{ color: '#888', maxWidth: 480, textAlign: 'center', lineHeight: 1.6 }}>
          Set <code>OPENCLAW_INGESTOR_URL</code> and <code>OPENCLAW_INGESTOR_TOKEN</code> in your
          environment variables to connect the OpenClaw Ingestor service.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">🐾 OpenClaw Ingestor</h1>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Service Status</div>
          <div className="stat-value">
            {status === 'connected' ? (
              <span style={{ color: '#4caf50' }}>● Connected</span>
            ) : (
              <span style={{ color: '#f44336' }}>● Unreachable</span>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Type</div>
          <div className="stat-value" style={{ fontSize: 18 }}>File Watcher</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Source</div>
          <div className="stat-value" style={{ fontSize: 18 }}>JSONL Sessions</div>
        </div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ marginTop: 0 }}>About</h3>
        <p style={{ color: '#ccc', lineHeight: 1.7, margin: 0 }}>
          Watches OpenClaw session JSONL files and syncs messages + attachments to the Memory Database.
          The ingestor monitors session directories for new or updated files and incrementally processes
          conversations, extracting messages from both the user and assistant along with any associated
          attachments.
        </p>
      </div>

      {status === 'disconnected' && (
        <div className="card" style={{ padding: 24, marginTop: 16, borderLeft: '3px solid #f44336' }}>
          <h3 style={{ marginTop: 0, color: '#f44336' }}>Connection Issue</h3>
          <p style={{ color: '#aaa', lineHeight: 1.7, margin: 0 }}>
            The OpenClaw Ingestor service is configured but not responding. Make sure the service is
            running and accessible at the configured URL. The ingestor may not have an HTTP API exposed
            yet — it primarily operates as a background file watcher.
          </p>
        </div>
      )}
    </div>
  );
}
