import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../api';

interface Subscription {
  id: number;
  record_id: string;
  service: string;
  channel_id: string;
  channel_name: string | null;
  server_id: string | null;
  server_name: string | null;
  subscribed: boolean;
  metadata: Record<string, unknown>;
  effective_from: string;
}

interface ServerGroup {
  name: string;
  channels: Subscription[];
}

interface ServiceSubscriptionsProps {
  service: string;
  serviceLabel: string;
  serviceIcon: string;
}

export default function ServiceSubscriptions({ service, serviceLabel, serviceIcon }: ServiceSubscriptionsProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [filter, setFilter] = useState('');
  const [localChanges, setLocalChanges] = useState<Record<string, boolean>>({});

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    setError('');
    setLocalChanges({});
    try {
      const data = await apiFetch<{ subscriptions: Subscription[] }>(`/api/subscriptions/${service}`);
      setSubscriptions(data.subscriptions || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load subscriptions';
      setError(msg);
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const getSubscribed = (sub: Subscription): boolean => {
    if (localChanges[sub.channel_id] !== undefined) return localChanges[sub.channel_id];
    return sub.subscribed;
  };

  const toggleChannel = (channelId: string) => {
    setLocalChanges(prev => {
      const current = prev[channelId] !== undefined
        ? prev[channelId]
        : subscriptions.find(s => s.channel_id === channelId)?.subscribed ?? false;
      return { ...prev, [channelId]: !current };
    });
  };

  const hasChanges = Object.keys(localChanges).length > 0;

  const handleSelectAll = () => {
    const changes: Record<string, boolean> = {};
    const allSubscribed = filtered.every(s => getSubscribed(s));
    for (const sub of filtered) {
      changes[sub.channel_id] = !allSubscribed;
    }
    setLocalChanges(prev => ({ ...prev, ...changes }));
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const items = subscriptions.map(sub => ({
        channel_id: sub.channel_id,
        channel_name: sub.channel_name,
        server_id: sub.server_id,
        server_name: sub.server_name,
        subscribed: getSubscribed(sub),
        metadata: sub.metadata,
      }));
      await apiFetch(`/api/subscriptions/${service}`, {
        method: 'PUT',
        body: JSON.stringify(items),
      });
      setLocalChanges({});
      setSuccessMsg(`Saved ${items.length} subscriptions`);
      setTimeout(() => setSuccessMsg(''), 3000);
      fetchSubscriptions();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!filter) return subscriptions;
    const f = filter.toLowerCase();
    return subscriptions.filter(s =>
      (s.channel_name || '').toLowerCase().includes(f) ||
      (s.server_name || '').toLowerCase().includes(f) ||
      s.channel_id.toLowerCase().includes(f)
    );
  }, [subscriptions, filter]);

  const { ungrouped, serverGroups } = useMemo(() => {
    const noServer: Subscription[] = [];
    const serverMap: Record<string, Subscription[]> = {};
    for (const sub of filtered) {
      if (sub.server_name) {
        (serverMap[sub.server_name] ||= []).push(sub);
      } else {
        noServer.push(sub);
      }
    }
    const groups: ServerGroup[] = Object.entries(serverMap)
      .map(([name, channels]) => ({ name, channels }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ungrouped: noServer, serverGroups: groups };
  }, [filtered]);

  const subscribedCount = filtered.filter(s => getSubscribed(s)).length;

  const renderChannelRow = (sub: Subscription) => {
    const checked = getSubscribed(sub);
    const isChanged = localChanges[sub.channel_id] !== undefined;
    return (
      <tr
        key={sub.channel_id}
        style={{
          borderBottom: '1px solid #333',
          background: isChanged ? '#1e2a3a' : undefined,
          cursor: 'pointer',
        }}
        onClick={() => toggleChannel(sub.channel_id)}
      >
        <td style={{ padding: '8px 12px', textAlign: 'center', width: 40 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleChannel(sub.channel_id)}
            onClick={e => e.stopPropagation()}
            style={{ cursor: 'pointer' }}
          />
        </td>
        <td style={{ padding: '8px 12px' }}>
          <span style={{ fontWeight: 500 }}>
            {checked ? '✅' : '⬜'} {sub.channel_name || sub.channel_id}
          </span>
          {isChanged && (
            <span style={{
              marginLeft: 8,
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 3,
              background: checked ? '#1a3a1a' : '#3a1a1a',
              color: checked ? '#4ade80' : '#ef4444',
            }}>
              {checked ? 'will subscribe' : 'will unsubscribe'}
            </span>
          )}
          <br />
          <code style={{ fontSize: 11, color: '#888' }}>{sub.channel_id}</code>
        </td>
        <td style={{ padding: '8px 12px', color: '#aaa', fontSize: 13 }}>
          {sub.server_name || '—'}
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
          <span style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: checked ? '#4ade80' : '#555',
          }} />
        </td>
      </tr>
    );
  };

  const renderTable = (channels: Subscription[], title?: string) => {
    if (channels.length === 0) return null;
    const sectionSubscribed = channels.filter(s => getSubscribed(s)).length;
    const allChecked = sectionSubscribed === channels.length;
    const someChecked = sectionSubscribed > 0 && !allChecked;

    const toggleSection = () => {
      const changes: Record<string, boolean> = {};
      for (const sub of channels) {
        changes[sub.channel_id] = !allChecked;
      }
      setLocalChanges(prev => ({ ...prev, ...changes }));
    };

    return (
      <div className="card" style={{ marginBottom: 12, padding: 0, overflow: 'auto' }}>
        {title && (
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={allChecked}
                ref={el => { if (el) el.indeterminate = someChecked; }}
                onChange={toggleSection}
                style={{ cursor: 'pointer' }}
              />
              {title}
            </span>
            <span style={{ color: '#888', fontSize: 12 }}>
              {sectionSubscribed}/{channels.length} subscribed
            </span>
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #444', fontSize: 12, color: '#888' }}>
              <th style={{ textAlign: 'center', padding: '6px 12px', width: 40 }}></th>
              <th style={{ textAlign: 'left', padding: '6px 12px' }}>Channel</th>
              <th style={{ textAlign: 'left', padding: '6px 12px' }}>Server / Workspace</th>
              <th style={{ textAlign: 'center', padding: '6px 12px', width: 60 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {channels.map(renderChannelRow)}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <h1 className="page-title">{serviceIcon} {serviceLabel} Subscriptions</h1>

      {error && <div className="error-box">{error}</div>}
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

      {/* Filter + actions bar */}
      <div className="filters-bar">
        <input
          placeholder="Filter channels..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ minWidth: 250 }}
        />
        <span style={{ color: '#888', fontSize: 13 }}>
          {subscribedCount}/{filtered.length} subscribed
        </span>
        <button
          onClick={handleSelectAll}
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
          {filtered.every(s => getSubscribed(s)) ? '☐ Deselect All' : '☑ Select All'}
        </button>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '5px 16px',
              background: '#1a3a1a',
              border: '1px solid #4ade80',
              borderRadius: 6,
              color: '#4ade80',
              cursor: saving ? 'wait' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              marginLeft: 'auto',
            }}
          >
            {saving ? '⟳ Saving…' : `💾 Save Changes (${Object.keys(localChanges).length})`}
          </button>
        )}
        {hasChanges && (
          <button
            onClick={() => setLocalChanges({})}
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
            ↩ Discard
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Loading…</div>
      ) : subscriptions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>No subscriptions for {serviceLabel}</p>
          <p style={{ fontSize: 13 }}>
            Subscriptions are populated when channels are discovered from the service ingestors or added manually.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          No channels match your filter.
        </div>
      ) : (
        <>
          {serverGroups.map(group => renderTable(group.channels, group.name))}
          {ungrouped.length > 0 && renderTable(ungrouped, serverGroups.length > 0 ? 'Other Channels' : undefined)}
        </>
      )}
    </div>
  );
}
