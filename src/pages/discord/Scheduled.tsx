import React, { useEffect, useState, useRef } from 'react';
import { discordApi, apiFetch } from '../../api';

interface Job {
  id: string;
  name?: string;
  channel?: string;
  channelId?: string;
  channelName?: string;
  cron?: string;
  schedule?: string;
  enabled?: boolean;
  lastRun?: string;
  lastRunAt?: string;
  nextRun?: string;
  intervalMinutes?: number;
  sincePreset?: string;
  cadencePreset?: string;
}

interface ChannelInfo {
  channelName: string;
  guildName?: string;
}

const SINCE_OPTIONS = ['1h', '4h', '12h', '1d', '7d', '30d'];
const CADENCE_OPTIONS = ['1h', '4h', '12h', '1d', '7d', '30d'];

function formatSchedule(minutes?: number): string {
  if (!minutes) return '—';
  if (minutes < 60) return `every ${minutes}m`;
  if (minutes < 1440) return `every ${Math.round(minutes / 60)}h`;
  return `every ${Math.round(minutes / 1440)}d`;
}

function relativeTime(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < 60000) return `in ${Math.round(absDiff / 1000)}s`;
    if (absDiff < 3600000) return `in ${Math.round(absDiff / 60000)}m`;
    if (absDiff < 86400000) return `in ${Math.round(absDiff / 3600000)}h`;
    return `in ${Math.round(absDiff / 86400000)}d`;
  }
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
}

function computeNextRun(lastRunAt?: string, intervalMinutes?: number): string {
  if (!lastRunAt || !intervalMinutes) return '—';
  const next = new Date(new Date(lastRunAt).getTime() + intervalMinutes * 60000);
  return relativeTime(next.toISOString());
}

