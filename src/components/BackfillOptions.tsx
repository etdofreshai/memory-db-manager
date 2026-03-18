import React from 'react';

export interface BackfillConfig {
  existingMessages: 'overwrite' | 'append' | 'skip';
  dryRun: boolean;
  downloadAttachments: boolean;
  existingAttachments: 'overwrite' | 'append' | 'skip';
}

export const defaultBackfillConfig: BackfillConfig = {
  existingMessages: 'skip',
  dryRun: false,
  downloadAttachments: true,
  existingAttachments: 'skip',
};

interface Props {
  value: BackfillConfig;
  onChange: (cfg: BackfillConfig) => void;
  disabled?: boolean;
}

/* ── Styles ────────────────────────────────────────────── */

const sectionStyle: React.CSSProperties = {
  padding: '12px 0',
  borderBottom: '1px solid #1e293b',
};

const sectionLabelStyle: React.CSSProperties = {
  fontWeight: 600,
  color: '#e2e8f0',
  fontSize: 13,
  marginBottom: 8,
};

const radioGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
};

const radioLabelStyle = (active: boolean, disabled?: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 13,
  color: disabled ? '#555' : active ? '#e2e8f0' : '#94a3b8',
  opacity: disabled ? 0.5 : 1,
  padding: '4px 10px',
  borderRadius: 4,
  background: active && !disabled ? '#1e3a5f' : 'transparent',
  border: `1px solid ${active && !disabled ? '#3b82f6' : 'transparent'}`,
  transition: 'all 0.15s',
});

const checkboxLabelStyle = (disabled?: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 13,
  color: disabled ? '#555' : '#e2e8f0',
  opacity: disabled ? 0.5 : 1,
});

const descStyle = (disabled?: boolean): React.CSSProperties => ({
  color: disabled ? '#444' : '#64748b',
  fontSize: 11,
  marginTop: 4,
  marginLeft: 26,
});

const summaryStyle: React.CSSProperties = {
  marginTop: 12,
  padding: '8px 12px',
  borderRadius: 6,
  background: '#0f172a',
  border: '1px solid #1e293b',
  color: '#94a3b8',
  fontSize: 12,
};

/* ── Component ─────────────────────────────────────────── */

