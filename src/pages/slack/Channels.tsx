import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { apiFetch, slackApi } from '../../api';
import { useNavigate } from 'react-router-dom';
import { usePersistedFilters } from '../../hooks/usePersistedFilters';
import ResetFiltersButton from '../../components/ResetFiltersButton';

interface SlackChannel {
  id: string;
  name: string;
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
  lastSyncedAt?: string;
  lastRunAt?: string;
  startDate?: string;
}

interface MergedChannel {
  id: string;
  name: string;
  lastMessageAt: string | null;
  messageCount: number;
}

const COLLAPSE_KEY = 'slack-channels-collapse';

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

export default function SlackChannels() {
  const [channelList, setChannelList] = useState<SlackChannel[]>([]);
  const [stats, setStats] = useState<Record<string, ChannelStats>>({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters, resetFilters, isDirty] = usePersistedFilters('filters:slack-channels', { filter: '' });
  const filter = filters.filter;
  const setFilter = (v: string) => setFilters({ filter: v });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(getCollapseState);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [togglingEnabled, setTogglingEnabled] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [scheduleMenuOpen, setScheduleMenuOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<MergedChannel | null>(null);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [startDateModal, setStartDateModal] = useState<MergedChannel | null>(null);
  const [startDateInput, setStartDateInput] = useState('');
  const [startDateLoading, setStartDateLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const CADENCE_OPTIONS: { label: string; value: string; minutes: number }[] = [
    { label: 'Every hour',     value: '1h',  minutes: 60 },
    { label: 'Every 4 hours',  value: '4h',  minutes: 240 },
    { label: 'Every day',      value: '1d',  minutes: 1440 },
    { label: 'Every 2 days',   value: '2d',  minutes: 2880 },
    { label: 'Every 3 days',   value: '3d',  minutes: 4320 },
    { label: 'Every week',     value: '1w',  minutes: 10080 },
    { label: 'Every month',    value: '1mo', minutes: 43200 },
    { label: 'Every quarter',  value: '3mo', minutes: 129600 },
    { label: 'Every 6 months', value: '6mo', minutes: 259200 },
    { label: 'Every year',     value: '1y',  minutes: 525600 },
  ];

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
      slackApi<any>('/api/channels'),
      slackApi<Job[]>('/api/jobs'),
    ])
      .then(([chData, jobsData]) => {
        // API returns { channels: [...] } or directly [...]
        const chList: SlackChannel[] = Array.isArray(chData) ? chData : (chData?.channels || []);
        setChannelList(chList);
        setStats({});
        setJobs(Array.isArray(jobsData) ? jobsData : []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const jobsByChannel = useMemo(() => {
    const m: Record<string, Job> = {};
    for (const j of jobs) { if (j.channel) m[j.channel] = j; }
    return m;
  }, [jobs]);

  const merged: MergedChannel[] = useMemo(() => {
    return channelList.map(c => ({
      id: c.id,
      name: c.name || c.id,
      lastMessageAt: null,
      messageCount: 0,
    }));
  }, [channelList]);

  const filtered = useMemo(() => {
    if (!filter) return merged;
    const f = filter.toLowerCase();
    return merged.filter(ch =>
      ch.name.toLowerCase().includes(f) ||
      ch.id.includes(f)
    );
  }, [merged, filter]);

  // Sort by most recent message
  const sortedChannels = useMemo(() => {
    return [...filtered].sort((a, b) =>
      (b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0) -
      (a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0)
    );
  }, [filtered]);

  const toggleCollapse = (name: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [name]: !prev[name] };
      setCollapseState(next);
      return next;
    });
  };

  const handleSchedule = async (ch: MergedChannel, cadence: string, intervalMinutes?: number) => {
    const key = `${ch.id}-${cadence}`;
    setActionLoading(p => ({ ...p, [ch.id]: key }));
    try {
      const existing = jobsByChannel[ch.id];
      if (existing && existing.cadencePreset === cadence) {
        const jobId = existing._id || existing.id;
        await slackApi(`/api/jobs/${jobId}`, { method: 'DELETE' });
      } else {
        if (existing) {
          const jobId = existing._id || existing.id;
          await slackApi(`/api/jobs/${jobId}`, { method: 'DELETE' });
        }
        const mins = intervalMinutes ?? CADENCE_OPTIONS.find(o => o.value === cadence)?.minutes ?? 1440;
        await slackApi('/api/jobs', {
          method: 'POST',
          body: JSON.stringify({
            channel: ch.id,
            name: `#${ch.name} every ${cadence}`,
            sincePreset: cadence,
            cadencePreset: cadence,
            intervalMinutes: mins,
            enabled: true,
          }),
        });
      }
      const freshJobs = await slackApi<Job[]>('/api/jobs');
      setJobs(Array.isArray(freshJobs) ? freshJobs : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(p => { const n = { ...p }; delete n[ch.id]; return n; });
    }
  };

  const handleResetSync = async (ch: MergedChannel) => {
    const job = jobsByChannel[ch.id];
    if (!job) return;
    const jobId = job._id || job.id;
    if (!confirm(`Reset sync for #${ch.name}? Next run will re-fetch from startDate or beginning.`)) return;
    try {
      await slackApi(`/api/jobs/${jobId}/reset-sync`, { method: 'POST' });
      const freshJobs = await slackApi<Job[]>('/api/jobs');
      setJobs(Array.isArray(freshJobs) ? freshJobs : []);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSetStartDate = async (ch: MergedChannel, dateStr: string) => {
    const job = jobsByChannel[ch.id];
    if (!job) return;
    const jobId = job._id || job.id;
    setStartDateLoading(true);
    try {
      await slackApi(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        body: JSON.stringify({ startDate: dateStr || null }),
      });
      const freshJobs = await slackApi<Job[]>('/api/jobs');
      setJobs(Array.isArray(freshJobs) ? freshJobs : []);
      setStartDateModal(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStartDateLoading(false);
    }
  };

  const handleToggleEnabled = async (ch: MergedChannel) => {
    const job = jobsByChannel[ch.id];
    if (!job) return;
    const jobId = job._id || job.id;
    setTogglingEnabled(p => ({ ...p, [ch.id]: true }));
    try {
      await slackApi(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !job.enabled }),
      });
      const freshJobs = await slackApi<Job[]>('/api/jobs');
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
    const cadenceLabel = CADENCE_OPTIONS.find(o => o.value === job.cadencePreset)?.label.replace('Every ', 'every ') ?? `every ${job.cadencePreset}`;
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
          <strong>#{ch.name}</strong>
          {renderBadge(ch)}
          <br />
          <code style={{ fontSize: 11, color: '#888' }}>{ch.id}</code>
        </td>
        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }} title={ch.lastMessageAt || ''}>
          {relativeTime(ch.lastMessageAt)}
        </td>
        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: job?.lastSyncedAt || job?.lastRunAt ? '#4ade80' : '#555' }}
          title={job?.lastSyncedAt || job?.lastRunAt || 'Never synced'}>
          {job ? (job.lastSyncedAt || job.lastRunAt ? relativeTime(job.lastSyncedAt || job.lastRunAt || null) : '—') : ''}
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
                {job && (
                  <>
                    <button
                      onClick={() => { setMenuOpen(null); setStartDateInput(job.startDate ? job.startDate.split('T')[0] : ''); setStartDateModal(ch); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', fontSize: 13 }}
                      onMouseOver={e => (e.currentTarget.style.background = '#3d4046')}
                      onMouseOut={e => (e.currentTarget.style.background = 'none')}
                    >
                      ⚙ Set start date…
                    </button>
                    <button
                      onClick={() => { setMenuOpen(null); handleResetSync(ch); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 13 }}
                      onMouseOver={e => (e.currentTarget.style.background = '#3d4046')}
                      onMouseOut={e => (e.currentTarget.style.background = 'none')}
                    >
                      ↺ Reset sync
                    </button>
                  </>
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
                  onClick={() => { setMenuOpen(null); navigate(`/memory/messages?source=slack&recipient=slack-channel:${ch.id}`); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', fontSize: 13 }}
                  onMouseOver={e => (e.currentTarget.style.background = '#3d4046')}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                >
                  📨 View all
                </button>
                {/* Schedule submenu */}
                <div style={{ borderTop: '1px solid #444', position: 'relative' }}>
                  <button
                    onClick={() => setScheduleMenuOpen(scheduleMenuOpen === ch.id ? null : ch.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', fontSize: 13 }}
                    onMouseOver={e => (e.currentTarget.style.background = '#3d4046')}
                    onMouseOut={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span>🕐 Schedule…</span>
                    <span style={{ fontSize: 10, color: '#888' }}>▶</span>
                  </button>
                  {scheduleMenuOpen === ch.id && (
                    <div style={{
                      position: 'absolute', left: '100%', top: 0,
                      background: '#2f3136', border: '1px solid #555', borderRadius: 6,
                      zIndex: 60, minWidth: 160, boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                    }}>
                      {CADENCE_OPTIONS.map(opt => {
                        const isActive = job?.cadencePreset === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => { setMenuOpen(null); setScheduleMenuOpen(null); handleSchedule(ch, opt.value, opt.minutes); }}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              width: '100%', textAlign: 'left', padding: '7px 12px',
                              background: isActive ? '#1a3a1a' : 'none', border: 'none',
                              color: isActive ? '#4ade80' : '#e0e0e0', cursor: 'pointer', fontSize: 13,
                            }}
                            onMouseOver={e => { if (!isActive) e.currentTarget.style.background = '#3d4046'; }}
                            onMouseOut={e => { if (!isActive) e.currentTarget.style.background = 'none'; }}
                          >
                            {opt.label}
                            {isActive && <span style={{ fontSize: 11 }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const SECTION_KEY = 'Slack Channels';
  const isCollapsed = collapsed[SECTION_KEY] !== false;

  const renderChannelTable = (channels: MergedChannel[]) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #444', fontSize: 12, color: '#888' }}>
          <th style={{ textAlign: 'left', padding: '4px 8px' }}>Channel</th>
          <th style={{ textAlign: 'left', padding: '4px 8px' }}>Last message</th>
          <th style={{ textAlign: 'left', padding: '4px 8px' }}>Last synced</th>
          <th style={{ textAlign: 'right', padding: '4px 8px' }}>Count</th>
          <th style={{ textAlign: 'right', padding: '4px 8px' }}>Actions</th>
        </tr>
      </thead>
      <tbody>{channels.map(renderRow)}</tbody>
    </table>
  );

  return (
    <div>
      <h1 className="page-title">💬 Slack Channels</h1>
      {error && <div className="error-box">{error}</div>}
      <div className="filters-bar">
        <input
          placeholder="Filter channels, IDs..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ minWidth: 250 }}
        />
        <span style={{ color: '#888', fontSize: 13 }}>{filtered.length} channels</span>
        <ResetFiltersButton onReset={resetFilters} visible={isDirty} />
        <button
          onClick={() => { setCollapseState({ [SECTION_KEY]: false }); setCollapsed({ [SECTION_KEY]: false }); }}
          style={{ padding: '5px 10px', background: 'none', border: '1px solid #555', borderRadius: 6, color: '#aaa', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap', marginLeft: 'auto' }}
        >⊞ Expand All</button>
        <button
          onClick={() => { setCollapseState({ [SECTION_KEY]: true }); setCollapsed({ [SECTION_KEY]: true }); }}
          style={{ padding: '5px 10px', background: 'none', border: '1px solid #555', borderRadius: 6, color: '#aaa', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
        >⊟ Collapse All</button>
      </div>
      {loading ? <p>Loading...</p> : (
        <div className="card" style={{ marginBottom: 12 }}>
          <div
            onClick={() => toggleCollapse(SECTION_KEY)}
            style={{ cursor: 'pointer', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {isCollapsed ? '▸' : '▾'} All Channels
            </span>
            <span style={{ color: '#888', fontSize: 13 }}>{sortedChannels.length} channels</span>
          </div>
          {!isCollapsed && renderChannelTable(sortedChannels)}
          {filtered.length === 0 && !isCollapsed && <p style={{ color: '#888', padding: '8px 12px' }}>No channels match your filter.</p>}
        </div>
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
                    await apiFetch('/api/cleanup/delete', { method: 'DELETE', body: JSON.stringify({ recipient: `slack-channel:${deleteConfirm.id}` }) });
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
      {startDateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setStartDateModal(null)}>
          <div style={{ background: '#2f3136', border: '1px solid #555', borderRadius: 8, padding: 24, minWidth: 320, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>⚙ Set start date for #{startDateModal.name}</h3>
            <p style={{ color: '#aaa', fontSize: 13, margin: '0 0 16px' }}>Messages before this date will never be fetched. Leave empty to fetch from the beginning.</p>
            <input
              type="date"
              value={startDateInput}
              onChange={e => setStartDateInput(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #555', background: '#1e1e1e', color: '#e0e0e0', fontSize: 14, boxSizing: 'border-box' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setStartDateModal(null)} style={{ padding: '6px 16px', background: 'none', border: '1px solid #555', borderRadius: 4, color: '#aaa', cursor: 'pointer' }}>Cancel</button>
              <button
                disabled={startDateLoading}
                onClick={() => handleSetStartDate(startDateModal, startDateInput ? `${startDateInput}T00:00:00.000Z` : '')}
                style={{ padding: '6px 16px', background: '#1a3a6a', border: 'none', borderRadius: 4, color: '#fff', cursor: startDateLoading ? 'wait' : 'pointer' }}
              >
                {startDateLoading ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
