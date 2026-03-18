import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import { usePersistedFilters } from '../hooks/usePersistedFilters';
import ResetFiltersButton from '../components/ResetFiltersButton';

interface Stats {
  total_messages: number;
  total_attachments: number;
  sources: { source_id: number; source_name: string; count: number; attachment_count: number }[];
  channels: { source_name: string; source_id: number; channel: string; count: number; attachment_count: number }[];
  senders: { sender: string; count: number; attachment_count: number }[];
  date_buckets: { month: string; count: number }[];
}

interface Preview {
  messages: number;
  links: number;
  orphaned_attachments: number;
  total_linked_attachments: number;
  breakdown: {
    sources: { name: string; count: number }[];
    channels: { channel: string; count: number }[];
    senders: { sender: string; count: number }[];
    dateRange: { earliest: string | null; latest: string | null };
  };
  sampleMessages: { id: string; sender: string; content: string; timestamp: string; source: string }[];
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card stat-card">
      <div className="stat-value" style={{ color: color || '#64b5f6' }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function truncate(s: string, len: number) {
  return s && s.length > len ? s.slice(0, len) + '…' : (s || '');
}

export default function Cleanup() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const [channelMap, setChannelMap] = useState<Record<string, any>>({});
  const CLEANUP_DEFAULTS = { sourceId: '', channel: '', sender: '', dateFrom: '', dateTo: '' };
  const [filters, setFilters, resetPersistedFilters, isDirtyFilters] = usePersistedFilters('filters:cleanup', CLEANUP_DEFAULTS);
  const { sourceId, channel, sender, dateFrom, dateTo } = filters;
  const setSourceId = (v: string) => setFilters({ sourceId: v });
  const setChannel = (v: string) => setFilters({ channel: v });
  const setSender = (v: string) => setFilters({ sender: v });
  const setDateFrom = (v: string) => setFilters({ dateFrom: v });
  const setDateTo = (v: string) => setFilters({ dateTo: v });

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (sourceId) p.set('source_id', sourceId);
    if (channel) p.set('channel', channel);
    if (sender) p.set('sender', sender);
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo) p.set('date_to', dateTo);
    return p.toString();
  }, [sourceId, channel, sender, dateFrom, dateTo]);

  const loadStats = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setStats(await apiFetch(`/api/cleanup/stats?${buildParams()}`));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [buildParams]);

  useEffect(() => {
    apiFetch('/api/discord/channels').then(setChannelMap).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, []);

  const resolveDisplayName = (ch: string): string => {
    const id = ch.replace('discord-channel:', '');
    const info = channelMap[id];
    return info ? (info.guildName ? `#${info.channelName} (${info.guildName})` : `#${info.channelName}`) : ch;
  };

  const enrichedChannels = stats?.channels.map(ch => ({
    ...ch,
    display_name: ch.channel?.startsWith('discord-channel:') ? resolveDisplayName(ch.channel) : (ch.channel || '—'),
  }));

  const loadPreview = async () => {
    setPreviewLoading(true); setError('');
    try {
      const data = await apiFetch(`/api/cleanup/preview?${buildParams()}`);
      setPreview(data);
      setShowPreviewModal(true);
    } catch (e: any) { setError(e.message); }
    finally { setPreviewLoading(false); }
  };

  const closePreviewModal = () => {
    setShowPreviewModal(false);
    setShowConfirm(false);
    setConfirmText('');
  };

  const doDelete = async () => {
    if (confirmText !== 'DELETE') return;
    setDeleting(true); setError('');
    try {
      const data = await apiFetch('/api/cleanup/delete', {
        method: 'DELETE',
        body: JSON.stringify({
          source_id: sourceId || undefined, channel: channel || undefined,
          sender: sender || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined,
        }),
      });
      setToast(`✅ Deleted: ${data.deleted.messages} messages, ${data.deleted.links} links, ${data.deleted.attachments} attachments`);
      closePreviewModal();
      setPreview(null);
      loadStats();
    } catch (e: any) { setError(e.message); }
    finally { setDeleting(false); }
  };

  const hasFilters = !!(sourceId || channel || sender || dateFrom || dateTo);
  const resetFilters = () => { resetPersistedFilters(); };

  // Orphaned attachments state
  const [orphanStats, setOrphanStats] = useState<{ count: number; total_bytes: number; images: number; videos: number; audio: number; other: number } | null>(null);
  const [orphanLoading, setOrphanLoading] = useState(false);
  const [orphanDeleting, setOrphanDeleting] = useState(false);
  const [showOrphanConfirm, setShowOrphanConfirm] = useState(false);
  const [orphanConfirmText, setOrphanConfirmText] = useState('');

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const checkOrphanedAttachments = async () => {
    setOrphanLoading(true);
    try {
      const data = await apiFetch('/api/cleanup/orphaned-attachments');
      setOrphanStats(data);
    } catch (e: any) { setError(e.message); }
    finally { setOrphanLoading(false); }
  };

  const deleteOrphanedAttachments = async () => {
    if (orphanConfirmText !== 'DELETE') return;
    setOrphanDeleting(true);
    try {
      const data = await apiFetch('/api/cleanup/orphaned-attachments', { method: 'DELETE' });
      setToast(`✅ Deleted ${data.deleted} orphaned attachment(s)`);
      setShowOrphanConfirm(false);
      setOrphanConfirmText('');
      await checkOrphanedAttachments();
    } catch (e: any) { setError(e.message); }
    finally { setOrphanDeleting(false); }
  };

  const resolvePreviewChannel = (ch: string): string => {
    if (ch?.startsWith('discord-channel:')) return resolveDisplayName(ch);
    return ch || '—';
  };

  return (
    <div>
      <h1 className="page-title">🧹 Cleanup</h1>

      {toast && <div className="toast" onClick={() => setToast('')}>{toast}</div>}
      {error && <div className="error-box">{error}</div>}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div className="card" style={{ flex: '1 1 280px', minWidth: 260 }}>
          <h3 style={{ marginTop: 0 }}>Filters</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label><small style={{ color: '#888' }}>Source</small>
              <select value={sourceId} onChange={e => setSourceId(e.target.value)} style={{ width: '100%', display: 'block' }}>
                <option value="">All sources</option>
                {stats?.sources.map(s => <option key={s.source_id} value={s.source_id}>{s.source_name} ({s.count})</option>)}
              </select>
            </label>
            <label><small style={{ color: '#888' }}>Channel / Recipient</small>
              <input value={channel} onChange={e => setChannel(e.target.value)} placeholder="Filter by channel..." style={{ width: '100%', display: 'block' }} />
            </label>
            <label><small style={{ color: '#888' }}>Sender</small>
              <input value={sender} onChange={e => setSender(e.target.value)} placeholder="Filter by sender..." style={{ width: '100%', display: 'block' }} />
            </label>
            <label><small style={{ color: '#888' }}>Date From</small>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: '100%', display: 'block' }} />
            </label>
            <label><small style={{ color: '#888' }}>Date To</small>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: '100%', display: 'block' }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={loadStats} disabled={loading} style={{ flex: 1 }}>{loading ? '⏳ Loading...' : '🔍 Apply'}</button>
              <ResetFiltersButton onReset={resetFilters} visible={isDirtyFilters} />
            </div>
          </div>
        </div>

        <div style={{ flex: '2 1 500px' }}>
          {stats && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <StatCard label="Messages" value={stats.total_messages.toLocaleString()} />
              <StatCard label="Linked Attachments" value={stats.total_attachments.toLocaleString()} />
              <StatCard label="Sources" value={stats.sources.length.toString()} />
            </div>
          )}

          {stats && !loading && (
            <div className="card" style={{ padding: 0, overflow: 'auto' }}>
              <table>
                <thead><tr>
                  <th>Source</th><th>Channel</th><th style={{ textAlign: 'right' }}>Messages</th><th style={{ textAlign: 'right' }}>Attachments</th>
                </tr></thead>
                <tbody>
                  {(enrichedChannels || []).slice(0, 50).map((ch, i) => (
                    <tr key={i} style={{ cursor: 'pointer' }}
                      onClick={() => { if (!sourceId) setSourceId(String(ch.source_id)); else if (!channel) setChannel(ch.channel || ''); }}>
                      <td>{ch.source_name}</td>
                      <td title={ch.channel}>{ch.display_name || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{ch.count.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: '#888' }}>{ch.attachment_count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {stats && hasFilters && stats.senders.length > 0 && (
            <div className="card" style={{ marginTop: 16, padding: 0, overflow: 'auto' }}>
              <h4 style={{ padding: '8px 12px', margin: 0, color: '#888' }}>Top Senders</h4>
              <table>
                <thead><tr><th>Sender</th><th style={{ textAlign: 'right' }}>Messages</th><th style={{ textAlign: 'right' }}>Attachments</th></tr></thead>
                <tbody>
                  {stats.senders.slice(0, 30).map((s, i) => (
                    <tr key={i} style={{ cursor: 'pointer' }} onClick={() => setSender(s.sender || '')}>
                      <td>{s.sender || '(unknown)'}</td>
                      <td style={{ textAlign: 'right' }}>{s.count.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: '#888' }}>{s.attachment_count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Orphaned Attachments Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h3 style={{ margin: 0 }}>🗂 Orphaned Attachments</h3>
          <button onClick={checkOrphanedAttachments} disabled={orphanLoading} style={{ background: '#1a2540', borderColor: '#2d4a7a' }}>
            {orphanLoading ? '⏳ Checking...' : '🔍 Check'}
          </button>
        </div>

        {orphanStats && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <StatCard label="Orphaned" value={orphanStats.count.toLocaleString()} color={orphanStats.count > 0 ? '#ff6b6b' : '#66bb6a'} />
              <StatCard label="Total Size" value={formatBytes(orphanStats.total_bytes)} color="#ffa726" />
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#aaa', flexWrap: 'wrap', marginBottom: orphanStats.count > 0 ? 16 : 0 }}>
              <span>🖼 {orphanStats.images} images</span>
              <span>🎬 {orphanStats.videos} videos</span>
              <span>🎵 {orphanStats.audio} audio</span>
              <span>📄 {orphanStats.other} other</span>
            </div>

            {orphanStats.count > 0 && !showOrphanConfirm && (
              <button onClick={() => setShowOrphanConfirm(true)}
                style={{ background: '#3a1b1b', borderColor: '#7d2e2e', color: '#ff6b6b' }}>
                🗑 Delete Orphaned
              </button>
            )}

            {showOrphanConfirm && (
              <div style={{ borderTop: '1px solid #2a2d3e', paddingTop: 12, marginTop: 12 }}>
                <p style={{ fontSize: 13, color: '#888', margin: '0 0 8px' }}>
                  Type <strong>DELETE</strong> to permanently remove {orphanStats.count} orphaned attachment(s).
                </p>
                <input value={orphanConfirmText} onChange={e => setOrphanConfirmText(e.target.value)}
                  placeholder="Type DELETE" autoFocus
                  style={{ width: '100%', maxWidth: 300, marginBottom: 12, fontSize: 16, textAlign: 'center' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setShowOrphanConfirm(false); setOrphanConfirmText(''); }}>Cancel</button>
                  <button onClick={deleteOrphanedAttachments}
                    disabled={orphanConfirmText !== 'DELETE' || orphanDeleting}
                    style={{ background: '#5a1a1a', borderColor: '#ff6b6b', color: orphanConfirmText === 'DELETE' ? '#ff6b6b' : '#666' }}>
                    {orphanDeleting ? '⏳ Deleting...' : '🗑 Confirm Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action bar — only Preview button, no Delete here */}
      <div style={{ position: 'sticky', bottom: 0, background: '#0f1117', borderTop: '1px solid #1e2230', padding: '12px 0', display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {!hasFilters && <span style={{ color: '#888', fontSize: 13, alignSelf: 'center', flex: 1 }}>Apply filters before previewing</span>}
        <button onClick={loadPreview} disabled={!hasFilters || previewLoading} style={{ background: '#1b3a2a', borderColor: '#2e7d32' }}>
          {previewLoading ? '⏳...' : '👁 Preview Delete'}
        </button>
      </div>

      {/* Preview Modal with full details + delete action */}
      {showPreviewModal && preview && (
        <div className="modal-overlay" onClick={closePreviewModal}>
          <div className="modal-content" style={{ maxWidth: 680, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, color: '#ff6b6b' }}>🗑 Delete Preview</h2>

            {/* Summary stat cards */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <StatCard label="Messages" value={preview.messages.toLocaleString()} color="#ff6b6b" />
              <StatCard label="Links" value={preview.links.toLocaleString()} color="#ffa726" />
              <StatCard label="Orphaned Attachments" value={preview.orphaned_attachments.toLocaleString()} color="#ffa726" />
            </div>

            {/* Date range */}
            {preview.breakdown?.dateRange && (preview.breakdown.dateRange.earliest || preview.breakdown.dateRange.latest) && (
              <div style={{ marginBottom: 16, padding: '8px 12px', background: '#1a1d2e', borderRadius: 6, fontSize: 13 }}>
                <strong>Date Range:</strong> {formatDate(preview.breakdown.dateRange.earliest)} → {formatDate(preview.breakdown.dateRange.latest)}
              </div>
            )}

            {/* Breakdown by source */}
            {preview.breakdown?.sources?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 6px', color: '#888', fontSize: 13 }}>By Source</h4>
                <table style={{ width: '100%', fontSize: 13 }}>
                  <thead><tr><th style={{ textAlign: 'left' }}>Source</th><th style={{ textAlign: 'right' }}>Count</th></tr></thead>
                  <tbody>
                    {preview.breakdown.sources.map((s, i) => (
                      <tr key={i}><td>{s.name}</td><td style={{ textAlign: 'right' }}>{s.count.toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Breakdown by channel */}
            {preview.breakdown?.channels?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 6px', color: '#888', fontSize: 13 }}>By Channel (top 20)</h4>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 13 }}>
                    <thead><tr><th style={{ textAlign: 'left' }}>Channel</th><th style={{ textAlign: 'right' }}>Count</th></tr></thead>
                    <tbody>
                      {preview.breakdown.channels.map((c, i) => (
                        <tr key={i}><td title={c.channel}>{resolvePreviewChannel(c.channel)}</td><td style={{ textAlign: 'right' }}>{c.count.toLocaleString()}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Breakdown by sender */}
            {preview.breakdown?.senders?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 6px', color: '#888', fontSize: 13 }}>By Sender (top 10)</h4>
                <table style={{ width: '100%', fontSize: 13 }}>
                  <thead><tr><th style={{ textAlign: 'left' }}>Sender</th><th style={{ textAlign: 'right' }}>Count</th></tr></thead>
                  <tbody>
                    {preview.breakdown.senders.map((s, i) => (
                      <tr key={i}><td>{s.sender || '(unknown)'}</td><td style={{ textAlign: 'right' }}>{s.count.toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sample messages */}
            {preview.sampleMessages?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 6px', color: '#888', fontSize: 13 }}>Sample Messages</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {preview.sampleMessages.map((m, i) => (
                    <div key={i} style={{ background: '#1a1d2e', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, color: '#888' }}>
                        <span><strong style={{ color: '#aaa' }}>{m.sender || '?'}</strong> · {m.source}</span>
                        <span>{new Date(m.timestamp).toLocaleString()}</span>
                      </div>
                      <div style={{ color: '#ccc' }}>{truncate(m.content, 100)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delete / Cancel actions */}
            {!showConfirm ? (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={closePreviewModal} style={{ flex: 0 }}>Cancel</button>
                <button onClick={() => setShowConfirm(true)} disabled={preview.messages === 0}
                  style={{ background: '#3a1b1b', borderColor: '#7d2e2e', color: '#ff6b6b' }}>
                  🗑 Delete Selected
                </button>
              </div>
            ) : (
              <div style={{ borderTop: '1px solid #2a2d3e', paddingTop: 12 }}>
                <p style={{ fontSize: 13, color: '#888', margin: '0 0 8px' }}>Type <strong>DELETE</strong> to confirm permanent deletion.</p>
                <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="Type DELETE" autoFocus
                  style={{ width: '100%', marginBottom: 12, fontSize: 16, textAlign: 'center' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setShowConfirm(false); setConfirmText(''); }} style={{ flex: 1 }}>Cancel</button>
                  <button onClick={doDelete} disabled={confirmText !== 'DELETE' || deleting}
                    style={{ flex: 1, background: '#5a1a1a', borderColor: '#ff6b6b', color: confirmText === 'DELETE' ? '#ff6b6b' : '#666' }}>
                    {deleting ? '⏳ Deleting...' : '🗑 Confirm Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
