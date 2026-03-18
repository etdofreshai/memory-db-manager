import React, { useEffect, useState, useCallback, useRef } from 'react';
import { openclawApi } from '../../api';

/* ── Types ─────────────────────────────────────────────── */

interface BackfillOptions {
  full?: boolean;
  dryRun?: boolean;
  overwrite?: boolean;
  attachmentsOnly?: boolean;
  includeAttachments?: boolean;
}

interface BackfillStatus {
  running: boolean;
  startedAt: string | null;
  processed: number;
  skipped?: number;
  errors: number;
  completedAt: string | null;
  options?: BackfillOptions;
}

/* ── Helpers ───────────────────────────────────────────── */

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatISO(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function buildButtonLabel(options: BackfillOptions): string {
  const parts: string[] = [];
  if (options.dryRun) parts.push('dry run');
  if (options.overwrite) parts.push('overwrite');
  if (options.attachmentsOnly) parts.push('attachments only');
  if (options.includeAttachments === false) parts.push('no attachments');
  else if (!options.attachmentsOnly) parts.push('with attachments');

  if (parts.length === 0) return '▶ Start Full Backfill';
  return `▶ Start Backfill (${parts.join(', ')})`;
}

function buildOptionsSummary(options: BackfillOptions): string {
  const parts: string[] = [];
  if (options.dryRun) parts.push('🧪 Dry Run');
  if (options.overwrite) parts.push('✏️ Overwrite');
  if (options.attachmentsOnly) parts.push('📎 Attachments Only');
  if (options.includeAttachments === false) parts.push('🚫 No Attachments');
  else parts.push('📎 With Attachments');
  if (options.full !== false) parts.push('🔄 Full Resync');
  return parts.join('  •  ');
}

/* ── Styles ────────────────────────────────────────────── */

const toggleRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 0',
  borderBottom: '1px solid #1e293b',
};

const toggleLabel: React.CSSProperties = {
  flex: 1,
};

const toggleName: React.CSSProperties = {
  fontWeight: 600,
  color: '#e2e8f0',
  fontSize: 14,
};

const toggleDesc: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: 12,
  marginTop: 2,
};

/* ── Component ─────────────────────────────────────────── */

