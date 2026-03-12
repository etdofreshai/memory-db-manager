import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import Messages from './pages/Messages';
import Cleanup from './pages/Cleanup';
import Sources from './pages/Sources';
import People from './pages/People';
import Attachments from './pages/Attachments';
import DiscordDashboard from './pages/discord/Dashboard';
import DiscordChannels from './pages/discord/Channels';
import DiscordBackfill from './pages/discord/Backfill';
import DiscordScheduled from './pages/discord/Scheduled';
import DiscordJobs from './pages/discord/Jobs';
import IngestorPlaceholder from './pages/IngestorPlaceholder';
import DiscordLoginStatus from './components/DiscordLoginStatus';
import SlackLoginStatus from './components/SlackLoginStatus';
import SlackDashboard from './pages/slack/Dashboard';
import SlackChannels from './pages/slack/Channels';
import SlackJobs from './pages/slack/Jobs';
import SlackBackfill from './pages/slack/Backfill';
import ChatGPTLoginStatus from './components/ChatGPTLoginStatus';
import GmailDashboard from './pages/gmail/Dashboard';
import GmailMailboxes from './pages/gmail/Mailboxes';
import GmailEmailList from './pages/gmail/EmailList';
import GmailEmailView from './pages/gmail/EmailView';
import GmailStatus from './pages/gmail/GmailStatus';
import ChatGPTDashboard from './pages/chatgpt/Dashboard';
import ChatGPTLive from './pages/chatgpt/Live';
import ChatGPTConversations from './pages/chatgpt/Conversations';
import ConversationView from './pages/chatgpt/ConversationView';
import ChatGPTJobs from './pages/chatgpt/Jobs';
import { getServiceConfig, checkHealth, ServiceConfig } from './api';

interface SidebarSection {
  key: string;
  icon: string;
  label: string;
  serviceKey?: string; // for health checks
  items: { to: string; icon: string; label: string }[];
}

const sections: SidebarSection[] = [
  {
    key: 'memory-db', icon: '🗄️', label: 'Memory DB', serviceKey: 'memory-api',
    items: [
      { to: '/memory/messages', icon: '✉️', label: 'Messages' },
      { to: '/memory/cleanup', icon: '🧹', label: 'Cleanup' },
      { to: '/memory/sources', icon: '📡', label: 'Sources' },
      { to: '/memory/people', icon: '👤', label: 'People' },
      { to: '/memory/attachments', icon: '📎', label: 'Attachments' },
    ],
  },
  {
    key: 'discord', icon: '🔵', label: 'Discord Ingestor', serviceKey: 'discord-ingestor',
    items: [
      { to: '/discord/dashboard', icon: '📊', label: 'Dashboard' },
      { to: '/discord/jobs', icon: '📋', label: 'Jobs' },
      { to: '/discord/channels', icon: '📺', label: 'Channels' },
      { to: '/discord/backfill', icon: '⏪', label: 'Backfill' },
      { to: '/discord/scheduled', icon: '⏰', label: 'Scheduled' },
    ],
  },
  {
    key: 'gmail', icon: '📧', label: 'Gmail Ingestor', serviceKey: 'gmail-ingestor',
    items: [
      { to: '/gmail/dashboard', icon: '📊', label: 'Dashboard' },
      { to: '/gmail/mailboxes', icon: '📬', label: 'Mailboxes' },
    ],
  },
  {
    key: 'slack', icon: '💬', label: 'Slack Ingestor', serviceKey: 'slack-ingestor',
    items: [
      { to: '/slack/dashboard', icon: '📊', label: 'Dashboard' },
      { to: '/slack/channels', icon: '📺', label: 'Channels' },
      { to: '/slack/jobs', icon: '📋', label: 'Jobs' },
      { to: '/slack/backfill', icon: '⏪', label: 'Backfill' },
    ],
  },
  {
    key: 'anthropic', icon: '🤖', label: 'Anthropic Ingestor', serviceKey: 'anthropic-ingestor',
    items: [{ to: '/anthropic/dashboard', icon: '📊', label: 'Dashboard' }],
  },
  {
    key: 'chatgpt', icon: '🤖', label: 'ChatGPT Ingestor', serviceKey: 'chatgpt-ingestor',
    items: [
      { to: '/chatgpt/dashboard', icon: '📊', label: 'Dashboard' },
      { to: '/chatgpt/live', icon: '🔴', label: 'Live' },
      { to: '/chatgpt/conversations', icon: '💬', label: 'Conversations' },
      { to: '/chatgpt/jobs', icon: '📋', label: 'Jobs' },
    ],
  },
];

function loadCollapsed(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem('sidebar-collapsed') || '{}'); } catch { return {}; }
}

