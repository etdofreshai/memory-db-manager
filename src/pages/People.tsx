import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import DetailModal from '../components/DetailModal';

export default function People() {
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/people')
      .then(d => setPeople(d.people || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? people.filter(p => JSON.stringify(p).toLowerCase().includes(search.toLowerCase()))
    : people;

  return (
    <div>
      <h1 className="page-title">👤 People</h1>
      {error && <div className="error-box">{error}</div>}

      <div className="filters-bar">
        <input placeholder="Search people..." value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 260 }} />
        <span style={{ color: '#888', fontSize: 14 }}>{filtered.length} contacts</span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead><tr>
            <th>ID</th><th>Name</th><th>Aliases</th><th>Relationship</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#888' }}>Loading…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: '#888' }}>No people found.</td></tr>
              : filtered.map(p => (
                <tr key={p.id} onClick={() => setSelected(p)} style={{ cursor: 'pointer' }}>
                  <td>{p.id}</td>
                  <td>{p.name || '—'}</td>
                  <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {Array.isArray(p.aliases) ? p.aliases.join(', ') : (p.aliases || '—')}
                  </td>
                  <td>{p.relationship || '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <DetailModal title={selected.name || `Person #${selected.id}`} data={selected} onClose={() => setSelected(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: 14 }}>
            {Object.entries(selected).map(([k, v]) => (
              <React.Fragment key={k}>
                <strong>{k}:</strong>
                <span style={{ wordBreak: 'break-word' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</span>
              </React.Fragment>
            ))}
          </div>
        </DetailModal>
      )}
    </div>
  );
}
