import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getServiceConfig,
  getSubscriptions,
  saveSubscriptions,
  discordApi,
  slackApi,
  gmailApi,
  openclawApi,
  chatgptApi,
} from '../api';

/* ── Types ────────────────────────────────────────────── */

interface ServiceDiscoveryProps {
  service: string;
  serviceLabel: string;
  serviceIcon: string;
  serviceKey: string;
}

interface DiscoveredChannel {
  channel_id: string;
  channel_name: string;
  server_id?: string;
  server_name?: string;
  group?: string; // for UI grouping
}

interface Subscription {
  channel_id: string;
  channel_name: string | null;
  server_id?: string | null;
  server_name?: string | null;
  subscribed: boolean;
  metadata?: Record<string, unknown>;
}

interface ChannelGroup {
  name: string;
  channels: DiscoveredChannel[];
}

/* ── Not-configured services ─────────────────────────── */

const NOT_CONFIGURED_SERVICES: Record<string, string> = {
  anthropic: 'The Anthropic ingestor is not configured. Configure the ANTHROPIC_API_KEY and related environment variables to enable conversation discovery.',
  imessage: 'The iMessage ingestor is not available. iMessage ingestion requires a macOS device with Messages.app access and the iMessage ingestor running locally.',
};

/* ── Fetch helpers per service ───────────────────────── */

async function discoverDiscord(): Promise<DiscoveredChannel[]> {
  const data = await discordApi<Record<string, { channelName: string; guildId: string | null; guildName: string | null }>>('/api/channels');
  return Object.entries(data).map(([id, info]) => ({
    channel_id: id,
    channel_name: info.channelName || id,
    server_id: info.guildId || undefined,
    server_name: info.guildName || undefined,
    group: info.guildName || 'Direct Messages',
  }));
}

async function discoverSlack(): Promise<DiscoveredChannel[]> {
  const data = await slackApi<any>('/api/channels');
  const channels: Array<{ id: string; name: string; [k: string]: unknown }> =
    Array.isArray(data) ? data : (data?.channels || []);
  return channels.map(ch => ({
    channel_id: ch.id,
    channel_name: ch.name || ch.id,
    group: 'Slack Channels',
  }));
}

async function discoverGmail(): Promise<DiscoveredChannel[]> {
  const data = await gmailApi<any>('/api/mailboxes');
  const mailboxes: Array<string | { name?: string; id?: string; path?: string }> =
    Array.isArray(data) ? data : (data?.mailboxes || []);
  return mailboxes.map(mb => {
    const name = typeof mb === 'string' ? mb : (mb.name || mb.path || mb.id || 'Unknown');
    const id = typeof mb === 'string' ? mb : (mb.id || mb.path || mb.name || 'unknown');
    return {
      channel_id: String(id),
      channel_name: String(name),
      group: 'Mailboxes',
    };
  });
}

async function discoverOpenClaw(): Promise<DiscoveredChannel[]> {
  const data = await openclawApi<any>('/api/sessions');
  const sessions: Array<{ sessionKey: string; label?: string; kind?: string; [k: string]: unknown }> =
    Array.isArray(data) ? data : (data?.sessions || []);
  return sessions.map(s => ({
    channel_id: s.sessionKey,
    channel_name: s.label || s.sessionKey,
    group: s.kind || 'other',
  }));
}

async function discoverChatGPT(): Promise<DiscoveredChannel[]> {
  const data = await chatgptApi<any>('/api/conversations');
  const conversations: Array<{ id: string; title?: string; [k: string]: unknown }> =
    Array.isArray(data) ? data : (data?.conversations || []);
  return conversations.map(c => ({
    channel_id: c.id,
    channel_name: c.title || c.id,
    group: 'Conversations',
  }));
}

const DISCOVER_FN: Record<string, () => Promise<DiscoveredChannel[]>> = {
  discord: discoverDiscord,
  slack: discoverSlack,
  gmail: discoverGmail,
  openclaw: discoverOpenClaw,
  chatgpt: discoverChatGPT,
};

/* ── Visible channel limit for large lists ───────────── */
const RENDER_LIMIT = 200;

/* ── Component ───────────────────────────────────────── */

