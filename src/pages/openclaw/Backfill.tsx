import React, { useEffect, useState, useCallback, useRef } from 'react';
import { openclawApi } from '../../api';

/* ── Types ─────────────────────────────────────────────── */

interface BackfillStatus {
  running: boolean;
  startedAt: string | null;
  processed: number;
  errors: number;
  completedAt: string | null;
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

/* ── Component ─────────────────────────────────────────── */

export default function OpenClawBackfill() {
  const [status, setStatus] = useState<BackfillStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

      {/* Start Button */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px' }}>Controls</h3>
        <button
          onClick={handleStart}
          disabled={starting || isRunning}
          style={{
            padding: '10px 20px',
            borderRadius: 6,
            border: 'none',
            fontWeight: 600,
            cursor: starting || isRunning ? 'not-allowed' : 'pointer',
            background: starting || isRunning ? '#333' : '#3b82f6',
            color: '#fff',
            fontSize: 14,
          }}
        >
          {starting ? '⏳ Starting...' : isRunning ? '⟳ Backfill Running...' : '▶ Start Full Backfill'}
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
              <span style={{ color: '#4caf50' }}>✅ Complete</span>
            ) : (
              <span style={{ color: '#888' }}>⏸ Idle</span>
            )}
          </h3>

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