export default function DiscordScheduled() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [channels, setChannels] = useState<Record<string, ChannelInfo>>({});
  const [channelStats, setChannelStats] = useState<Record<string, { lastMessageAt: string; messageCount: number }>>({});
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const refreshJobs = async () => {
    try {
      const data = await discordApi<any>('/api/jobs');
      setJobs(Array.isArray(data) ? data : data?.jobs || []);
    } catch {}
  };

  useEffect(() => {
    Promise.allSettled([
      discordApi<any>('/api/jobs'),
      discordApi<any>('/api/scheduler/status'),
      discordApi<any>('/api/channels'),
      apiFetch<any>('/api/discord/channels/stats'),
    ]).then(([jobsRes, schedRes, chRes, statsRes]) => {
      if (jobsRes.status === 'fulfilled') {
        setJobs(Array.isArray(jobsRes.value) ? jobsRes.value : jobsRes.value?.jobs || []);
      }
      if (schedRes.status === 'fulfilled') {
        setSchedulerStatus(schedRes.value);
      }
      if (chRes.status === 'fulfilled') {
        const d = chRes.value;
        const chMap = d.channels || d;
        if (chMap && typeof chMap === 'object') setChannels(chMap);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value?.channels) {
        setChannelStats(statsRes.value.channels);
      }
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [staleConfirm, setStaleConfirm] = useState<Job[] | null>(null);
  const [disablingStale, setDisablingStale] = useState(false);
  const [staleToast, setStaleToast] = useState('');

  const resolveChannelName = (channelId?: string): React.ReactNode => {
    if (!channelId) return '—';
    const info = channels[channelId];
    if (!info) return <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{channelId}</span>;
    if (!info.guildName) return <span>{info.channelName}</span>;
    return (
      <div>
        <div style={{ color: '#e0e0e0' }}>#{info.channelName}</div>
        <div style={{ fontSize: 11, color: '#888' }}>{info.guildName}</div>
      </div>
    );
  };

  const findStaleJobs = (): Job[] => {
    const threshold = Date.now() - 100 * 86400000;
    return jobs.filter(j => {
      if (j.enabled === false) return false;
      const chId = j.channel || j.channelId;
      const stats = channelStats[chId || ''];
      if (!stats?.lastMessageAt) return true;
      return new Date(stats.lastMessageAt).getTime() < threshold;
    });
  };

  const disableStaleJobs = async (staleJobs: Job[]) => {
    setDisablingStale(true);
    try {
      await Promise.all(staleJobs.map(j =>
        discordApi(`/api/jobs/${j.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        })
      ));
      await refreshJobs();
      setStaleToast(`Disabled ${staleJobs.length} job${staleJobs.length === 1 ? '' : 's'} with no activity in 100+ days`);
      setTimeout(() => setStaleToast(''), 5000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDisablingStale(false);
      setStaleConfirm(null);
    }
  };

  const triggerJob = async (jobId: string, conflictMode?: string) => {
    try {
      await discordApi(`/api/jobs/${jobId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: conflictMode ? JSON.stringify({ conflict_mode: conflictMode }) : undefined,
      });
      setTimeout(refreshJobs, 1500);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const resetLastRun = async (jobId: string) => {
    try {
      await discordApi(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastRunAt: null }),
      });
      setMenuOpen(null);
      await refreshJobs();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleEnabled = async (jobId: string, enabled: boolean) => {
    try {
      await discordApi(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      await refreshJobs();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleAllEnabled = async (enabled: boolean) => {
    try {
      await Promise.all(jobs.map(j =>
        discordApi(`/api/jobs/${j.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        })
      ));
      await refreshJobs();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm('Delete this job?')) return;
    try {
      await discordApi(`/api/jobs/${jobId}`, { method: 'DELETE' });
      await refreshJobs();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openEdit = (job: Job) => {
    setEditJob(job);
    setEditForm({
      name: job.name || '',
      channel: job.channel || job.channelId || '',
      sincePreset: job.sincePreset || '',
      cadencePreset: job.cadencePreset || '',
      intervalMinutes: job.intervalMinutes || 60,
      enabled: job.enabled !== false,
    });
    setEditError('');
    setMenuOpen(null);
  };

  const saveEdit = async () => {
    if (!editJob) return;
    setEditSaving(true);
    setEditError('');
    try {
      await discordApi(`/api/jobs/${editJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          channel: editForm.channel,
          sincePreset: editForm.sincePreset || null,
          cadencePreset: editForm.cadencePreset || null,
          intervalMinutes: editForm.intervalMinutes,
          enabled: editForm.enabled,
        }),
      });
      setEditJob(null);
      await refreshJobs();
    } catch (e: any) {
      setEditError(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  const allEnabled = jobs.length > 0 && jobs.every(j => j.enabled);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 className="page-title" style={{ margin: 0 }}>⏰ Scheduled Jobs</h1>
      </div>
      {error && <div className="error-box">{error}</div>}

      {schedulerStatus && (
        <div className="card" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, color: '#888' }}>
            Scheduler: <strong style={{ color: (schedulerStatus.concurrency > 0 || schedulerStatus.runningIds !== undefined) ? '#4caf50' : '#f44336' }}>
              {(schedulerStatus.concurrency > 0 || schedulerStatus.runningIds !== undefined) ? 'Running' : 'Stopped'}
            </strong>
          </p>
          <button
            onClick={() => {
              const stale = findStaleJobs();
              if (stale.length === 0) { setStaleToast('No stale jobs found (all active within 100 days)'); setTimeout(() => setStaleToast(''), 4000); return; }
              setStaleConfirm(stale);
            }}
            style={{ padding: '5px 12px', background: '#f59e0b22', border: '1px solid #f59e0b', borderRadius: 6, color: '#f59e0b', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
          >
            ⚠️ Disable Stale Jobs
          </button>
        </div>
      )}

      {loading ? <p>Loading...</p> : (
        <div className="card">
          {jobs.length === 0 ? <p style={{ color: '#888' }}>No scheduled jobs found.</p> : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allEnabled}
                      onChange={(e) => toggleAllEnabled(e.target.checked)}
                      title="Toggle all"
                    />
                  </th>
                  <th>Channel</th>
                  <th>Schedule</th>
                  <th>Last Run</th>
                  <th>Last Message</th>
                  <th>Next Run</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => {
                  const channelId = job.channel || job.channelId;
                  return (
                    <tr key={job.id} style={{ opacity: job.enabled === false ? 0.5 : 1 }}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={job.enabled !== false}
                          onChange={(e) => toggleEnabled(job.id, e.target.checked)}
                        />
                      </td>
                      <td>
                        {(() => {
                          const info = channels[channelId || ''];
                          return (
                            <div>
                              <div style={{ fontWeight: 600 }}>{info?.channelName || channelId || '—'}</div>
                              {info?.guildName && <div style={{ fontSize: 11, color: '#666' }}>{info.guildName}</div>}
                            </div>
                          );
                        })()}
                      </td>
                      <td><code>{job.cadencePreset || formatSchedule(job.intervalMinutes)}</code></td>
                      <td title={job.lastRunAt || job.lastRun || ''}>{relativeTime(job.lastRunAt || job.lastRun)}</td>
                      <td title={channelStats[channelId || '']?.lastMessageAt || ''}>{relativeTime(channelStats[channelId || '']?.lastMessageAt)}</td>
                      <td>{computeNextRun(job.lastRunAt || job.lastRun, job.intervalMinutes)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', position: 'relative' }}>
                          <button onClick={() => triggerJob(job.id)} style={{ fontSize: 12, padding: '4px 10px' }}>
                            ▶ Run
                          </button>
                          <div style={{ position: 'relative' }} ref={menuOpen === job.id ? menuRef : undefined}>
                            <button
                              onClick={() => setMenuOpen(menuOpen === job.id ? null : job.id)}
                              style={{ fontSize: 14, padding: '4px 8px', cursor: 'pointer', background: 'none', border: '1px solid #555', borderRadius: 4, color: '#ccc' }}
                            >
                              ⋯
                            </button>
                            {menuOpen === job.id && (
                              <div style={{
                                position: 'absolute', right: 0, top: '100%', marginTop: 4,
                                background: '#2f3136', border: '1px solid #555', borderRadius: 6,
                                zIndex: 50, minWidth: 160, boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                              }}>
                                <button
                                  onClick={() => { setMenuOpen(null); triggerJob(job.id, 'skip_or_overwrite'); }}
                                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', fontSize: 13 }}
                                  onMouseOver={e => (e.currentTarget.style.background = '#3d4046')}
                                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                                  title="Run and overwrite existing messages with updated content"
                                >
                                  ▶ Run (overwrite)
                                </button>
                                <button
                                  onClick={() => resetLastRun(job.id)}
                                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', fontSize: 13 }}
                                  onMouseOver={e => (e.currentTarget.style.background = '#3d4046')}
                                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                                >
                                  🔄 Reset Last Run
                                </button>
                                <button
                                  onClick={() => openEdit(job)}
                                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', fontSize: 13 }}
                                  onMouseOver={e => (e.currentTarget.style.background = '#3d4046')}
                                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  onClick={() => { setMenuOpen(null); deleteJob(job.id); }}
                                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}
                                  onMouseOver={e => (e.currentTarget.style.background = '#3d4046')}
                                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editJob && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setEditJob(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div style={{
            background: '#2f3136', border: '1px solid #555', borderRadius: 12,
            padding: 24, width: '100%', maxWidth: 480,
          }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#fff' }}>✏️ Edit Job</h2>

            {editError && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{editError}</div>}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#aaa', marginBottom: 4 }}>Name</label>
              <input
                type="text" value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                style={{ width: '100%', padding: '6px 10px', background: '#40444b', border: '1px solid #555', borderRadius: 6, color: '#e0e0e0' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#aaa', marginBottom: 4 }}>Channel ID</label>
              <input
                type="text" value={editForm.channel}
                onChange={e => setEditForm({ ...editForm, channel: e.target.value })}
                style={{ width: '100%', padding: '6px 10px', background: '#40444b', border: '1px solid #555', borderRadius: 6, color: '#e0e0e0' }}
              />
              {channels[editForm.channel] && (
                <div style={{ fontSize: 11, color: '#7289da', marginTop: 2 }}>
                  #{channels[editForm.channel].channelName}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#aaa', marginBottom: 4 }}>Since Preset</label>
                <select
                  value={editForm.sincePreset}
                  onChange={e => setEditForm({ ...editForm, sincePreset: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', background: '#40444b', border: '1px solid #555', borderRadius: 6, color: '#e0e0e0' }}
                >
                  <option value="">— None —</option>
                  {SINCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#aaa', marginBottom: 4 }}>Cadence Preset</label>
                <select
                  value={editForm.cadencePreset}
                  onChange={e => setEditForm({ ...editForm, cadencePreset: e.target.value })}
                  style={{ width: '100%', padding: '6px 10px', background: '#40444b', border: '1px solid #555', borderRadius: 6, color: '#e0e0e0' }}
                >
                  <option value="">— None —</option>
                  {CADENCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#aaa', marginBottom: 4 }}>Interval Minutes</label>
              <input
                type="number" value={editForm.intervalMinutes}
                onChange={e => setEditForm({ ...editForm, intervalMinutes: parseInt(e.target.value) || 60 })}
                style={{ width: 120, padding: '6px 10px', background: '#40444b', border: '1px solid #555', borderRadius: 6, color: '#e0e0e0' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#ccc' }}>
                <input
                  type="checkbox" checked={editForm.enabled}
                  onChange={e => setEditForm({ ...editForm, enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditJob(null)}
                style={{ padding: '8px 16px', background: '#4f545c', border: 'none', borderRadius: 6, color: '#ccc', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                style={{ padding: '8px 16px', background: '#7289da', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer' }}
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Stale Jobs Confirmation Modal */}
      {staleConfirm && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setStaleConfirm(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div style={{
            background: '#2f3136', border: '1px solid #f59e0b', borderRadius: 12,
            padding: 24, width: '100%', maxWidth: 480,
          }}>
            <h2 style={{ margin: '0 0 12px', fontSize: '1.1rem', color: '#f59e0b' }}>⚠️ Disable Stale Jobs</h2>
            <p style={{ color: '#ccc', fontSize: 14, margin: '0 0 12px' }}>
              {staleConfirm.length} job{staleConfirm.length === 1 ? '' : 's'} with no channel activity in 100+ days:
            </p>
            <ul style={{ maxHeight: 200, overflowY: 'auto', paddingLeft: 20, color: '#aaa', fontSize: 13, margin: '0 0 16px' }}>
              {staleConfirm.map(j => <li key={j.id}>{j.name || j.id}</li>)}
            </ul>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setStaleConfirm(null)} style={{ padding: '8px 16px', background: '#4f545c', border: 'none', borderRadius: 6, color: '#ccc', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => disableStaleJobs(staleConfirm)} disabled={disablingStale} style={{ padding: '8px 16px', background: '#f59e0b', border: 'none', borderRadius: 6, color: '#000', cursor: 'pointer', fontWeight: 600 }}>
                {disablingStale ? 'Disabling…' : `Disable ${staleConfirm.length} Jobs`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {staleToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#323529', border: '1px solid #f59e0b', borderRadius: 8,
          padding: '10px 20px', color: '#f59e0b', fontSize: 14, zIndex: 200,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {staleToast}
        </div>
      )}
    </div>
  );
}
