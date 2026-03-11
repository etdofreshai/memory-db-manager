import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { apiFetch, discordApi } from '../../api';
import { useNavigate } from 'react-router-dom';
import { usePersistedFilters } from '../../hooks/usePersistedFilters';
import ResetFiltersButton from '../../components/ResetFiltersButton';

interface ChannelInfo {
  channelName: string;
  guildId: string | null;
  guildName: string | null;
}

interface ChannelStats {
  lastMessageAt: string | null;
  messageCount: number;
}

interface Job {
  id?: string;
  _id?: string;
  channel: string;
  name?: string;
  cadencePreset?: string;
  intervalMinutes?: number;
  enabled?: boolean;
}

interface MergedChannel {
  id: string;
  name: string;
  guildId: string | null;
  guildName: string | null;
  lastMessageAt: string | null;
  messageCount: number;
}

interface ServerGroup {
  name: string;
  channels: MergedChannel[];
  latestMessage: number;
}

const COLLAPSE_KEY = 'discord-channels-collapse';

function getCollapseState(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch { return {}; }
}
function setCollapseState(s: Record<string, boolean>) {
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify(s));
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function DiscordChannels() {
  const [channelMap, setChannelMap] = useState<Record<string, ChannelInfo>>({});
  const [stats, setStats] = useState<Record<string, ChannelStats>>({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters, resetFilters, isDirty] = usePersistedFilters('filters:discord-channels', { filter: '' });
  const filter = filters.filter;
  const setFilter = (v: string) => setFilters({ filter: v });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(getCollapseState);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({}); // channelId -> action key
  const [backfillRunning, setBackfillRunning] = useState<Record<string, string>>({}); // channelId -> runId
  const [backfillQueued, setBackfillQueued] = useState<Record<string, { runId: string; position: number }>>({}); // channelId -> queued info
  const [togglingEnabled, setTogglingEnabled] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<MergedChannel | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const fetchAll = useCallback(() => {
    Promise.all([
      discordApi<Record<string, ChannelInfo>>('/api/channels'),
      apiFetch<{ channels: Record<string, ChannelStats> }>('/api/discord/channels/stats'),
      discordApi<Job[]>('/api/jobs'),
    ])
      .then(([chMap, statsData, jobsData]) => {
        setChannelMap(chMap || {});
        setStats(statsData?.channels || {});
        setJobs(Array.isArray(jobsData) ? jobsData : []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Restore queue state on page load
  useEffect(() => {
    fetch('/proxy/discord-ingestor/api/backfill/queue')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.queue) {
          for (const item of data.queue) {
            if (item.channelId) {
              setBackfillQueued(p => ({ ...p, [item.channelId]: { runId: item.runId, position: item.position } }));
              pollBackfillStatus(item.channelId, item.runId);
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleRefreshChannels = async () => {
    setRefreshing(true);
    setRefreshMsg('');
    try {
      const res = await discordApi<{ ok: boolean; count: number }>('/api/channels/refresh', { method: 'POST' });
      setRefreshMsg(`✓ Refreshed ${res.count} channels`);
      fetchAll();
    } catch (e: any) {
      setRefreshMsg(`Error: ${e.message}`);
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(''), 5000);
    }
  };

  const jobsByChannel = useMemo(() => {
    const m: Record<string, Job> = {};
    for (const j of jobs) { if (j.channel) m[j.channel] = j; }
    return m;
  }, [jobs]);

  const merged: MergedChannel[] = useMemo(() => {
    const ids = new Set([...Object.keys(channelMap), ...Object.keys(stats)]);
    return Array.from(ids).map(id => ({
      id,
      name: channelMap[id]?.channelName || id,
      guildId: channelMap[id]?.guildId || null,
      guildName: channelMap[id]?.guildName || null,
      lastMessageAt: stats[id]?.lastMessageAt || null,
      messageCount: stats[id]?.messageCount || 0,
    }));
  }, [channelMap, stats]);

  const filtered = useMemo(() => {
    if (!filter) return merged;
    const f = filter.toLowerCase();
    return merged.filter(ch =>
      ch.name.toLowerCase().includes(f) ||
      (ch.guildName || '').toLowerCase().includes(f) ||
      ch.id.includes(f)
    );
  }, [merged, filter]);

  const { dmGroup, serverGroups } = useMemo(() => {
    const dms: MergedChannel[] = [];
    const serverMap: Record<string, MergedChannel[]> = {};
    for (const ch of filtered) {
      if (!ch.guildName || ch.guildName === 'Direct Messages') {
        dms.push(ch);
      } else {
        (serverMap[ch.guildName] ||= []).push(ch);
      }
    }
    const sortByRecent = (a: MergedChannel, b: MergedChannel) =>
      (b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0) -
      (a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0);
    dms.sort(sortByRecent);
    const groups: ServerGroup[] = Object.entries(serverMap).map(([name, channels]) => {
      channels.sort(sortByRecent);
      const latest = channels[0]?.lastMessageAt ? new Date(channels[0].lastMessageAt).getTime() : 0;
      return { name, channels, latestMessage: latest };
    });
    groups.sort((a, b) => b.latestMessage - a.latestMessage);
    return { dmGroup: dms, serverGroups: groups };
  }, [filtered]);

  const toggleCollapse = (name: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [name]: !prev[name] };
      setCollapseState(next);
      return next;
    });
  };

  const handleSchedule = async (ch: MergedChannel, cadence: '1d' | '4h') => {
    const key = `${ch.id}-${cadence}`;
    setActionLoading(p => ({ ...p, [ch.id]: key }));
    try {
      const existing = jobsByChannel[ch.id];
      if (existing && existing.cadencePreset === cadence) {
        // Delete existing job
        const jobId = existing._id || existing.id;
        await discordApi(`/api/jobs/${jobId}`, { method: 'DELETE' });
      } else {
        // If different cadence job exists, delete it first
        if (existing) {
          const jobId = existing._id || existing.id;
          await discordApi(`/api/jobs/${jobId}`, { method: 'DELETE' });
        }
        const intervalMinutes = cadence === '1d' ? 1440 : 240;
        const label = cadence === '1d' ? 'every 1d' : 'every 4h';
        await discordApi('/api/jobs', {
          method: 'POST',
          body: JSON.stringify({
            channel: ch.id,
            name: `#${ch.name} ${label}`,
            sincePreset: cadence,
            cadencePreset: cadence,
            intervalMinutes,
            enabled: true,
          }),
        });
      }
      // Refresh jobs
      const freshJobs = await discordApi<Job[]>('/api/jobs');
      setJobs(Array.isArray(freshJobs) ? freshJobs : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[ch.id]; return n; });
    }
  };

  const pollBackfillStatus = async (channelId: string, runId: string) => {
    const poll = async () => {
      try {
        const status = await discordApi<any>(`/api/backfill/status/${runId}`);
        if (status?.status === 'queued') {
          setBackfillQueued(p => ({ ...p, [channelId]: { runId, position: status.position } }));
          setBackfillRunning(p => { const n = { ...p }; delete n[channelId]; return n; });
          setTimeout(poll, 5000);
        } else if (status?.status === 'running' || status?.status === 'paused') {
          setBackfillQueued(p => { const n = { ...p }; delete n[channelId]; return n; });
          setBackfillRunning(p => ({ ...p, [channelId]: runId }));
          setTimeout(poll, 5000);
        } else {
          setBackfillQueued(p => { const n = { ...p }; delete n[channelId]; return n; });
          setBackfillRunning(p => { const n = { ...p }; delete n[channelId]; return n; });
        }
      } catch {
        setBackfillQueued(p => { const n = { ...p }; delete n[channelId]; return n; });
        setBackfillRunning(p => { const n = { ...p }; delete n[channelId]; return n; });
      }
    };
    setTimeout(poll, 3000);
  };

  const handleBackfill = async (ch: MergedChannel) => {
    if (backfillRunning[ch.id] || backfillQueued[ch.id]) return; // already running or queued
    const key = `${ch.id}-backfill`;
    setActionLoading(p => ({ ...p, [ch.id]: key }));
    try {
      const raw = await fetch(`/proxy/discord-ingestor/api/backfill/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: ch.id, attachmentMode: 'missing' }),
      });
      const body = await raw.json().catch(() => ({}));
      if (raw.status === 202 && body?.queued) {
        // Queued
        setBackfillQueued(p => ({ ...p, [ch.id]: { runId: body.runId, position: body.position } }));
        pollBackfillStatus(ch.id, body.runId);
      } else if (raw.ok && body?.runId) {
        setBackfillRunning(p => ({ ...p, [ch.id]: body.runId }));
        pollBackfillStatus(ch.id, body.runId);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[ch.id]; return n; });
    }
  };

  const handleCancelBackfill = async (ch: MergedChannel) => {
    const runId = backfillRunning[ch.id] || backfillQueued[ch.id]?.runId;
    if (!runId) return;
    try {
      if (backfillRunning[ch.id]) {
        await fetch('/proxy/discord-ingestor/api/backfill/pause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runId }),
        });
      } else {
        await fetch(`/proxy/discord-ingestor/api/backfill/queue/${runId}`, { method: 'DELETE' });
      }
      setBackfillRunning(p => { const n = { ...p }; delete n[ch.id]; return n; });
      setBackfillQueued(p => { const n = { ...p }; delete n[ch.id]; return n; });
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleToggleEnabled = async (ch: MergedChannel) => {
    const job = jobsByChannel[ch.id];
    if (!job) return;
    const jobId = job._id || job.id;
    setTogglingEnabled(p => ({ ...p, [ch.id]: true }));
    try {
      await discordApi(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      const freshJobs = await discordApi<Job[]>('/api/jobs');
      setJobs(Array.isArray(freshJobs) ? freshJobs : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTogglingEnabled(p => { const n = { ...p }; delete n[ch.id]; return n; });
    }
  };

  const renderBadge = (ch: MergedChannel) => {
    const job = jobsByChannel[ch.id];
    if (!job) return null;
    const cadenceLabel = job.cadencePreset === '1d' ? 'synced daily' : job.cadencePreset === '4h' ? 'synced 4h' : 'synced';
    if (job.enabled) {
      return <span style={{ background: '#1a3a1a', color: '#4ade80', fontSize: 11, padding: '2px 6px', borderRadius: 4, marginLeft: 8 }}>✓ {cadenceLabel}</span>;
    }
    return <span style={{ background: '#555', color: '#999', fontSize: 11, padding: '2px 6px', borderRadius: 4, marginLeft: 8 }}>⏸ {cadenceLabel}</span>;
  };

  const renderRow = (ch: MergedChannel) => {
    const job = jobsByChannel[ch.id];
    const isLoading = !!actionLoading[ch.id];
    const active1d = job?.cadencePreset === '1d';
    const active4h = job?.cadencePreset === '4h';
    const jobEnabled = job?.enabled ?? false;
    const btnStyle = (active: boolean): React.CSSProperties => ({
      padding: '3px 8px', fontSize: 12, borderRadius: 4, border: '1px solid',
      borderColor: (active && jobEnabled) ? '#4ade80' : (active && !jobEnabled) ? '#555' : '#444',
      background: (active && jobEnabled) ? '#1a3a1a' : (active && !jobEnabled) ? '#1e1e1e' : 'transparent',
      color: (active && jobEnabled) ? '#4ade80' : (active && !jobEnabled) ? '#666' : '#999',
      cursor: isLoading ? 'wait' : 'pointer', marginLeft: 4,
    });
    const toggleBusy = !!togglingEnabled[ch.id];
    return (
      <tr key={ch.id} style={{ borderBottom: '1px solid #333' }}>
        <td style={{ padding: '6px 8px' }}>
          <strong>{ch.name}</strong>
          {renderBadge(ch)}
          <br />
          <code style={{ fontSize: 11, color: '#888' }}>{ch.id}</code>
        </td>
        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }} title={ch.lastMessageAt || ''}>
          {relativeTime(ch.lastMessageAt)}
        </td>
        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{ch.messageCount.toLocaleString()}</td>
        <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
          {job && (
            <button
              onClick={() => handleToggleEnabled(ch)}
              disabled={toggleBusy}
              style={{
                position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none',
                background: jobEnabled ? '#4ade80' : '#555', cursor: toggleBusy ? 'wait' : 'pointer',
                marginRight: 8, verticalAlign: 'middle', padding: 0, transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: jobEnabled ? 18 : 2,
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', display: 'block',
              }} />
            </button>
          )}
          <button style={btnStyle(!!active1d)} disabled={isLoading} onClick={() => handleSchedule(ch, '1d')}>Every day</button>
          <button style={btnStyle(!!active4h)} disabled={isLoading} onClick={() => handleSchedule(ch, '4h')}>Every 4h</button>
          <div style={{ position: 'relative', display: 'inline-block' }} ref={menuOpen === ch.id ? menuRef : undefined}>
            <button
              onClick={() => setMenuOpen(menuOpen === ch.id ? null : ch.id)}
              style={{ fontSize: 14, padding: '3px 8px', cursor: 'pointer', background: 'none', border: '1px solid #555', borderRadius: 4, color: '#ccc', marginLeft: 4 }}
            >
              ⋯
            </button>
            {menuOpen === ch.id && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4,
                background: '#2f3136', border: '1px solid #555', borderRadius: 6,
                zIndex: 50, minWidth: 180, boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
              }}>
                <button
                  onClick={() => { setMenuOpen(null); handleBackfill(ch); }}
                  disabled={!!backfillRunning[ch.id] || !!backfillQueued[ch.id]}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                    background: 'none', border: 'none', fontSize: 13, cursor: (backfillRunning[ch.id] || backfillQueued[ch.id]) ? 'default' : 'pointer',
                    color: backfillRunning[ch.id] ? '#888' : backfillQueued[ch.id] ? '#888' : '#e0e0e0',
                  }}
                  onMouseOver={e => { if (!backfillRunning[ch.id] && !backfillQueued[ch.id]) e.currentTarget.style.background = '#3d4046'; }}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                >
                  {backfillRunning[ch.id] ? '⟳ Running…' : backfillQueued[ch.id] ? `⏳ Queued (#${backfillQueued[ch.id].position})` : '⬇ Download Missing'}
                </button>
                {(backfillRunning[ch.id] || backfillQueued[ch.id]) && (
                  <button
                    onClick={() => { setMenuOpen(null); handleCancelBackfill(ch); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}
                    onMouseOver={e => (e.currentTarget.style.background = '#3d4046')}
                    onMouseOut={e => (e.currentTarget.style.background = 'none')}
                  >
                    ✕ Cancel download
                  </button>
                )}
                <button
                  onClick={() => { setMenuOpen(null); setDeleteInput(''); setDeleteConfirm(ch); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}
                  onMouseOver={e => (e.currentTarget.style.background = '#3d4046')}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                >
                  🗑 Delete all
                </button>
                <button
                  onClick={() => { setMenuOpen(null); navigate(`/memory/messages?source=discord&recipient=discord-channel:${ch.id}`); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', fontSize: 13 }}
                  onMouseOver={e => (e.currentTarget.style.background = '#3d4046')}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                >
                  📨 View all
                </button>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const renderSection = (title: string, channels: MergedChannel[], count?: number) => {
    const isCollapsed = collapsed[title] !== false; // default collapsed unless explicitly expanded
    return (
      <div key={title} className="card" style={{ marginBottom: 12 }}>
        <div
          onClick={() => toggleCollapse(title)}
          style={{ cursor: 'pointer', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
        >
          <span style={{ fontWeight: 600, fontSize: 15 }}>
            {isCollapsed ? '▸' : '▾'} {title}
          </span>
          <span style={{ color: '#888', fontSize: 13 }}>{count ?? channels.length} channels</span>
        </div>
        {!isCollapsed && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #444', fontSize: 12, color: '#888' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Channel</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Last message</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Count</th>
                <th style={{ textAlign: 'right', padding: '4px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>{channels.map(renderRow)}</tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div>
      <h1 className="page-title">📺 Discord Channels</h1>
      {error && <div className="error-box">{error}</div>}
      <div className="filters-bar">
        <input
          placeholder="Filter channels, servers, IDs..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ minWidth: 250 }}
        />
        <span style={{ color: '#888', fontSize: 13 }}>{filtered.length} channels</span>
        <ResetFiltersButton onReset={resetFilters} visible={isDirty} />
        <button
          onClick={handleRefreshChannels}
          disabled={refreshing}
          style={{ marginLeft: 'auto', padding: '5px 12px', background: '#1a2a3a', border: '1px solid #4a9eff', borderRadius: 6, color: '#4a9eff', cursor: refreshing ? 'wait' : 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
        >
          {refreshing ? '⟳ Refreshing…' : '⟳ Refresh Names'}
        </button>
        {refreshMsg && <span style={{ fontSize: 12, color: refreshMsg.startsWith('✓') ? '#4ade80' : '#f44336' }}>{refreshMsg}</span>}
        <button
          onClick={() => { const s: Record<string,boolean> = {}; ['Direct Messages', ...serverGroups.map(g => g.name)].forEach(n => s[n] = false); setCollapseState(s); setCollapsed(s); }}
          style={{ padding: '5px 10px', background: 'none', border: '1px solid #555', borderRadius: 6, color: '#aaa', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
        >⊞ Expand All</button>
        <button
          onClick={() => { const s: Record<string,boolean> = {}; ['Direct Messages', ...serverGroups.map(g => g.name)].forEach(n => s[n] = true); setCollapseState(s); setCollapsed(s); }}
          style={{ padding: '5px 10px', background: 'none', border: '1px solid #555', borderRadius: 6, color: '#aaa', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
        >⊟ Collapse All</button>
      </div>
      {loading ? <p>Loading...</p> : (
        <>
          {dmGroup.length > 0 && renderSection('Direct Messages', dmGroup)}
          {serverGroups.map(g => renderSection(g.name, g.channels))}
          {filtered.length === 0 && <p style={{ color: '#888' }}>No channels match your filter.</p>}
        </>
      )}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: '#2f3136', border: '1px solid #555', borderRadius: 8, padding: 24, minWidth: 340, maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Delete all messages from #{deleteConfirm.name}?</h3>
            <p style={{ color: '#aaa', fontSize: 13, margin: '0 0 16px' }}>This cannot be undone. Type <strong>DELETE</strong> to confirm.</p>
            <input
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder="Type DELETE"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #555', background: '#1e1e1e', color: '#e0e0e0', fontSize: 14, boxSizing: 'border-box' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: '6px 16px', background: 'none', border: '1px solid #555', borderRadius: 4, color: '#aaa', cursor: 'pointer' }}>Cancel</button>
              <button
                disabled={deleteInput !== 'DELETE' || deleteLoading}
                onClick={async () => {
                  setDeleteLoading(true);
                  try {
                    await apiFetch('/api/cleanup/delete', { method: 'DELETE', body: JSON.stringify({ recipient: `discord-channel:${deleteConfirm.id}` }) });
                    setDeleteConfirm(null);
                    fetchAll();
                  } catch (e: any) {
                    setError(e.message);
                    setDeleteConfirm(null);
                  } finally {
                    setDeleteLoading(false);
                  }
                }}
                style={{ padding: '6px 16px', background: deleteInput === 'DELETE' ? '#dc2626' : '#555', border: 'none', borderRadius: 4, color: '#fff', cursor: deleteInput === 'DELETE' && !deleteLoading ? 'pointer' : 'not-allowed', opacity: deleteInput === 'DELETE' ? 1 : 0.5 }}
              >
                {deleteLoading ? 'Deleting…' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
