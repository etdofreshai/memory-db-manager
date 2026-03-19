import React, { useEffect, useState } from 'react';
import { getServiceConfig, checkHealth } from '../api';

/**
 * Service login-status configuration.
 * Each entry defines how to check login state and provides a sign-in URL
 * for a specific ingestor backend.
 */
interface LoginConfig {
  statusUrl: string;
  loginUrl: string;
  stopUrl?: string;
  /** Extract the authenticated flag + display label from the response JSON */
  parse: (data: any) => { authenticated: boolean; label: string };
  /** Optional: secondary check endpoint if primary says "not logged in" */
  fallback?: {
    url: string;
    parse: (data: any) => { authenticated: boolean; label: string } | null;
  };
}

const LOGIN_CONFIGS: Record<string, LoginConfig> = {
  discord: {
    statusUrl: '/proxy/discord-ingestor/discord-login/status',
    loginUrl: '/proxy/discord-ingestor/discord-login',
    stopUrl: '/proxy/discord-ingestor/discord-login/stop',
    parse: (d) => ({
      authenticated: d.status === 'logged_in' || !!d.hasSavedSession,
      label: d.username || (d.hasSavedSession ? 'Session saved' : d.status === 'logging_in' ? 'Signing in…' : ''),
    }),
  },
  slack: {
    statusUrl: '/proxy/slack-ingestor/api/login/status',
    loginUrl: '/proxy/slack-ingestor/login',
    stopUrl: '/proxy/slack-ingestor/api/login/stop',
    parse: (d) => ({
      authenticated: d.status === 'logged_in' || !!d.hasSavedSession,
      label: d.teamName || d.username || (d.hasSavedSession ? 'Session saved' : d.status === 'logging_in' ? 'Signing in…' : ''),
    }),
    fallback: {
      url: '/proxy/slack-ingestor/api/session/check',
      parse: (d) => d.authenticated ? { authenticated: true, label: d.team || d.user || 'Authenticated' } : null,
    },
  },
  chatgpt: {
    statusUrl: '/proxy/chatgpt-ingestor/api/session/status',
    loginUrl: '/proxy/chatgpt-ingestor/login',
    parse: (d) => ({
      authenticated: !!d.authenticated,
      label: d.email || d.user || '',
    }),
  },
  gmail: {
    statusUrl: '/proxy/gmail-ingestor/api/health',
    loginUrl: '',
    parse: (d) => ({
      authenticated: d.status === 'ok',
      label: d.status === 'ok' ? 'IMAP Connected' : '',
    }),
  },
};

interface ServiceStatusProps {
  serviceKey: string; // e.g. 'discord-ingestor'
  serviceId: string;  // e.g. 'discord'
}

export default function ServiceStatus({ serviceKey, serviceId }: ServiceStatusProps) {
  const [status, setStatus] = useState<'loading' | 'logged_in' | 'not_connected' | 'not_configured'>('loading');
  const [label, setLabel] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const config = await getServiceConfig();
        if (!config[serviceKey]?.configured) {
          if (!cancelled) {
            setStatus('not_configured');
            setLabel('');
          }
          return;
        }

        const loginCfg = LOGIN_CONFIGS[serviceId];
        if (loginCfg) {
          try {
            const res = await fetch(loginCfg.statusUrl, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
              const data = await res.json();
              const parsed = loginCfg.parse(data);

              // If not authenticated and there's a fallback check, try it
              if (!parsed.authenticated && loginCfg.fallback) {
                try {
                  const fbRes = await fetch(loginCfg.fallback.url, { signal: AbortSignal.timeout(5000) });
                  if (fbRes.ok) {
                    const fbData = await fbRes.json();
                    const fbParsed = loginCfg.fallback.parse(fbData);
                    if (fbParsed) {
                      if (!cancelled) {
                        setStatus('logged_in');
                        setLabel(fbParsed.label);
                      }
                      return;
                    }
                  }
                } catch { /* fallback failed, use primary result */ }
              }

              if (!cancelled) {
                setStatus(parsed.authenticated ? 'logged_in' : 'not_connected');
                setLabel(parsed.label);
                if (data.status === 'logging_in') setSigningIn(true);
              }
              return;
            }
          } catch { /* login status failed, fall through to health check */ }
        }

        // Fallback: just check health
        const ok = await checkHealth(serviceKey);
        if (!cancelled) {
          setStatus(ok ? 'logged_in' : 'not_connected');
          setLabel(ok ? 'Connected' : '');
        }
      } catch {
        if (!cancelled) {
          setStatus('not_connected');
          setLabel('');
        }
      }
    };

    check();
    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [serviceKey, serviceId]);

  const loginCfg = LOGIN_CONFIGS[serviceId];

  const handleStop = async () => {
    if (loginCfg?.stopUrl) {
      try {
        await fetch(loginCfg.stopUrl, { method: 'POST' });
        setSigningIn(false);
      } catch { /* ignore */ }
    }
  };

  const dot = status === 'logged_in' ? '🟢' : status === 'not_connected' ? '🔴' : status === 'not_configured' ? '⚪' : '⚫';
  const text = status === 'logged_in'
    ? (label || 'Logged In')
    : status === 'not_connected'
      ? (signingIn ? 'Signing in…' : 'Not Connected')
      : status === 'not_configured'
        ? 'Not Configured'
        : 'Checking…';

  return (
    <div style={{ padding: '4px 12px 6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' }}>
      <span>{dot} {text}</span>
      {loginCfg?.loginUrl && status !== 'not_configured' && (
        <button
          onClick={() => window.open(loginCfg.loginUrl, '_blank')}
          title="Open login"
          style={{ fontSize: 11, padding: '1px 5px', cursor: 'pointer', borderRadius: 3, border: '1px solid #555', background: 'transparent', color: '#aaa' }}
        >
          Sign In ↗
        </button>
      )}
      {signingIn && loginCfg?.stopUrl && (
        <button
          onClick={handleStop}
          title="Stop login attempt"
          style={{ fontSize: 11, padding: '1px 5px', cursor: 'pointer', borderRadius: 3, border: '1px solid #555', background: 'transparent', color: '#f88' }}
        >
          Stop
        </button>
      )}
    </div>
  );
}