export default function BackfillOptions({ value, onChange, disabled }: Props) {
  const set = <K extends keyof BackfillConfig>(key: K, val: BackfillConfig[K]) => {
    onChange({ ...value, [key]: val });
  };

  // Build summary of non-default options
  const summaryParts: string[] = [];
  if (value.existingMessages === 'overwrite') summaryParts.push('✏️ Overwrite existing messages');
  if (value.existingMessages === 'append') summaryParts.push('➕ Append messages (skip dup check)');
  if (value.dryRun) summaryParts.push('🧪 Dry run');
  if (!value.downloadAttachments) summaryParts.push('🚫 Skip attachments');
  if (value.downloadAttachments && value.existingAttachments === 'overwrite') summaryParts.push('✏️ Overwrite existing attachments');
  if (value.downloadAttachments && value.existingAttachments === 'append') summaryParts.push('➕ Append attachments (skip dup check)');

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 4px' }}>⚙️ Backfill Options</h3>

      {/* 1. Existing Messages */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Existing Messages</div>
        <div style={radioGroupStyle}>
          {([
            ['skip', 'Skip', 'Default — skip on duplicate (409)'],
            ['overwrite', 'Overwrite', 'Update existing record with latest data'],
            ['append', 'Append', 'Create new record even if one exists'],
          ] as const).map(([val, label, _desc]) => (
            <label key={val} style={radioLabelStyle(value.existingMessages === val, disabled)}>
              <input
                type="radio"
                name="existingMessages"
                checked={value.existingMessages === val}
                onChange={() => set('existingMessages', val)}
                disabled={disabled}
                style={{ accentColor: '#3b82f6' }}
              />
              {label}
            </label>
          ))}
        </div>
        <div style={descStyle(disabled)}>
          {value.existingMessages === 'skip' && 'Default behavior — duplicates are skipped (409 response).'}
          {value.existingMessages === 'overwrite' && 'Existing message records will be updated with the latest data (PUT/PATCH).'}
          {value.existingMessages === 'append' && 'New records created even if a message already exists (duplicate check bypassed).'}
        </div>
      </div>

      {/* 2. Dry Run */}
      <div style={sectionStyle}>
        <label style={checkboxLabelStyle(disabled)}>
          <input
            type="checkbox"
            checked={value.dryRun}
            onChange={e => set('dryRun', e.target.checked)}
            disabled={disabled}
            style={{ width: 18, height: 18, accentColor: '#f59e0b', cursor: disabled ? 'not-allowed' : 'pointer' }}
          />
          <span style={{ fontWeight: 600 }}>🧪 Dry Run</span>
        </label>
        <div style={descStyle(disabled)}>
          Preview what would happen without writing any data.
        </div>
      </div>

      {/* 3. Download Attachments */}
      <div style={sectionStyle}>
        <label style={checkboxLabelStyle(disabled)}>
          <input
            type="checkbox"
            checked={value.downloadAttachments}
            onChange={e => {
              const next = { ...value, downloadAttachments: e.target.checked };
              if (!e.target.checked) next.existingAttachments = 'skip';
              onChange(next);
            }}
            disabled={disabled}
            style={{ width: 18, height: 18, accentColor: '#10b981', cursor: disabled ? 'not-allowed' : 'pointer' }}
          />
          <span style={{ fontWeight: 600 }}>📁 Download Attachments</span>
        </label>
        <div style={descStyle(disabled)}>
          {value.downloadAttachments
            ? 'Attachments will be downloaded and uploaded during backfill.'
            : 'Attachment downloading/uploading is skipped entirely.'}
        </div>
      </div>

      {/* 4. Existing Attachments */}
      <div style={{ ...sectionStyle, borderBottom: 'none', opacity: value.downloadAttachments ? 1 : 0.4 }}>
        <div style={sectionLabelStyle}>Existing Attachments</div>
        <div style={radioGroupStyle}>
          {([
            ['skip', 'Skip', 'Default — skip on duplicate (409)'],
            ['overwrite', 'Overwrite', 'Update existing attachment record'],
            ['append', 'Append', 'Create new record even if one exists'],
          ] as const).map(([val, label, _desc]) => (
            <label key={val} style={radioLabelStyle(value.existingAttachments === val, disabled || !value.downloadAttachments)}>
              <input
                type="radio"
                name="existingAttachments"
                checked={value.existingAttachments === val}
                onChange={() => set('existingAttachments', val)}
                disabled={disabled || !value.downloadAttachments}
                style={{ accentColor: '#3b82f6' }}
              />
              {label}
            </label>
          ))}
        </div>
        <div style={descStyle(disabled || !value.downloadAttachments)}>
          {!value.downloadAttachments
            ? 'Enable "Download Attachments" to configure this option.'
            : value.existingAttachments === 'skip'
              ? 'Default behavior — duplicate attachments are skipped (409 response).'
              : value.existingAttachments === 'overwrite'
                ? 'Existing attachment records will be updated.'
                : 'New attachment records created even if one already exists.'}
        </div>
      </div>

      {/* Summary of active non-default options */}
      {summaryParts.length > 0 && (
        <div style={summaryStyle}>
          <strong style={{ color: '#e2e8f0' }}>Active options: </strong>
          {summaryParts.join('  •  ')}
        </div>
      )}

      {/* Dry run notice */}
      {value.dryRun && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            borderRadius: 6,
            background: '#422006',
            border: '1px solid #f59e0b33',
            color: '#fbbf24',
            fontSize: 12,
          }}
        >
          🧪 <strong>Dry run mode:</strong> No data will be written. All operations will be logged and counted only.
        </div>
      )}
    </div>
  );
}
