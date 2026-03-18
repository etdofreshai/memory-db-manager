import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';

interface Token {
  id: number;
  label: string;
  permissions: string;
  write_sources: string[] | null;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export default function Tokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [newTokenLabel, setNewTokenLabel] = useState<string>('');
  const [form, setForm] = useState({ label: '', permissions: 'read', write_sources: '' });
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch('/api/admin/tokens')
      .then(data => setTokens(data.tokens || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.label.trim()) return;
    setCreating(true);
    setError('');
    try {
      const body: any = { label: form.label, permissions: form.permissions };
      if (form.write_sources.trim()) {
        body.write_sources = form.write_sources.split(',').map(s => s.trim()).filter(Boolean);
      }
      const data = await apiFetch('/api/admin/tokens', { method: 'POST', body: JSON.stringify(body) });
      setNewToken(data.token);
      setNewTokenLabel(form.label);
      setForm({ label: '', permissions: 'read', write_sources: '' });
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (token: Token) => {
    try {
      await apiFetch(`/api/admin/tokens/${token.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !token.is_active }),
      });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/admin/tokens/${id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const permBadgeStyle = (p: string): React.CSSProperties => {
    const colors: Record<string, string> = { admin: '#e74c3c', write: '#e67e22', read: '#27ae60' };
    return {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 600,
      background: colors[p] || '#555',
      color: '#fff',
    };
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString() : '—';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>🔑 Tokens</h1>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setNewToken(null); }}>
          + Create Token
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {newToken && (
        <div className="card" style={{ marginBottom: 16, background: '#1a2e1a', border: '1px solid #2ecc71' }}>
          <div style={{ marginBottom: 8, color: '#2ecc71', fontWeight: 600 }}>
            ✅ Token created: <strong>{newTokenLabel}</strong> — copy it now, it won't be shown again!
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, background: '#0d1f0d', padding: '8px 12px', borderRadius: 6, fontSize: 13, wordBreak: 'break-all', color: '#7fff7f' }}>
              {newToken}
            </code>
            <button className="btn" onClick={() => navigator.clipboard.writeText(newToken)} title="Copy to clipboard">
              📋 Copy
            </button>
          </div>
          <button className="btn" style={{ marginTop: 8, opacity: 0.7 }} onClick={() => setNewToken(null)}>
            Dismiss
          </button>
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Create Token</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400 }}>
            <label>
              <div style={{ marginBottom: 4, fontSize: 13, color: '#aaa' }}>Label</div>
              <input
                className="input"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. my-service-token"
              />
            </label>
            <label>
              <div style={{ marginBottom: 4, fontSize: 13, color: '#aaa' }}>Permissions</div>
              <select className="input" value={form.permissions} onChange={e => setForm(f => ({ ...f, permissions: e.target.value }))}>
                <option value="read">read</option>
                <option value="write">write</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label>
              <div style={{ marginBottom: 4, fontSize: 13, color: '#aaa' }}>Write Sources (comma-separated, optional)</div>
              <input
                className="input"
                value={form.write_sources}
                onChange={e => setForm(f => ({ ...f, write_sources: e.target.value }))}
                placeholder="telegram, discord"
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !form.label.trim()}>
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Label</th>
              <th>Permissions</th>
              <th>Write Sources</th>
              <th>Created</th>
              <th>Last Used</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#888' }}>Loading…</td></tr>
              : tokens.length === 0
                ? <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#888' }}>No tokens.</td></tr>
                : tokens.map(t => (
                  <tr key={t.id} style={{ opacity: t.is_active ? 1 : 0.5 }}>
                    <td>{t.id}</td>
                    <td>{t.label}</td>
                    <td><span style={permBadgeStyle(t.permissions)}>{t.permissions}</span></td>
                    <td style={{ fontSize: 12, color: '#aaa' }}>{t.write_sources?.join(', ') || '—'}</td>
                    <td style={{ fontSize: 12 }}>{fmt(t.created_at)}</td>
                    <td style={{ fontSize: 12 }}>{fmt(t.last_used_at)}</td>
                    <td>
                      <button
                        className="btn"
                        style={{ fontSize: 12, padding: '2px 8px' }}
                        onClick={() => handleToggle(t)}
                        title={t.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {t.is_active ? '✅ Active' : '❌ Inactive'}
                      </button>
                    </td>
                    <td>
                      {confirmDelete === t.id ? (
                        <span style={{ display: 'flex', gap: 4 }}>
                          <button className="btn" style={{ fontSize: 12, padding: '2px 8px', background: '#c0392b', color: '#fff' }} onClick={() => handleDelete(t.id)}>Confirm</button>
                          <button className="btn" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </span>
                      ) : (
                        <button className="btn" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => setConfirmDelete(t.id)}>🗑️ Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
