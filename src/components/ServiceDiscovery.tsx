import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getServiceConfig,
  getSubscriptions,
  saveSubscriptions,
  toggleSubscription,
  discordApi,
  slackApi,
  gmailApi,
  openclawApi,
  chatgptApi,
  getSubscriptionSettings,
  setSubscriptionSettings,
  SubscriptionSettingsResponse,
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
const RENDER_LIMIT = Infinity;

/* ── Inline button styles ────────────────────────────── */

const btnBase: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: 999,
  border: 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  whiteSpace: 'nowrap',
  lineHeight: '20px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const btnSubscribed: React.CSSProperties = {
  ...btnBase,
  background: '#1a3a1a',
  color: '#4ade80',
  border: '1px solid #2d5a2d',
};

const btnNotSubscribed: React.CSSProperties = {
  ...btnBase,
  background: '#2a2a2a',
  color: '#999',
  border: '1px solid #444',
};

const btnLoading: React.CSSProperties = {
  ...btnBase,
  background: '#1e2430',
  color: '#666',
  border: '1px solid #333',
  cursor: 'wait',
};

/* Group-level tri-state button styles */
const grpBtnBase: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 999,
  border: 'none',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  whiteSpace: 'nowrap',
  lineHeight: '18px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const grpBtnAll: React.CSSProperties = {
  ...grpBtnBase,
  background: '#1a3a1a',
  color: '#4ade80',
  border: '1px solid #2d5a2d',
};

const grpBtnSome: React.CSSProperties = {
  ...grpBtnBase,
  background: '#2a2500',
  color: '#f59e0b',
  border: '1px solid #5a4a00',
};

const grpBtnNone: React.CSSProperties = {
  ...grpBtnBase,
  background: '#2a2a2a',
  color: '#999',
  border: '1px solid #444',
};

const grpBtnLoading: React.CSSProperties = {
  ...grpBtnBase,
  background: '#1e2430',
  color: '#666',
  border: '1px solid #333',
  cursor: 'wait',
};

/* ── Component ───────────────────────────────────────── */