export default function App() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [serviceConfig, setServiceConfig] = useState<ServiceConfig>({});
  const [health, setHealth] = useState<Record<string, boolean>>({});
  const location = useLocation();

  useEffect(() => {
    getServiceConfig().then(setServiceConfig).catch(() => {});
  }, []);

  useEffect(() => {
    // Run health checks for configured services
    for (const section of sections) {
      if (section.serviceKey && serviceConfig[section.serviceKey]?.configured) {
        checkHealth(section.serviceKey).then(ok => {
          setHealth(h => ({ ...h, [section.serviceKey!]: ok }));
        });
      }
    }
  }, [serviceConfig]);

  // Close mobile sidebar on navigation
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const toggle = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('sidebar-collapsed', JSON.stringify(next));
      return next;
    });
  }, []);

  const getStatusDot = (serviceKey?: string) => {
    if (!serviceKey) return null;
    const cfg = serviceConfig[serviceKey];
    if (!cfg?.configured) return <span className="status-dot grey" title="Not configured" />;
    const ok = health[serviceKey];
    if (ok === undefined) return <span className="status-dot grey" title="Checking..." />;
    return <span className={`status-dot ${ok ? 'green' : 'red'}`} title={ok ? 'Connected' : 'Unreachable'} />;
  };

  return (
    <div className="app-layout">
      <button className="hamburger" onClick={() => setMobileOpen(!mobileOpen)}>☰</button>
      <nav className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          🧠 Data Hub
          {import.meta.env.VITE_BUILD_DATE && (
            <div style={{ fontSize: 10, color: '#555', fontWeight: 400, marginTop: 2 }}>
              {import.meta.env.VITE_BUILD_DATE}{import.meta.env.VITE_BUILD_SHA ? ` (${import.meta.env.VITE_BUILD_SHA})` : ''}
            </div>
          )}
        </div>
        <div className="sidebar-nav">
          {sections.map(section => (
            <div key={section.key} className="sidebar-section">
              <button className="section-header" onClick={() => toggle(section.key)}>
                <span className="section-icon">{section.icon}</span>
                <span className="section-label">{section.label}</span>
                {getStatusDot(section.serviceKey)}
                <span className={`chevron ${collapsed[section.key] ? 'collapsed' : ''}`}>▾</span>
              </button>
              {!collapsed[section.key] && (
                <div className="section-items">
                  {section.key === 'discord' && <DiscordLoginStatus />}
                  {section.key === 'slack' && <SlackLoginStatus />}
                  {section.key === 'chatgpt' && <ChatGPTLoginStatus />}
                  {section.key === 'gmail' && <GmailStatus />}
                  {section.items.map(item => (
                    <NavLink key={item.to} to={item.to} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </nav>
      {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}
      <main className="main-content">
        <Routes>
          {/* Memory DB */}
          <Route path="/memory/messages" element={<Messages />} />
          <Route path="/memory/cleanup" element={<Cleanup />} />
          <Route path="/memory/sources" element={<Sources />} />
          <Route path="/memory/people" element={<People />} />
          <Route path="/memory/attachments" element={<Attachments />} />
          {/* Discord Ingestor */}
          <Route path="/discord/dashboard" element={<DiscordDashboard />} />
          <Route path="/discord/jobs" element={<DiscordJobs />} />
          <Route path="/discord/channels" element={<DiscordChannels />} />
          <Route path="/discord/backfill" element={<DiscordBackfill />} />
          <Route path="/discord/scheduled" element={<DiscordScheduled />} />
          {/* Gmail Ingestor */}
          <Route path="/gmail/dashboard" element={<GmailDashboard />} />
          <Route path="/gmail/mailboxes" element={<GmailMailboxes />} />
          <Route path="/gmail/mailbox/:mailbox" element={<GmailEmailList />} />
          <Route path="/gmail/email/:uid" element={<GmailEmailView />} />
          <Route path="/slack/dashboard" element={<SlackDashboard />} />
          <Route path="/slack/channels" element={<SlackChannels />} />
          <Route path="/slack/jobs" element={<SlackJobs />} />
          <Route path="/slack/backfill" element={<SlackBackfill />} />
          <Route path="/anthropic/dashboard" element={<IngestorPlaceholder name="Anthropic Ingestor" icon="🤖" serviceKey="anthropic-ingestor" />} />
          {/* ChatGPT Ingestor */}
          <Route path="/chatgpt/dashboard" element={<ChatGPTDashboard />} />
          <Route path="/chatgpt/live" element={<ChatGPTLive />} />
          <Route path="/chatgpt/conversations" element={<ChatGPTConversations />} />
          <Route path="/chatgpt/conversation/:id" element={<ConversationView />} />
          <Route path="/chatgpt/jobs" element={<ChatGPTJobs />} />
          {/* Default */}
          <Route path="*" element={<Navigate to="/memory/messages" replace />} />
        </Routes>
      </main>
    </div>
  );
}
