import React, { useState, useEffect } from 'react';
import { apiFetch, fileUrl } from '../api';

type PreviewType = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'unknown';

function detectPreviewType(mimeType?: string, fileName?: string): PreviewType {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic', 'heif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  return 'unknown';
}

interface AttachmentPreviewModalProps {
  recordId: string;
  mimeType?: string;
  fileName?: string;
  onClose: () => void;
}

export function AttachmentPreviewModal({ recordId, mimeType, fileName, onClose }: AttachmentPreviewModalProps) {
  const [error, setError] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const type = detectPreviewType(mimeType, fileName);
  const url = fileUrl(recordId);

  useEffect(() => {
    apiFetch(`/api/attachments/${recordId}`)
      .then(setDetails)
      .catch(() => {});
  }, [recordId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '95vw', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontSize: 14, color: '#aaa' }}>
            {fileName || recordId} <span style={{ color: '#666' }}>({mimeType || 'unknown'})</span>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>Open ↗</a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#aaa' }}>✕</button>
          </div>
        </div>

        {details?.summary_text && (
          <div style={{ width: '100%', background: '#0f1419', borderLeft: '3px solid #64b5f6', padding: 10, borderRadius: 4, marginBottom: 12 }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: '#888' }}>Summary</p>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>{details.summary_text}</p>
          </div>
        )}

        {error ? (
          <div style={{ padding: 32, color: '#ff6b6b', textAlign: 'center' }}>
            <p>⚠️ Unable to load file</p>
            <a href={url} target="_blank" rel="noopener noreferrer">Try opening in new tab ↗</a>
          </div>
        ) : type === 'image' ? (
          <img src={url} alt={fileName} style={{ maxWidth: '85vw', maxHeight: '75vh', objectFit: 'contain', borderRadius: 4 }} onError={() => setError(true)} />
        ) : type === 'video' ? (
          <video controls src={url} style={{ maxWidth: '85vw', maxHeight: '75vh', borderRadius: 4 }} onError={() => setError(true)} />
        ) : type === 'audio' ? (
          <audio controls src={url} style={{ width: 400, maxWidth: '85vw' }} onError={() => setError(true)} />
        ) : type === 'pdf' ? (
          <iframe src={url} title="PDF" style={{ width: '80vw', height: '75vh', border: 'none', borderRadius: 4, background: '#fff' }} />
        ) : (
          <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>
            <p>No preview available</p>
            <a href={url} target="_blank" rel="noopener noreferrer">Download ↗</a>
          </div>
        )}
      </div>
    </div>
  );
}

interface AttachmentLinkProps {
  recordId: string;
  mimeType?: string;
  fileName?: string;
  children?: React.ReactNode;
}

export function AttachmentLink({ recordId, mimeType, fileName, children }: AttachmentLinkProps) {
  const [show, setShow] = useState(false);
  return (
    <>
      <span onClick={e => { e.stopPropagation(); setShow(true); }}
        style={{ color: '#64b5f6', cursor: 'pointer', textDecoration: 'underline' }}>
        {children || fileName || recordId}
      </span>
      {show && <AttachmentPreviewModal recordId={recordId} mimeType={mimeType} fileName={fileName} onClose={() => setShow(false)} />}
    </>
  );
}
