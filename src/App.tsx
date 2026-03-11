import React from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Messages from './pages/Messages';
import Cleanup from './pages/Cleanup';
import Sources from './pages/Sources';
import People from './pages/People';
import Attachments from './pages/Attachments';

const navItems = [
  { to: '/messages', icon: '✉️', label: 'Messages' },
  { to: '/cleanup', icon: '🧹', label: 'Cleanup' },
  { to: '/sources', icon: '📡', label: 'Sources' },
  { to: '/people', icon: '👤', label: 'People' },
  { to: '/attachments', icon: '📎', label: 'Attachments' },
];

export default function App() {
  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-logo">🧠 Memory DB</div>
        <div className="sidebar-nav">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/messages" element={<Messages />} />
          <Route path="/cleanup" element={<Cleanup />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/people" element={<People />} />
          <Route path="/attachments" element={<Attachments />} />
          <Route path="*" element={<Navigate to="/messages" replace />} />
        </Routes>
      </main>
    </div>
  );
}
