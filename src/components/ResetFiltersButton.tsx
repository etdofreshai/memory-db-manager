import React from 'react';

export default function ResetFiltersButton({ onReset, visible = true }: { onReset: () => void; visible?: boolean }) {
  if (!visible) return null;
  return (
    <button
      onClick={onReset}
      title="Reset Filters"
      style={{
        background: '#2a1519',
        border: '1px solid #5a2a2a',
        color: '#e57373',
        padding: '6px 12px',
        borderRadius: 4,
        fontSize: 12,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
      }}
    >
      ↺ Reset
    </button>
  );
}
