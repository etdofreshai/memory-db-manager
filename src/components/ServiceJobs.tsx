import React, { useEffect, useState } from 'react';
import { getServiceConfig, checkHealth } from '../api';

interface ServiceJobsProps {
  service: string;
  serviceLabel: string;
  serviceIcon: string;
  serviceKey: string;
}

export default function ServiceJobs({ service, serviceLabel, serviceIcon, serviceKey }: ServiceJobsProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      if (!serviceKey) {
        setConfigured(true);
        return;
      }
      const config = await getServiceConfig();
      const cfg = config[serviceKey]?.configured;
      setConfigured(!!cfg);
      if (cfg) {
        const ok = await checkHealth(serviceKey);
        setHealthy(ok);
      }
    })();
  }, [serviceKey]);

  if (configured === null) return <p style={{ padding: 24, color: '#888' }}>Loading...</p>;

  if (!configured) {
    return (
      <div className="placeholder-page">
        <div className="placeholder-icon">{serviceIcon}</div>
        <h1 className="page-title">{serviceLabel} Jobs</h1>
        <div className="placeholder-status unconfigured">⚠️ Not Configured</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">{serviceIcon} {serviceLabel} Jobs</h1>

      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Jobs & Sync Status</h2>
        <p style={{ color: '#888', maxWidth: 500, margin: '0 auto 16px', lineHeight: 1.6 }}>
          View currently running or queued sync jobs for {serviceLabel}.
          {healthy === false && ' The service appears to be offline.'}
        </p>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          background: '#1f2937',
          borderRadius: 8,
          color: '#9ca3af',
          fontSize: 13,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: healthy ? '#22c55e' : healthy === false ? '#ef4444' : '#6b7280',
          }} />
          Service {healthy ? 'online' : healthy === false ? 'offline' : 'checking…'}
        </div>

        <p style={{ color: '#555', marginTop: 24, fontSize: 13 }}>
          No active jobs to display. Jobs will appear here when syncs are running.
        </p>
      </div>
    </div>
  );
}
