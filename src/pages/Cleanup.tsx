import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';

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
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card stat-card">
      <div className="stat-value" style={{ color: color || '#64b5f6' }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function Cleanup() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const [channelMap, setChannelMap] = useState<Record<string, any>>({});
  const [sourceId, setSourceId] = useState('');
  const [channel, setChannel] = useState('');
  const [sender, setSender] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
    try { setPreview(await apiFetch(`/api/cleanup/preview?${buildParams()}`)); }
    catch (e: any) { setError(e.message); }
    finally { setPreviewLoading(false); }
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
      setShowConfirm(false); setConfirmText(''); setPreview(null);
      loadStats();
    } catch (e: any) { setError(e.message); }
    finally { setDeleting(false); }
  };

  const hasFilters = !!(sourceId || channel || sender || dateFrom || dateTo);
  const resetFilters = () => { setSourceId(''); setChannel(''); setSender(''); setDateFrom(''); setDateTo(''); };

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
              {hasFilters && <button onClick={resetFilters}>Reset</button>}
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

      {/* Action bar */}
      <div style={{ position: 'sticky', bottom: 0, background: '#0f1117', borderTop: '1px solid #1e2230', padding: '12px 0', display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {!hasFilters && <span style={{ color: '#888', fontSize: 13, alignSelf: 'center', flex: 1 }}>Apply filters before previewing/deleting</span>}
        <button onClick={loadPreview} disabled={!hasFilters || previewLoading} style={{ background: '#1b3a2a', borderColor: '#2e7d32' }}>
          {previewLoading ? '⏳...' : '👁 Preview Delete'}
        </button>
        <button onClick={() => { if (preview && preview.messages > 0) setShowConfirm(true); }}
          disabled={!preview || preview.messages === 0} style={{ background: '#3a1b1b', borderColor: '#7d2e2e' }}>
          🗑 Delete Selected
        </button>
      </div>

      {preview && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Delete Preview</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatCard label="Messages to delete" value={preview.messages.toLocaleString()} color="#ff6b6b" />
            <StatCard label="Links to remove" value={preview.links.toLocaleString()} color="#ffa726" />
            <StatCard label="Orphaned attachments" value={preview.orphaned_attachments.toLocaleString()} color="#ffa726" />
          </div>
        </div>
      )}

      {showConfirm && preview && (
        <div className="modal-overlay" onClick={() => { setShowConfirm(false); setConfirmText(''); }}>
          <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, color: '#ff6b6b' }}>⚠️ Confirm Deletion</h2>
            <p>This will permanently delete:</p>
            <ul style={{ lineHeight: 1.8 }}>
              <li><strong>{preview.messages.toLocaleString()}</strong> messages</li>
              <li><strong>{preview.links.toLocaleString()}</strong> attachment links</li>
              <li><strong>{preview.orphaned_attachments.toLocaleString()}</strong> orphaned attachments</li>
            </ul>
            <p style={{ fontSize: 13, color: '#888' }}>Type <strong>DELETE</strong> to confirm.</p>
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
        </div>
      )}
    </div>
  );
}
