import React, { useState } from 'react';
import { getServiceConfig } from '../api';

interface ServiceDiscoveryProps {
  service: string;
  serviceLabel: string;
  serviceIcon: string;
  serviceKey: string;
}

export default function ServiceDiscovery({ service, serviceLabel, serviceIcon, serviceKey }: ServiceDiscoveryProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'unconfigured'>('idle');
  const [error, setError] = useState('');

  const handleDiscover = async () => {
    setStatus('loading');
    setError('');
    try {
      if (serviceKey) {
        const config = await getServiceConfig();
        if (!config[serviceKey]?.configured) {
          setStatus('unconfigured');
          return;
        }
      }
      // For now, this is a placeholder — each service will need specific discovery endpoints
      // Simulate a short delay for UX
      await new Promise(r => setTimeout(r, 1000));
      setStatus('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Discovery failed');
      setStatus('error');
    }
  };

  return (
    <div>
      <h1 className="page-title">{serviceIcon} {serviceLabel} Discovery</h1>

      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Channel Discovery</h2>
        <p style={{ color: '#888', maxWidth: 500, margin: '0 auto 24px', lineHeight: 1.6 }}>
          Discover available channels, conversations, or mailboxes from the {serviceLabel} service.
          Found items can then be added to your subscriptions for syncing.
        </p>

        {status === 'unconfigured' && (
          <div style={{
            padding: '12px 20px',
            background: '#2a2000',
            border: '1px solid #665500',
            borderRadius: 8,
            color: '#ffcc00',
            marginBottom: 16,
            fontSize: 13,
          }}>
            ⚠️ {serviceLabel} ingestor is not configured. Set the environment variables to enable discovery.
          </div>
        )}

        {error && (
          <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>
        )}

        {status === 'done' && (
          <div style={{
            padding: '12px 20px',
            background: '#1a2a3a',
            border: '1px solid #4a9eff',
            borderRadius: 8,
            color: '#4a9eff',
            marginBottom: 16,
            fontSize: 13,
          }}>
            🚧 Discovery endpoints are being implemented for each service. Check back soon!
          </div>
        )}

        <button
          onClick={handleDiscover}
          disabled={status === 'loading'}
          style={{
            padding: '12px 28px',
            background: status === 'loading' ? '#333' : '#1a2a3a',
            border: '1px solid #4a9eff',
            borderRadius: 8,
            color: '#4a9eff',
            cursor: status === 'loading' ? 'wait' : 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {status === 'loading' ? '⏳ Discovering…' : '🔍 Discover Channels'}
        </button>
      </div>
    </div>
  );
}
