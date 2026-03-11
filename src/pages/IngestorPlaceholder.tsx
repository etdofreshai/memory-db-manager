import React, { useEffect, useState } from 'react';
import { getServiceConfig, checkHealth } from '../api';

interface Props {
  name: string;
  icon: string;
  serviceKey: string;
}

export default function IngestorPlaceholder({ name, icon, serviceKey }: Props) {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected' | 'unconfigured'>('loading');

  useEffect(() => {
    (async () => {
      const config = await getServiceConfig();
      if (!config[serviceKey]?.configured) {
        setStatus('unconfigured');
        return;
      }
      const ok = await checkHealth(serviceKey);
      setStatus(ok ? 'connected' : 'disconnected');
    })();
  }, [serviceKey]);

  return (
    <div className="placeholder-page">
      <div className="placeholder-icon">{icon}</div>
      <h1 className="page-title">{name}</h1>
      {status === 'loading' && <p style={{ color: '#888' }}>Checking status...</p>}
      {status === 'unconfigured' && (
        <>
          <div className="placeholder-status unconfigured">⚠️ Not Configured</div>
          <p style={{ color: '#888', maxWidth: 400 }}>
            Set the environment variables for this service in your <code>.env</code> file to enable it.
          </p>
        </>
      )}
      {status === 'connected' && (
        <div className="placeholder-status connected">● Connected</div>
      )}
      {status === 'disconnected' && (
        <div className="placeholder-status disconnected">● Unreachable</div>
      )}
      <p style={{ color: '#666', marginTop: 24 }}>More features coming soon.</p>
    </div>
  );
}
