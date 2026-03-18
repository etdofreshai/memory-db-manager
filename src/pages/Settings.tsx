import React from 'react';
import ConflictModeSelector from '../components/ConflictModeSelector';
import { useConflictMode } from '../hooks/useConflictMode';

export default function Settings() {
  const [conflictMode, setConflictMode] = useConflictMode();

  return (
    <div>
      <h1 className="page-title">⚙️ Settings</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px' }}>Ingest Configuration</h3>

        <ConflictModeSelector
          value={conflictMode}
          onChange={setConflictMode}
        />

        <div style={{ marginTop: 16, padding: '12px 16px', background: '#0f172a', borderRadius: 6, border: '1px solid #1e293b' }}>
          <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13, marginBottom: 8 }}>
            ℹ️ How Conflict Modes Work
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px' }}>
              When ingesting messages, the system first checks if a message with the same identity already exists.
              Identity is determined by <code style={{ color: '#93c5fd' }}>source_id + external_id</code> or
              <code style={{ color: '#93c5fd' }}>source_id + sender + recipient + timestamp</code>.
            </p>
            <p style={{ margin: '0 0 8px' }}>
              <strong>If content is identical</strong> → the message is always <strong>skipped</strong> (no duplicate created).
            </p>
            <p style={{ margin: '0 0 8px' }}>
              <strong>If content has changed:</strong>
            </p>
            <ul style={{ margin: '0 0 8px', paddingLeft: 20 }}>
              <li><strong>Skip / Append</strong> (default): Creates a new version row and closes the old one. Full edit history is preserved (SCD Type 2).</li>
              <li><strong>Skip / Overwrite</strong>: Updates the existing row in-place. No history is kept — only the latest version.</li>
            </ul>
            <p style={{ margin: 0, color: '#64748b' }}>
              This setting is saved in your browser and applies to all ingestor backfill pages.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