export default function ServiceDiscovery({ service, serviceLabel, serviceIcon, serviceKey }: ServiceDiscoveryProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'unconfigured' | 'auth-error'>('idle');
  const [error, setError] = useState('');
  const [channels, setChannels] = useState<DiscoveredChannel[]>([]);
  const [existingSubs, setExistingSubs] = useState<Map<string, Subscription>>(new Map());
  const [filter, setFilter] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  // Track in-flight toggles (channel IDs or group names currently being toggled)
  const [togglingChannels, setTogglingChannels] = useState<Set<string>>(new Set());
  const [togglingGroups, setTogglingGroups] = useState<Set<string>>(new Set());
  // Auto-subscribe state
  const [autoSubscribe, setAutoSubscribe] = useState(false);
  const [autoSubscribeLoading, setAutoSubscribeLoading] = useState(false);

  // Check if service is known to be not configured
  const notConfiguredMsg = NOT_CONFIGURED_SERVICES[service];

  // Fetch existing subscriptions + auto-subscribe setting on mount
  const fetchExistingSubs = useCallback(async () => {
    try {
      const data = await getSubscriptions(service);
      const subs = data.subscriptions || [];
      const map = new Map<string, Subscription>();
      for (const s of subs) {
        map.set(s.channel_id, s as Subscription);
      }
      setExistingSubs(map);
      // Also check auto_subscribe from the response (API enriches it)
      if ('auto_subscribe' in data) {
        setAutoSubscribe(!!(data as Record<string, unknown>).auto_subscribe);
      }
    } catch {
      // Subscriptions may not exist yet, that's fine
    }
    // Fetch auto-subscribe setting separately too (canonical source)
    try {
      const settings = await getSubscriptionSettings(service) as SubscriptionSettingsResponse;
      setAutoSubscribe(settings.auto_subscribe);
    } catch {
      // Settings may not exist yet
    }
  }, [service]);

  useEffect(() => {
    if (!notConfiguredMsg) {
      fetchExistingSubs();
    }
  }, [fetchExistingSubs, notConfiguredMsg]);

  // Handle auto-subscribe toggle
  const handleAutoSubscribeToggle = async () => {
    const newValue = !autoSubscribe;
    setAutoSubscribeLoading(true);
    try {
      await setSubscriptionSettings(service, { auto_subscribe: newValue });
      setAutoSubscribe(newValue);
      if (newValue) {
        setSuccessMsg('Auto-subscribe enabled — all channels are now subscribed including future ones');
      } else {
        setSuccessMsg('Auto-subscribe disabled — manual subscription mode');
      }
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update setting';
      setError(msg);
    } finally {
      setAutoSubscribeLoading(false);
    }
  };

  const handleDiscover = async () => {
    setStatus('loading');
    setError('');
    setChannels([]);

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
      setStatus('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Discovery failed';
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
        channels: chs.sort((a, b) => (a.channel_name ?? '').localeCompare(b.channel_name ?? '')),
      }))
      .sort((a, b) => {
        if (a.name === 'Direct Messages' || a.name === 'Other') return 1;
        if (b.name === 'Direct Messages' || b.name === 'Other') return -1;
        return a.name.localeCompare(b.name);
      });
  }, [filtered]);

  // Count totals
  const totalFiltered = filtered.length;
  // Helper: is a channel effectively subscribed? When auto-subscribe is on,
  // a channel is subscribed unless explicitly unsubscribed (sub.subscribed === false).
  const isEffectivelySubscribed = useCallback((ch: DiscoveredChannel): boolean => {
    const sub = existingSubs.get(ch.channel_id);
    if (autoSubscribe) {
      // Auto-subscribe: subscribed unless explicitly unsubscribed
      return sub ? sub.subscribed !== false : true;
    }
    return sub?.subscribed ?? false;
  }, [existingSubs, autoSubscribe]);

  const totalAlreadySubscribed = useMemo(() => {
    return filtered.filter(ch => isEffectivelySubscribed(ch)).length;
  }, [filtered, isEffectivelySubscribed]);

  /* ── Per-channel inline toggle ─────────────────────── */
  const handleToggleChannel = async (ch: DiscoveredChannel) => {
    const chId = ch.channel_id;
    if (togglingChannels.has(chId)) return;

    setTogglingChannels(prev => new Set(prev).add(chId));
    setError('');

    try {
      const result = await toggleSubscription(service, chId, {
        channel_name: ch.channel_name,
        server_id: ch.server_id || null,
        server_name: ch.server_name || null,
      });
      // Update local state immediately from the response
      const sub = result.subscription as Subscription;
      setExistingSubs(prev => {
        const next = new Map(prev);
        next.set(sub.channel_id, sub);
        return next;
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Toggle failed';
      setError(msg);
    } finally {
      setTogglingChannels(prev => {
        const next = new Set(prev);
        next.delete(chId);
        return next;
      });
    }
  };

  /* ── Per-group bulk toggle ─────────────────────────── */
  const handleToggleGroup = async (group: ChannelGroup) => {
    if (togglingGroups.has(group.name)) return;

    const groupSubCount = group.channels.filter(ch => existingSubs.get(ch.channel_id)?.subscribed).length;
    const allSubscribed = groupSubCount === group.channels.length;
    // If all subscribed → unsubscribe all; otherwise → subscribe all
    const newSubscribed = !allSubscribed;

    setTogglingGroups(prev => new Set(prev).add(group.name));
    setError('');

    try {
      // Build items for the channels in this group
      const groupItems = group.channels.map(ch => ({
        channel_id: ch.channel_id,
        channel_name: ch.channel_name,
        server_id: ch.server_id || null,
        server_name: ch.server_name || null,
        subscribed: newSubscribed,
        metadata: existingSubs.get(ch.channel_id)?.metadata || {},
      }));

      // Also include existing subs NOT in this group to preserve them
      const groupChannelIds = new Set(group.channels.map(ch => ch.channel_id));
      const otherItems = Array.from(existingSubs.values())
        .filter(sub => !groupChannelIds.has(sub.channel_id))
        .map(sub => ({
          channel_id: sub.channel_id,
          channel_name: sub.channel_name,
          server_id: sub.server_id || null,
          server_name: sub.server_name || null,
          subscribed: sub.subscribed,
          metadata: sub.metadata || {},
        }));

      await saveSubscriptions(service, [...groupItems, ...otherItems]);

      const action = newSubscribed ? 'Subscribed to' : 'Unsubscribed from';
      setSuccessMsg(`${action} ${group.channels.length} channel${group.channels.length === 1 ? '' : 's'} in ${group.name}`);
      setTimeout(() => setSuccessMsg(''), 4000);

      // Refresh subscriptions
      await fetchExistingSubs();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Bulk toggle failed';
      setError(msg);
    } finally {
      setTogglingGroups(prev => {
        const next = new Set(prev);
        next.delete(group.name);
        return next;
      });
    }
  };

  const toggleGroupCollapse = (name: string) => {
    setCollapsedGroups(prev => ({ ...prev, [name]: !prev[name] }));
  };

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

      {/* Auto-subscribe toggle */}
      <div style={{
        padding: '14px 18px',
        marginBottom: 12,
        background: autoSubscribe ? '#0d2818' : '#1a1a2e',
        border: `1px solid ${autoSubscribe ? '#1a5c2e' : '#333'}`,
        borderRadius: 8,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            {autoSubscribe ? '✅' : '📋'} Auto-subscribe
          </div>
          <div style={{ fontSize: 13, color: '#999', lineHeight: 1.5 }}>
            {autoSubscribe
              ? 'All channels are subscribed, including new ones discovered in the future. Unsubscribe individual channels below.'
              : 'Subscribe all channels including new ones automatically. Useful for services like ChatGPT, Anthropic, and OpenClaw.'}
          </div>
        </div>
        <button
          onClick={handleAutoSubscribeToggle}
          disabled={autoSubscribeLoading}
          style={{
            padding: '8px 20px',
            borderRadius: 999,
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor: autoSubscribeLoading ? 'wait' : 'pointer',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap',
            background: autoSubscribe ? '#1a5c2e' : '#2a2a3e',
            color: autoSubscribe ? '#4ade80' : '#aaa',
            ...(autoSubscribe ? { border: '1px solid #2d8a4e' } : { border: '1px solid #555' }),
          }}
        >
          {autoSubscribeLoading ? '⟳' : autoSubscribe ? '🟢 ON' : '⚪ OFF'}
        </button>
      </div>

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
            const groupSubCount = group.channels.filter(ch => isEffectivelySubscribed(ch)).length;
            const groupTotal = group.channels.length;
            const allSubscribed = groupTotal > 0 && groupSubCount === groupTotal;
            const someSubscribed = groupSubCount > 0 && !allSubscribed;
            const isGroupToggling = togglingGroups.has(group.name);

            // Limit rendered channels for performance
            const visibleChannels = isCollapsed ? [] : group.channels.slice(0, RENDER_LIMIT);
            const hasMore = group.channels.length > RENDER_LIMIT && !isCollapsed;

            return (
              <div key={group.name} className="card" style={{ marginBottom: 12 }}>
                {/* Group header */}
                <div
                  style={{
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    userSelect: 'none',
                  }}
                >
                  {/* Left side: collapse toggle + group name */}
                  <span
                    onClick={() => toggleGroupCollapse(group.name)}
                    style={{
                      fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8,
                      cursor: 'pointer', flex: 1,
                    }}
                  >
                    {isCollapsed ? '▸' : '▾'} {group.name}
                  </span>

                  {/* Right side: channel count + tri-state subscribe button */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ color: '#888', fontSize: 13 }}>
                      {groupSubCount > 0 && (
                        <span style={{ color: '#4ade80', marginRight: 6 }}>{groupSubCount}/{groupTotal}</span>
                      )}
                      {groupTotal} ch{groupTotal === 1 ? '' : 's'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleGroup(group); }}
                      disabled={isGroupToggling}
                      style={
                        isGroupToggling ? grpBtnLoading
                        : allSubscribed ? grpBtnAll
                        : someSubscribed ? grpBtnSome
                        : grpBtnNone
                      }
                      title={
                        allSubscribed ? 'Unsubscribe all channels in this group'
                        : someSubscribed ? 'Subscribe remaining channels in this group'
                        : 'Subscribe all channels in this group'
                      }
                    >
                      {isGroupToggling ? (
                        '⟳'
                      ) : allSubscribed ? (
                        <>🟢 All</>
                      ) : someSubscribed ? (
                        <>🟡 Partial</>
                      ) : (
                        <>⚪ None</>
                      )}
                    </button>
                  </span>
                </div>

                {/* Channel rows */}
                {!isCollapsed && (
                  <div style={{ borderTop: '1px solid #333' }}>
                    {visibleChannels.map(ch => {
                      const isSubscribed = isEffectivelySubscribed(ch);
                      const isToggling = togglingChannels.has(ch.channel_id);

                      return (
                        <div
                          key={ch.channel_id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '7px 14px',
                            borderBottom: '1px solid #2a2a2a',
                            gap: 8,
                          }}
                        >
                          {/* Channel info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 500, fontSize: 14 }}>{ch.channel_name}</span>
                            <br />
                            <code style={{ fontSize: 11, color: '#666' }}>{ch.channel_id}</code>
                          </div>

                          {/* Inline subscribe button */}
                          <button
                            onClick={() => handleToggleChannel(ch)}
                            disabled={isToggling}
                            style={
                              isToggling ? btnLoading
                              : isSubscribed ? btnSubscribed
                              : btnNotSubscribed
                            }
                          >
                            {isToggling ? '⟳' : isSubscribed ? '✅ Subscribed' : 'Subscribe'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
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
