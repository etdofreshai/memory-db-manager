import React from 'react';

interface Props {
  page: number;
  totalPages: number;
  setPage: (p: number | ((p: number) => number)) => void;
}

export default function Pager({ page, totalPages, setPage }: Props) {
  return (
    <div className="pager">
      <button onClick={() => setPage(1)} disabled={page <= 1}>⏮</button>
      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>◀ Prev</button>
      <span>Page {page} / {Math.max(1, totalPages)}</span>
      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next ▶</button>
      <button onClick={() => setPage(totalPages)} disabled={page >= totalPages}>⏭</button>
    </div>
  );
}
