import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import Pager from '../components/Pager';
import DetailModal from '../components/DetailModal';
import { AttachmentLink } from '../components/AttachmentPreview';

const PAGE_SIZE = 50;

export default function Messages() {
  const [messages, setMessages] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [sender, setSender] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [linkedAtts, setLinkedAtts] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/api/sources').then(d => setSources(d.sources || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort: 'timestamp', order: 'desc' });
    if (q) params.set('q', q);
    if (source) params.set('source', source);
    if (sender) params.set('sender', sender);
    if (dateFrom) params.set('after', dateFrom);
    if (dateTo) params.set('before', dateTo);

    apiFetch(`/api/messages?${params}`)
      .then(d => { setMessages(d.messages || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 1); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, q, source, sender, dateFrom, dateTo]);

  function openDetail(m: any) {
    setSelected(m);
    if (m.record_id) {
      apiFetch(`/api/messages/${m.record_id}/attachments`)
        .then(d => setLinkedAtts(d.attachments || []))
        .catch(() => setLinkedAtts([]));
    }
  }

  return (
    <div>
      <h1 className="page-title">✉️ Messages</h1>

      <div className="filters-bar">
        <input placeholder="Search content/sender/recipient" value={searchInput} onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setQ(searchInput.trim()); setPage(1); } }} style={{ minWidth: 260 }} />
        <button onClick={() => { setQ(searchInput.trim()); setPage(1); }}>Search</button>
        {q && <button onClick={() => { setSearchInput(''); setQ(''); setPage(1); }}>Clear</button>}
        <select value={source} onChange={e => { setSource(e.target.value); setPage(1); }}>
          <option value="">All sources</option>
          {sources.map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <input placeholder="Sender" value={sender} onChange={e => setSender(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') setPage(1); }} style={{ width: 120 }} />
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} title="From" />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} title="To" />
      </div>

      {error && <div className="error-box">{error}</div>}
      <p style={{ color: '#888', margin: '4px 0 8px', fontSize: 14 }}>Total: {total.toLocaleString()}</p>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>
            {['ID', 'Source', 'Sender', 'Recipient', 'Content', 'Timestamp'].map(h =>
              <th key={h}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#888' }}>Loading…</td></tr>
              : messages.length === 0 ? <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#888' }}>No messages found.</td></tr>
              : messages.map(m => (
                <tr key={m.id} onClick={() => openDetail(m)} style={{ cursor: 'pointer' }}>
                  <td>{m.id}</td>
                  <td>{m.source_name || '—'}</td>
                  <td>{m.sender || '—'}</td>
                  <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.recipient || '—'}</td>
                  <td style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.content}>{m.content?.slice(0, 120) || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{m.timestamp ? new Date(m.timestamp).toLocaleString() : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} totalPages={totalPages} setPage={setPage} />

      {selected && (
        <DetailModal title={`Message #${selected.id}`} data={selected} onClose={() => { setSelected(null); setLinkedAtts([]); }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: 14, marginBottom: 12 }}>
            <strong>Record ID:</strong><code style={{ fontSize: 12 }}>{selected.record_id || '—'}</code>
            <strong>Source:</strong><span>{selected.source_name || '—'}</span>
            <strong>Sender:</strong><span>{selected.sender || '—'}</span>
            <strong>Recipient:</strong><span>{selected.recipient || '—'}</span>
            <strong>Timestamp:</strong><span>{selected.timestamp ? new Date(selected.timestamp).toLocaleString() : '—'}</span>
            <strong>External ID:</strong><code style={{ fontSize: 12 }}>{selected.external_id || '—'}</code>
          </div>
          <div className="card" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
            {selected.content || '(empty)'}
          </div>
          {linkedAtts.length > 0 && (
            <>
              <h3>📎 Attachments ({linkedAtts.length})</h3>
              <table style={{ fontSize: 13 }}>
                <thead><tr>
                  {['Filename', 'MIME', 'Size', 'Role'].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>{linkedAtts.map((a: any, i: number) => (
                  <tr key={i}>
                    <td>
                      {a.attachment_record_id
                        ? <AttachmentLink recordId={a.attachment_record_id} mimeType={a.mime_type} fileName={a.original_file_name}>{a.original_file_name || '📎'}</AttachmentLink>
                        : (a.original_file_name || '—')}
                    </td>
                    <td>{a.mime_type || '—'}</td>
                    <td>{a.size_bytes ? `${(a.size_bytes / 1024).toFixed(1)} KB` : '—'}</td>
                    <td>{a.role || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </>
          )}
        </DetailModal>
      )}
    </div>
  );
}
