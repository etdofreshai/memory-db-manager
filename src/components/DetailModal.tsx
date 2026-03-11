import React from 'react';

interface Props {
  title: string;
  data?: any;
  onClose: () => void;
  children?: React.ReactNode;
}

export default function DetailModal({ title, data, onClose, children }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>
        {children}
        {data && (
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', color: '#64b5f6' }}>Raw JSON</summary>
            <pre style={{ background: '#1a1f2e', padding: 12, borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflowY: 'auto' }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