export default function OpenClawBackfill() {
  const [status, setStatus] = useState<BackfillStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Options state
  const [dryRun, setDryRun] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [attachmentsOnly, setAttachmentsOnly] = useState(false);
  const [includeAttachments, setIncludeAttachments] = useState(true);

  const currentOptions: BackfillOptions = {
    full: true,
    dryRun,
    overwrite: attachmentsOnly ? false : overwrite,
    attachmentsOnly,
    includeAttachments: attachmentsOnly ? true : includeAttachments,
  };

  const fetchStatus = useCallback(async () => {
    try {
      const data = await openclawApi<BackfillStatus>('/api/backfill/status');
      setStatus(data);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to fetch backfill status');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh while running
  useEffect(() => {
    if (status?.running) {
      intervalRef.current = setInterval(fetchStatus, 5000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status?.running, fetchStatus]);

  const handleStart = async () => {
    setStarting(true);
    setError('');
    try {
      const res = await openclawApi<{ ok: boolean; message: string }>('/api/backfill', {
        method: 'POST',
        body: JSON.stringify(currentOptions),
      });
      if (!res.ok) {
        setError(res.message || 'Failed to start backfill');
      }
      // Start polling immediately
      setTimeout(fetchStatus, 1000);
    } catch (e: any) {
      setError(e.message || 'Failed to start backfill');
    } finally {
      setStarting(false);
    }
  };

  const isRunning = status?.running ?? false;
  const isComplete = !isRunning && status?.completedAt != null;

  // Compute duration if available
  let durationStr = '—';
  if (status?.startedAt && status.completedAt) {
    const dur = (new Date(status.completedAt).getTime() - new Date(status.startedAt).getTime()) / 1000;
    durationStr = formatDuration(dur);
  } else if (status?.startedAt && isRunning) {
    const dur = (Date.now() - new Date(status.startedAt).getTime()) / 1000;
    durationStr = formatDuration(dur) + ' (running)';
  }

  return (
    <div>
      <h1 className="page-title">⏪ OpenClaw Backfill</h1>
      {error && <div className="error-box">{error}</div>}

      {/* Warning Card */}
      <div
        className="card"
        style={{
          marginBottom: 20,
          borderLeft: '4px solid #f59e0b',
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <div>
            <h3 style={{ margin: '0 0 8px', color: '#f59e0b' }}>Full Backfill</h3>
            <p style={{ margin: 0, color: '#aaa', lineHeight: 1.6, fontSize: 13 }}>
              This re-syncs <strong>all OpenClaw sessions</strong> from scratch, fetching every
              message and ingesting it into the Memory Database. This may take a while depending on
              how many sessions and messages exist. Duplicate messages are skipped automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Backfill Options Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px' }}>⚙️ Backfill Options</h3>

        <div style={toggleRow}>
          <input
            type="checkbox"
            id="opt-dry-run"
            checked={dryRun}
            onChange={e => setDryRun(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#f59e0b', cursor: 'pointer' }}
          />
          <label htmlFor="opt-dry-run" style={toggleLabel}>
            <div style={toggleName}>🧪 Dry Run</div>
            <div style={toggleDesc}>
              Preview what would be ingested without writing anything
            </div>
          </label>
        </div>

        <div style={{ ...toggleRow, opacity: attachmentsOnly ? 0.4 : 1 }}>
          <input
            type="checkbox"
            id="opt-overwrite"
            checked={overwrite}
            onChange={e => setOverwrite(e.target.checked)}
            disabled={attachmentsOnly}
            style={{ width: 18, height: 18, accentColor: '#3b82f6', cursor: attachmentsOnly ? 'not-allowed' : 'pointer' }}
          />
          <label htmlFor="opt-overwrite" style={toggleLabel}>
            <div style={toggleName}>✏️ Overwrite Existing</div>
            <div style={toggleDesc}>
              Update records that already exist (PUT on 409 duplicate)
              {attachmentsOnly && <span style={{ color: '#f59e0b', marginLeft: 8 }}>— disabled in attachments-only mode</span>}
            </div>
          </label>
        </div>

        <div style={toggleRow}>
          <input
            type="checkbox"
            id="opt-attachments-only"
            checked={attachmentsOnly}
            onChange={e => {
              setAttachmentsOnly(e.target.checked);
              if (e.target.checked) {
                setOverwrite(false);
                setIncludeAttachments(true);
              }
            }}
            style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: 'pointer' }}
          />
          <label htmlFor="opt-attachments-only" style={toggleLabel}>
            <div style={toggleName}>📎 Attachments Only</div>
            <div style={toggleDesc}>
              Only process attachments, skip message text upsert (useful for adding attachments to already-ingested messages)
            </div>
          </label>
        </div>

        <div style={{ ...toggleRow, borderBottom: 'none', opacity: attachmentsOnly ? 0.4 : 1 }}>
          <input
            type="checkbox"
            id="opt-include-attachments"
            checked={attachmentsOnly ? true : includeAttachments}
            onChange={e => setIncludeAttachments(e.target.checked)}
            disabled={attachmentsOnly}
            style={{ width: 18, height: 18, accentColor: '#10b981', cursor: attachmentsOnly ? 'not-allowed' : 'pointer' }}
          />
          <label htmlFor="opt-include-attachments" style={toggleLabel}>
            <div style={toggleName}>📁 Include Attachments</div>
            <div style={toggleDesc}>
              Process and upload attachment blobs (disable for faster text-only ingestion)
              {attachmentsOnly && <span style={{ color: '#8b5cf6', marginLeft: 8 }}>— always on in attachments-only mode</span>}
            </div>
          </label>
        </div>

        {/* Dry run notice */}
        {dryRun && (
          <div
            style={{
              marginTop: 12,
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

      {/* Controls Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px' }}>Controls</h3>
        <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: 12 }}>
          {buildOptionsSummary(currentOptions)}
        </p>
        <button
          onClick={handleStart}
          disabled={starting || isRunning}
          style={{
            padding: '10px 20px',
            borderRadius: 6,
            border: 'none',
            fontWeight: 600,
            cursor: starting || isRunning ? 'not-allowed' : 'pointer',
            background: starting || isRunning ? '#333' : dryRun ? '#92400e' : '#3b82f6',
            color: '#fff',
            fontSize: 14,
          }}
        >
          {starting
            ? '⏳ Starting...'
            : isRunning
              ? '⟳ Backfill Running...'
              : buildButtonLabel(currentOptions)}
        </button>
        <button
          onClick={() => { setLoading(true); fetchStatus(); }}
          style={{
            marginLeft: 12,
            padding: '10px 16px',
            borderRadius: 6,
            border: '1px solid #555',
            fontWeight: 600,
            cursor: 'pointer',
            background: 'transparent',
            color: '#aaa',
            fontSize: 14,
          }}
        >
          ⟳ Refresh
        </button>
      </div>

      {/* Status */}
      {loading ? (
        <p style={{ color: '#888' }}>Loading status...</p>
      ) : status ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px' }}>
            {isRunning ? (
              <span>
                🔄 Running
                {status.options?.dryRun && <span style={{ color: '#f59e0b', marginLeft: 8, fontSize: 13 }}>(dry run)</span>}
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#3b82f6',
                    marginLeft: 8,
                    animation: 'pulse 1.5s infinite',
                  }}
                />
              </span>
            ) : isComplete ? (
              <span style={{ color: '#4caf50' }}>
                ✅ Complete
                {status.options?.dryRun && <span style={{ color: '#f59e0b', marginLeft: 8, fontSize: 13 }}>(dry run)</span>}
              </span>
            ) : (
              <span style={{ color: '#888' }}>⏸ Idle</span>
            )}
          </h3>

          {/* Options used (shown when running or complete) */}
          {(isRunning || isComplete) && status.options && Object.keys(status.options).length > 0 && (
            <div style={{
              marginBottom: 16,
              padding: '8px 12px',
              borderRadius: 6,
              background: '#0f172a',
              border: '1px solid #1e293b',
              color: '#94a3b8',
              fontSize: 12,
            }}>
              <strong style={{ color: '#e2e8f0' }}>Options used: </strong>
              {buildOptionsSummary(status.options)}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
            }}
          >
            <div
              style={{
                background: '#0d1f3c',
                padding: 14,
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: '#888',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Processed
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#eee' }}>
                {status.processed.toLocaleString()}
              </div>
            </div>
            {(status.skipped != null && status.skipped > 0) && (
              <div
                style={{
                  background: '#0d1f3c',
                  padding: 14,
                  borderRadius: 6,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: '#888',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Skipped
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>
                  {status.skipped.toLocaleString()}
                </div>
              </div>
            )}
            <div
              style={{
                background: '#0d1f3c',
                padding: 14,
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: '#888',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Errors
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: status.errors > 0 ? '#f44336' : '#eee',
                }}
              >
                {status.errors}
              </div>
            </div>
            <div
              style={{
                background: '#0d1f3c',
                padding: 14,
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: '#888',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Duration
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#eee' }}>
                {durationStr}
              </div>
            </div>
            <div
              style={{
                background: '#0d1f3c',
                padding: 14,
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: '#888',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Started At
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#ccc' }}>
                {formatISO(status.startedAt)}
              </div>
            </div>
            {status.completedAt && (
              <div
                style={{
                  background: '#0d1f3c',
                  padding: 14,
                  borderRadius: 6,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: '#888',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Completed At
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#ccc' }}>
                  {formatISO(status.completedAt)}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Pulse animation for the running indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
