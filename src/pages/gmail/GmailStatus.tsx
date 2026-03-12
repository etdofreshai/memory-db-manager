import React, { useEffect, useState } from 'react';
import { checkHealth } from '../../api';

export default function GmailStatus() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    checkHealth('gmail-ingestor').then(setOk);
  }, []);

  if (ok === null) return <span style={{ fontSize: '0.75rem', color: '#888' }}>●</span>;
  return (
    <span
      title={ok ? 'Gmail IMAP connected' : 'Gmail IMAP offline'}
      style={{ fontSize: '0.75rem', color: ok ? '#4caf50' : '#f44336', marginLeft: 4 }}
    >
      ●
    </span>
  );
}
