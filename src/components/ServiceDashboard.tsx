import React, { useEffect, useState } from 'react';
import { apiFetch, getServiceConfig, checkHealth } from '../api';

interface ServiceDashboardProps {
  service: string;
  serviceLabel: string;
  serviceIcon: string;
  serviceKey: string;
  /** The source name in the memory DB (e.g. 'discord', 'email', 'openclaw') */
  sourceName: string;
}

export default function ServiceDashboard({ service, serviceLabel, serviceIcon, serviceKey, sourceName }: ServiceDashboardProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [subscriptionCount, setSubscriptionCount] = useState<number | null>(null);
  const [subscribedCount, setSubscribedCount] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (serviceKey) {
          const config = await getServiceConfig();
          const cfg = config[serviceKey]?.configured;
          setConfigured(!!cfg);

          if (cfg) {
            const ok = await checkHealth(serviceKey);
            setHealthy(ok);
          }
        } else {
          // No backend service (e.g. iMessage) — skip health check
          setConfigured(true);
        }

        // Get message count from memory DB
        const msgData = await apiFetch<any>(`/api/messages?source=${encodeURIComponent(sourceName)}&limit=1`);
        setMessageCount(msgData?.total ?? null);

        // Get subscription count
        try {
          const subData = await apiFetch<any>(`/api/subscriptions/${service}`);
          const subs = subData?.subscriptions || [];
          setSubscriptionCount(subs.length);
          setSubscribedCount(subs.filter((s: any) => s.subscribed).length);
        } catch {
          // Subscriptions may not exist yet
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      }
    })();
  }, [service, serviceKey, sourceName]);

  if (configured === null) return <p style={{ padding: 24, color: '#888' }}>Loading...</p>;

  if (!configured) {
    return (
      <div className="placeholder-page">
        <div className="placeholder-icon">{serviceIcon}</div>
        <h1 className="page-title">{serviceLabel}</h1>
        <div className="placeholder-status unconfigured">⚠️ Not Configured</div>
        <p style={{ color: '#888', maxWidth: 400, textAlign: 'center' }}>
          Set the environment variables for {serviceLabel} in your deployment to enable this service.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">{serviceIcon} {serviceLabel}</h1>
      {error && <div className="error-box">{error}</div>}

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-value">
            {healthy === null ? (
              <span style={{ color: '#888' }}>Checking…</span>
            ) : healthy ? (
              <span style={{ color: '#4caf50' }}>🟢 Online</span>
            ) : (
              <span style={{ color: '#f44336' }}>🔴 Offline</span>
            )}
          </div>
          <div className="stat-label">Service Status</div>
        </div>
        <div className="card stat-card">
          <div className="stat-value">
            {messageCount !== null ? messageCount.toLocaleString() : '—'}
          </div>
          <div className="stat-label">Messages in Memory DB</div>
        </div>
        {subscriptionCount !== null && (
          <div className="card stat-card">
            <div className="stat-value">{subscribedCount ?? 0} / {subscriptionCount}</div>
            <div className="stat-label">Subscriptions Active</div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 24, marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>About</h3>
        <p style={{ color: '#ccc', lineHeight: 1.7, margin: 0 }}>
          The {serviceLabel} ingestor syncs messages and data from {serviceLabel} into the Memory Database.
          Use the sidebar to manage subscriptions, browse messages, trigger backfills, and monitor jobs.
        </p>
      </div>
    </div>
  );
}
