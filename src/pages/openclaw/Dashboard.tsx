import React, { useEffect, useState, useCallback } from 'react';
import { getServiceConfig, openclawApi } from '../../api';

interface HealthData {
  status: string;
  uptime: number;
  startedAt: string;
  pollCount: number;
  lastPollAt: string | null;
  lastError: string | null;
}

type PageStatus = 'loading' | 'online' | 'offline' | 'unconfigured';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function formatRelativeTime(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function OpenClawDashboard() {
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState('');
  const [, setTick] = useState(0); // for re-rendering relative times

  const fetchHealth = useCallback(async () => {
    try {
      const config = await getServiceConfig();
      if (!config['openclaw-ingestor']?.configured) {
        setPageStatus('unconfigured');
        return;
      }
      const data = await openclawApi<HealthData>('/api/health');
      setHealth(data);
      setPageStatus('online');
      setError('');
    } catch (e: any) {
      // If we already know it's unconfigured, keep that state
      if (pageStatus !== 'unconfigured') {
        setPageStatus('offline');
        setError(e.message || 'Could not reach OpenClaw Ingestor');
      }
    }
  }, [pageStatus]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Update relative times every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  if (pageStatus === 'loading') {
    return (
      <div className="placeholder-page">
        <div className="placeholder-icon">🐾</div>
        <h1 className="page-title">OpenClaw Ingestor</h1>
        <p style={{ color: '#888' }}>Checking status...</p>
      </div>
    );
  }

  if (pageStatus === 'unconfigured') {
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
      {error && <div className="error-box">{error}</div>}

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-value">
            {pageStatus === 'online' ? (
              <span style={{ color: '#4caf50' }}>🟢 Online</span>
            ) : (
              <span style={{ color: '#f44336' }}>🔴 Offline</span>
            )}
          </div>
          <div className="stat-label">Status</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">
            {health ? formatUptime(health.uptime) : '—'}
          </div>
          <div className="stat-label">⏱️ Uptime</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">
            {health ? health.pollCount.toLocaleString() : '—'}
          </div>
          <div className="stat-label">📊 Poll Count</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ fontSize: 18 }}>
            {health?.lastPollAt ? formatRelativeTime(health.lastPollAt) : '—'}
          </div>
          <div className="stat-label">🕐 Last Poll</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value" style={{ color: health?.lastError ? '#f44336' : undefined }}>
            {health ? (health.lastError || 'None') : '—'}
          </div>
          <div className="stat-label">❌ Last Error</div>
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>About</h3>
        <p style={{ color: '#ccc', lineHeight: 1.7, margin: 0 }}>
          Watches OpenClaw session JSONL files and syncs messages + attachments to the Memory Database.
          The ingestor monitors session directories for new or updated files and incrementally processes
          conversations, extracting messages from both the user and assistant along with any associated
          attachments. Stats refresh automatically every 30 seconds.
        </p>
      </div>

      {pageStatus === 'offline' && (
        <div className="card" style={{ padding: 24, marginTop: 16, borderLeft: '3px solid #f44336' }}>
          <h3 style={{ marginTop: 0, color: '#f44336' }}>Connection Issue</h3>
          <p style={{ color: '#aaa', lineHeight: 1.7, margin: 0 }}>
            The OpenClaw Ingestor service is configured but not responding. Make sure the service is
            running and accessible at the configured URL.
          </p>
        </div>
      )}
    </div>
  );
}
