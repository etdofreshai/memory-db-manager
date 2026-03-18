import React from 'react';
import { ConflictMode } from '../hooks/useConflictMode';

interface Props {
  value: ConflictMode;
  onChange: (mode: ConflictMode) => void;
  disabled?: boolean;
  compact?: boolean;
}

const modes: { value: ConflictMode; label: string; icon: string; desc: string }[] = [
  {
    value: 'skip_or_append',
    label: 'Skip / Append',
    icon: '➕',
    desc: 'Default — skip identical messages; if content changed, append new version (SCD Type 2 history).',
  },
  {
    value: 'skip_or_overwrite',
    label: 'Skip / Overwrite',
    icon: '✏️',
    desc: 'Skip identical messages; if content changed, update the existing row in-place (no history).',
  },
];

export default function ConflictModeSelector({ value, onChange, disabled, compact }: Props) {
  return (
    <div style={{ marginBottom: compact ? 0 : 16 }}>
      {!compact && (
        <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13, marginBottom: 8 }}>
          🔀 Ingest Conflict Mode
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {modes.map(m => {
          const active = value === m.value;
          return (
            <label
              key={m.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: 13,
                color: disabled ? '#555' : active ? '#e2e8f0' : '#94a3b8',
                opacity: disabled ? 0.5 : 1,
                padding: '6px 12px',
                borderRadius: 6,
                background: active && !disabled ? '#1e3a5f' : '#0f172a',
                border: `1px solid ${active && !disabled ? '#3b82f6' : '#1e293b'}`,
                transition: 'all 0.15s',
              }}
            >
              <input
                type="radio"
                name="conflict_mode"
                checked={active}
                onChange={() => onChange(m.value)}
                disabled={disabled}
                style={{ accentColor: '#3b82f6' }}
              />
              <span>{m.icon} {m.label}</span>
            </label>
          );
        })}
      </div>
      {!compact && (
        <div style={{ color: '#64748b', fontSize: 11, marginTop: 6, marginLeft: 2 }}>
          {modes.find(m => m.value === value)?.desc}
        </div>
      )}
    </div>
  );
}