export default function ServiceDiscovery({ service, serviceLabel, serviceIcon, serviceKey }: ServiceDiscoveryProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'unconfigured' | 'auth-error'>('idle');
  const [error, setError] = useState('');
  const [channels, setChannels] = useState<DiscoveredChannel[]>([]);
  const [existingSubs, setExistingSubs] = useState<Map<string, Subscription>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Check if service is known to be not configured
  const notConfiguredMsg = NOT_CONFIGURED_SERVICES[service];

  // Fetch existing subscriptions on mount
  const fetchExistingSubs = useCallback(async () => {
    try {
      const data = await getSubscriptions(service);
      const subs = data.subscriptions || [];
      const map = new Map<string, Subscription>();
      for (const s of subs) {
        map.set(s.channel_id, s as Subscription);
      }
      setExistingSubs(map);
    } catch {
      // Subscriptions may not exist yet, that's fine
    }
  }, [service]);

  useEffect(() => {
    if (!notConfiguredMsg) {
      fetchExistingSubs();
    }
  }, [fetchExistingSubs, notConfiguredMsg]);

  const handleDiscover = async () => {
    setStatus('loading');
    setError('');
    setChannels([]);
    setSelectedIds(new Set());

    // Check not-configured first
    if (notConfiguredMsg) {
      setStatus('unconfigured');
      return;
    }

    // Check service config
    try {
      if (serviceKey) {
        const config = await getServiceConfig();
        if (!config[serviceKey]?.configured) {
          setStatus('unconfigured');
          return;
        }
      } else if (!DISCOVER_FN[service]) {
        // No serviceKey and no discover function → not configured
        setStatus('unconfigured');
        return;
      }
    } catch {
      // Config check failed, try anyway
    }

    const discoverFn = DISCOVER_FN[service];
    if (!discoverFn) {
      setStatus('unconfigured');
      return;
    }

    try {
      const discovered = await discoverFn();
      setChannels(discovered);
      // Pre-select channels that are not yet subscribed
      // (don't auto-select anything — let user choose)
      setStatus('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Discovery failed';
      // Detect auth errors (401/403)
      if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('forbidden')) {
        setStatus('auth-error');
        setError(msg);
      } else {
        setStatus('error');
        setError(msg);
      }
    }
  };

  // Filter channels
  const filtered = useMemo(() => {
    if (!filter) return channels;
    const f = filter.toLowerCase();
    return channels.filter(ch =>
      ch.channel_name.toLowerCase().includes(f) ||
      ch.channel_id.toLowerCase().includes(f) ||
      (ch.server_name || '').toLowerCase().includes(f) ||
      (ch.group || '').toLowerCase().includes(f)
    );
  }, [channels, filter]);

  // Group channels
  const groups = useMemo((): ChannelGroup[] => {
    const groupMap: Record<string, DiscoveredChannel[]> = {};
    for (const ch of filtered) {
      const key = ch.group || 'Other';
      (groupMap[key] ||= []).push(ch);
    }
    return Object.entries(groupMap)
      .map(([name, chs]) => ({
        name,
        channels: chs.sort((a, b) => a.channel_name.localeCompare(b.channel_name)),
      }))
      .sort((a, b) => {
        // Put "Direct Messages" / "Other" at the end
        if (a.name === 'Direct Messages' || a.name === 'Other') return 1;
        if (b.name === 'Direct Messages' || b.name === 'Other') return -1;
        return a.name.localeCompare(b.name);
      });
  }, [filtered]);

  // Count totals
  const totalFiltered = filtered.length;
  const totalSelected = selectedIds.size;
  const totalAlreadySubscribed = useMemo(() => {
    return filtered.filter(ch => {
      const sub = existingSubs.get(ch.channel_id);
      return sub?.subscribed;
    }).length;
  }, [filtered, existingSubs]);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllInGroup = (group: ChannelGroup) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = group.channels.every(ch => next.has(ch.channel_id));
      if (allSelected) {
        group.channels.forEach(ch => next.delete(ch.channel_id));
      } else {
        group.channels.forEach(ch => next.add(ch.channel_id));
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(prev => {
      const allSelected = filtered.every(ch => prev.has(ch.channel_id));
      if (allSelected) {
        return new Set();
      }
      return new Set(filtered.map(ch => ch.channel_id));
    });
  };

  const deselectAll = () => setSelectedIds(new Set());

  // Select only unsubscribed channels
  const selectNewOnly = () => {
    const newIds = filtered
      .filter(ch => {
        const sub = existingSubs.get(ch.channel_id);
        return !sub?.subscribed;
      })
      .map(ch => ch.channel_id);
    setSelectedIds(new Set(newIds));
  };

  // Subscribe selected channels
  const handleSubscribe = async () => {
    if (selectedIds.size === 0) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      // Build subscription items from selected channels
      const items = channels
        .filter(ch => selectedIds.has(ch.channel_id))
        .map(ch => ({
          channel_id: ch.channel_id,
          channel_name: ch.channel_name,
          server_id: ch.server_id || null,
          server_name: ch.server_name || null,
          subscribed: true,
          metadata: {},
        }));

      // Also include existing subscriptions that aren't being changed
      const existingItems = Array.from(existingSubs.values())
        .filter(sub => !selectedIds.has(sub.channel_id))
        .map(sub => ({
          channel_id: sub.channel_id,
          channel_name: sub.channel_name,
          server_id: sub.server_id || null,
          server_name: sub.server_name || null,
          subscribed: sub.subscribed,
          metadata: sub.metadata || {},
        }));

      await saveSubscriptions(service, [...items, ...existingItems]);
      setSuccessMsg(`Subscribed to ${items.length} channel${items.length === 1 ? '' : 's'}`);
      setTimeout(() => setSuccessMsg(''), 5000);
      setSelectedIds(new Set());
      // Refresh subscriptions
      await fetchExistingSubs();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save subscriptions';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Unsubscribe selected channels
  const handleUnsubscribe = async () => {
    if (selectedIds.size === 0) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const items = Array.from(existingSubs.values()).map(sub => ({
        channel_id: sub.channel_id,
        channel_name: sub.channel_name,
        server_id: sub.server_id || null,
        server_name: sub.server_name || null,
        subscribed: selectedIds.has(sub.channel_id) ? false : sub.subscribed,
        metadata: sub.metadata || {},
      }));

      await saveSubscriptions(service, items);
      const count = Array.from(selectedIds).filter(id => existingSubs.get(id)?.subscribed).length;
      setSuccessMsg(`Unsubscribed from ${count} channel${count === 1 ? '' : 's'}`);
      setTimeout(() => setSuccessMsg(''), 5000);
      setSelectedIds(new Set());
      await fetchExistingSubs();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save subscriptions';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleGroupCollapse = (name: string) => {
    setCollapsedGroups(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // How many selected are currently subscribed vs not
  const selectedSubCount = useMemo(() => {
    let subscribed = 0;
    let unsubscribed = 0;
    for (const id of selectedIds) {
      const sub = existingSubs.get(id);
      if (sub?.subscribed) subscribed++;
      else unsubscribed++;
    }
    return { subscribed, unsubscribed };
  }, [selectedIds, existingSubs]);

  /* ── Render: Not-configured state ──────────────────── */
  if (notConfiguredMsg) {
    return (
      <div>
        <h1 className="page-title">{serviceIcon} {serviceLabel} Discovery</h1>
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Service Not Configured</h2>
          <p style={{ color: '#888', maxWidth: 500, margin: '0 auto', lineHeight: 1.6, fontSize: 14 }}>
            {notConfiguredMsg}
          </p>
        </div>
      </div>
    );
  }

  /* ── Render: Main ──────────────────────────────────── */
  return (
    <div>
      <h1 className="page-title">{serviceIcon} {serviceLabel} Discovery</h1>

      {/* Error display */}
      {error && status !== 'auth-error' && (
        <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>
      )}

      {/* Success message */}
      {successMsg && (
        <div style={{
          padding: '10px 16px',
          marginBottom: 12,
          background: '#1a3a1a',
          border: '1px solid #4ade80',
          borderRadius: 6,
          color: '#4ade80',
          fontSize: 13,
        }}>
          ✅ {successMsg}
        </div>
      )}

      {/* Idle / unconfigured / auth-error states */}
      {(status === 'idle' || status === 'unconfigured' || status === 'auth-error') && (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {status === 'unconfigured' ? '⚠️' : status === 'auth-error' ? '🔒' : '🔍'}
          </div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>
            {status === 'unconfigured'
              ? 'Service Not Configured'
              : status === 'auth-error'
              ? 'Authentication Required'
              : 'Channel Discovery'}
          </h2>

          {status === 'unconfigured' && (
            <div style={{
              padding: '12px 20px',
              background: '#2a2000',
              border: '1px solid #665500',
              borderRadius: 8,
              color: '#ffcc00',
              marginBottom: 16,
              fontSize: 13,
              maxWidth: 500,
              margin: '0 auto 16px',
            }}>
              ⚠️ {serviceLabel} ingestor is not configured. Set the environment variables to enable discovery.
            </div>
          )}

          {status === 'auth-error' && (
            <div style={{
              padding: '12px 20px',
              background: '#2a1a1a',
              border: '1px solid #aa3333',
              borderRadius: 8,
              color: '#ff6666',
              marginBottom: 16,
              fontSize: 13,
              maxWidth: 500,
              margin: '0 auto 16px',
              lineHeight: 1.6,
            }}>
              🔒 Authentication failed. Please log in to the {serviceLabel} service first and try again.
              {error && <div style={{ marginTop: 8, fontSize: 12, color: '#cc5555' }}>Error: {error}</div>}
            </div>
          )}

          {status === 'idle' && (
            <p style={{ color: '#888', maxWidth: 500, margin: '0 auto 24px', lineHeight: 1.6 }}>
              Discover available channels, conversations, or mailboxes from the {serviceLabel} service.
              Found items can then be added to your subscriptions for syncing.
            </p>
          )}

          <button
            onClick={handleDiscover}
            disabled={status === 'loading'}
            style={{
              padding: '12px 28px',
              background: '#1a2a3a',
              border: '1px solid #4a9eff',
              borderRadius: 8,
              color: '#4a9eff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {status === 'auth-error' || status === 'unconfigured' ? '🔄 Retry Discovery' : '🔍 Discover Channels'}
          </button>
        </div>
      )}

      {/* Loading state */}
      {status === 'loading' && (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <p style={{ color: '#888' }}>Discovering {serviceLabel} channels…</p>
        </div>
      )}

      {/* Results */}
      {status === 'done' && (
        <>
          {/* Filter + actions bar */}
          <div className="filters-bar">
            <input
              placeholder={`Filter ${serviceLabel} channels…`}
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ minWidth: 250 }}
            />
            <span style={{ color: '#888', fontSize: 13 }}>
              {totalFiltered} found · {totalAlreadySubscribed} subscribed
            </span>
            <button
              onClick={handleDiscover}
              style={{
                padding: '5px 12px',
                background: 'none',
                border: '1px solid #555',
                borderRadius: 6,
                color: '#aaa',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              🔄 Refresh
            </button>
          </div>

          {/* Selection action bar */}
          {totalSelected > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
              padding: '10px 14px', background: '#1e2430', border: '1px solid #3d5a80',
              borderRadius: 8, flexWrap: 'wrap',
            }}>
              <span style={{ color: '#a0c4ff', fontSize: 13, fontWeight: 600 }}>
                {totalSelected} channel{totalSelected === 1 ? '' : 's'} selected
              </span>

              {selectedSubCount.unsubscribed > 0 && (
                <button
                  onClick={handleSubscribe}
                  disabled={saving}
                  style={{
                    padding: '5px 16px', background: '#1a3a1a', border: '1px solid #4ade80',
                    borderRadius: 6, color: '#4ade80', cursor: saving ? 'wait' : 'pointer',
                    fontSize: 13, fontWeight: 600,
                  }}
                >
                  {saving ? '⟳ Saving…' : `✅ Subscribe (${selectedSubCount.unsubscribed})`}
                </button>
              )}

              {selectedSubCount.subscribed > 0 && (
                <button
                  onClick={handleUnsubscribe}
                  disabled={saving}
                  style={{
                    padding: '5px 16px', background: '#3a1a1a', border: '1px solid #ef4444',
                    borderRadius: 6, color: '#ef4444', cursor: saving ? 'wait' : 'pointer',
                    fontSize: 13, fontWeight: 600,
                  }}
                >
                  {saving ? '⟳ Saving…' : `❌ Unsubscribe (${selectedSubCount.subscribed})`}
                </button>
              )}

              <button
                onClick={selectAllFiltered}
                style={{
                  padding: '4px 10px', background: 'none', border: '1px solid #555',
                  borderRadius: 4, color: '#aaa', cursor: 'pointer', fontSize: 12,
                }}
              >
                Select All
              </button>
              <button
                onClick={selectNewOnly}
                style={{
                  padding: '4px 10px', background: 'none', border: '1px solid #555',
                  borderRadius: 4, color: '#aaa', cursor: 'pointer', fontSize: 12,
                }}
              >
                Select Unsubscribed Only
              </button>
              <button
                onClick={deselectAll}
                style={{
                  padding: '4px 10px', background: 'none', border: '1px solid #555',
                  borderRadius: 4, color: '#aaa', cursor: 'pointer', fontSize: 12, marginLeft: 'auto',
                }}
              >
                ✕ Clear
              </button>
            </div>
          )}

          {/* No results */}
          {channels.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: '#888' }}>
              No channels found for {serviceLabel}.
            </div>
          )}

          {/* No filter matches */}
          {channels.length > 0 && filtered.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: '#888' }}>
              No channels match your filter.
            </div>
          )}

          {/* Channel groups */}
          {groups.map(group => {
            const isCollapsed = collapsedGroups[group.name] ?? (groups.length > 3);
            const groupSelectedCount = group.channels.filter(ch => selectedIds.has(ch.channel_id)).length;
            const allGroupSelected = group.channels.length > 0 && groupSelectedCount === group.channels.length;
            const someGroupSelected = groupSelectedCount > 0 && !allGroupSelected;
            const groupSubCount = group.channels.filter(ch => existingSubs.get(ch.channel_id)?.subscribed).length;

            // Limit rendered channels for performance
            const visibleChannels = isCollapsed ? [] : group.channels.slice(0, RENDER_LIMIT);
            const hasMore = group.channels.length > RENDER_LIMIT && !isCollapsed;

            return (
              <div key={group.name} className="card" style={{ marginBottom: 12 }}>
                <div
                  onClick={() => toggleGroupCollapse(group.name)}
                  style={{
                    cursor: 'pointer', padding: '10px 14px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={allGroupSelected}
                      ref={el => { if (el) el.indeterminate = someGroupSelected; }}
                      onChange={() => {}}
                      onClick={e => { e.stopPropagation(); selectAllInGroup(group); }}
                      style={{ cursor: 'pointer' }}
                      title={allGroupSelected ? 'Deselect all' : 'Select all'}
                    />
                    {isCollapsed ? '▸' : '▾'} {group.name}
                  </span>
                  <span style={{ color: '#888', fontSize: 13 }}>
                    {groupSelectedCount > 0 && (
                      <span style={{ color: '#4a9eff', marginRight: 8 }}>{groupSelectedCount} selected</span>
                    )}
                    {groupSubCount > 0 && (
                      <span style={{ color: '#4ade80', marginRight: 8 }}>{groupSubCount} subscribed</span>
                    )}
                    {group.channels.length} channel{group.channels.length === 1 ? '' : 's'}
                  </span>
                </div>

                {!isCollapsed && (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #444', fontSize: 12, color: '#888' }}>
                        <th style={{ textAlign: 'center', padding: '4px 8px', width: 40 }}>
                          <input
                            type="checkbox"
                            checked={allGroupSelected}
                            ref={el => { if (el) el.indeterminate = someGroupSelected; }}
                            onChange={() => selectAllInGroup(group)}
                            style={{ cursor: 'pointer' }}
                          />
                        </th>
                        <th style={{ textAlign: 'left', padding: '4px 8px' }}>Channel</th>
                        <th style={{ textAlign: 'center', padding: '4px 8px', width: 100 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleChannels.map(ch => {
                        const isSelected = selectedIds.has(ch.channel_id);
                        const sub = existingSubs.get(ch.channel_id);
                        const isSubscribed = sub?.subscribed ?? false;

                        return (
                          <tr
                            key={ch.channel_id}
                            style={{
                              borderBottom: '1px solid #333',
                              background: isSelected ? '#1e2a3a' : undefined,
                              cursor: 'pointer',
                            }}
                            onClick={() => toggleSelect(ch.channel_id)}
                          >
                            <td style={{ padding: '6px 8px', textAlign: 'center', width: 40 }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(ch.channel_id)}
                                onClick={e => e.stopPropagation()}
                                style={{ cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{ fontWeight: 500 }}>{ch.channel_name}</span>
                              <br />
                              <code style={{ fontSize: 11, color: '#888' }}>{ch.channel_id}</code>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              {isSubscribed ? (
                                <span style={{
                                  background: '#1a3a1a', color: '#4ade80',
                                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                                }}>
                                  ✓ subscribed
                                </span>
                              ) : (
                                <span style={{
                                  color: '#666', fontSize: 11,
                                }}>
                                  not subscribed
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {hasMore && (
                  <div style={{ padding: '8px 14px', color: '#888', fontSize: 12, borderTop: '1px solid #333' }}>
                    Showing {RENDER_LIMIT} of {group.channels.length} channels. Use the filter to narrow results.
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
