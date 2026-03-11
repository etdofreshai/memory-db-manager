import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch, discordApi } from '../../api';
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
  const [togglingEnabled, setTogglingEnabled] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');

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

  const handleBackfill = async (ch: MergedChannel) => {
    const key = `${ch.id}-backfill`;
    setActionLoading(p => ({ ...p, [ch.id]: key }));
    try {
      await discordApi('/api/backfill/start', {
        method: 'POST',
        body: JSON.stringify({ channelId: ch.id, attachmentMode: 'missing' }),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[ch.id]; return n; });
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
      borderColor: (active && jobEnabled) ? '#4ade80' : '#555', background: (active && jobEnabled) ? '#1a3a1a' : 'transparent',
      color: (active && jobEnabled) ? '#4ade80' : '#ccc', cursor: isLoading ? 'wait' : 'pointer', marginLeft: 4,
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
          <button style={{ ...btnStyle(false), borderColor: '#666' }} disabled={isLoading} onClick={() => handleBackfill(ch)}>
            {actionLoading[ch.id]?.endsWith('backfill') ? '⏳' : 'Download all'}
          </button>
        </td>
      </tr>
    );
  };

  const renderSection = (title: string, channels: MergedChannel[], count?: number) => {
    const isCollapsed = collapsed[title];
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
      </div>
      {loading ? <p>Loading...</p> : (
        <>
          {dmGroup.length > 0 && renderSection('Direct Messages', dmGroup)}
          {serverGroups.map(g => renderSection(g.name, g.channels))}
          {filtered.length === 0 && <p style={{ color: '#888' }}>No channels match your filter.</p>}
        </>
      )}
    </div>
  );
}
