import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import Pager from '../components/Pager';
import DetailModal from '../components/DetailModal';
import { AttachmentLink } from '../components/AttachmentPreview';

const PAGE_SIZE = 50;

export default function Attachments() {
  const [rows, setRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [fileType, setFileType] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [linkedMsgs, setLinkedMsgs] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort: 'imported_at', order: 'desc' });
    if (q) params.set('q', q);
    if (mimeType) params.set('mime_type', mimeType);
    if (fileType) params.set('file_type', fileType);

    apiFetch(`/api/attachments?${params}`)
      .then(d => { setRows(d.attachments || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 1); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, q, mimeType, fileType]);

  function openDetail(a: any) {
    setSelected(a);
    apiFetch(`/api/attachments/${a.record_id}`)
      .then(d => setLinkedMsgs(d.linked_messages || []))
      .catch(() => setLinkedMsgs([]));
  }

  return (
    <div>
      <h1 className="page-title">📎 Attachments</h1>

      <div className="filters-bar">
        <input placeholder="Search filename/summary/OCR" value={searchInput} onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setQ(searchInput.trim()); setPage(1); } }} style={{ minWidth: 220 }} />
        <button onClick={() => { setQ(searchInput.trim()); setPage(1); }}>Search</button>
        {q && <button onClick={() => { setSearchInput(''); setQ(''); setPage(1); }}>Clear</button>}
        <input placeholder="MIME type" value={mimeType} onChange={e => setMimeType(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') setPage(1); }} style={{ width: 140 }} />
        <input placeholder="File type" value={fileType} onChange={e => setFileType(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') setPage(1); }} style={{ width: 120 }} />
      </div>

      {error && <div className="error-box">{error}</div>}
      <p style={{ color: '#888', margin: '4px 0 8px', fontSize: 14 }}>Total: {total.toLocaleString()}</p>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>
            {['ID', 'Filename', 'MIME', 'Type', 'Size', 'Summary', 'Imported'].map(h => <th key={h}>{h}</th>)}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#888' }}>Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#888' }}>No attachments.</td></tr>
              : rows.map(a => (
                <tr key={a.id} onClick={() => openDetail(a)} style={{ cursor: 'pointer' }}>
                  <td>{a.id}</td>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <AttachmentLink recordId={a.record_id} mimeType={a.mime_type} fileName={a.original_file_name}>
                      {a.original_file_name || '📎'}
                    </AttachmentLink>
                  </td>
                  <td>{a.mime_type || '—'}</td>
                  <td>{a.file_type || '—'}</td>
                  <td>{a.size_bytes ? `${(a.size_bytes / 1024).toFixed(1)} KB` : '—'}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: a.summary_text ? '#aaa' : '#555' }}>
                    {a.summary_text?.slice(0, 80) || '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{a.imported_at ? new Date(a.imported_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} totalPages={totalPages} setPage={setPage} />

      {selected && (
        <DetailModal title={`Attachment #${selected.id}`} data={selected} onClose={() => { setSelected(null); setLinkedMsgs([]); }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: 14, marginBottom: 12 }}>
            <strong>Record ID:</strong><code style={{ fontSize: 12 }}>{selected.record_id}</code>
            <strong>Filename:</strong><span>{selected.original_file_name || '—'}</span>
            <strong>MIME:</strong><span>{selected.mime_type || '—'}</span>
            <strong>Size:</strong><span>{selected.size_bytes ? `${(selected.size_bytes / 1024).toFixed(1)} KB` : '—'}</span>
            <strong>SHA256:</strong><code style={{ fontSize: 11, wordBreak: 'break-all' }}>{selected.sha256 || '—'}</code>
            <strong>Privacy:</strong><span>{selected.privacy_level || '—'}</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <AttachmentLink recordId={selected.record_id} mimeType={selected.mime_type} fileName={selected.original_file_name}>
              👁️ Preview File
            </AttachmentLink>
          </div>

          {selected.summary_text && (
            <div className="card" style={{ borderLeft: '3px solid #64b5f6', marginBottom: 12 }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64b5f6', fontWeight: 'bold' }}>📝 Summary</p>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{selected.summary_text}</p>
            </div>
          )}

          {selected.labels?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: '0 0 6px', fontSize: 12, color: '#888', fontWeight: 'bold' }}>🏷️ Labels</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selected.labels.map((l: string, i: number) => (
                  <span key={i} style={{ background: '#1e3a5f', color: '#64b5f6', padding: '3px 10px', borderRadius: 4, fontSize: 12, border: '1px solid #64b5f6' }}>{l}</span>
                ))}
              </div>
            </div>
          )}

          {linkedMsgs.length > 0 && (
            <>
              <h3>✉️ Linked Messages ({linkedMsgs.length})</h3>
              <table style={{ fontSize: 13 }}>
                <thead><tr>
                  {['Source', 'Sender', 'Content', 'Timestamp'].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>{linkedMsgs.map((l: any, i: number) => (
                  <tr key={i}>
                    <td>{l.source_name || '—'}</td>
                    <td>{l.sender || '—'}</td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.content?.slice(0, 100) || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{l.timestamp ? new Date(l.timestamp).toLocaleString() : '—'}</td>
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
