import React, { useEffect, useState } from 'react';
import { discordApi } from '../../api';

interface Job {
  id: string;
  name?: string;
  channelId?: string;
  channelName?: string;
  cron?: string;
  schedule?: string;
  enabled?: boolean;
  lastRun?: string;
  nextRun?: string;
}

export default function DiscordScheduled() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      discordApi<any>('/api/jobs'),
      discordApi<any>('/api/scheduler/status'),
    ]).then(([jobsRes, schedRes]) => {
      if (jobsRes.status === 'fulfilled') {
        setJobs(Array.isArray(jobsRes.value) ? jobsRes.value : jobsRes.value?.jobs || []);
      }
      if (schedRes.status === 'fulfilled') {
        setSchedulerStatus(schedRes.value);
      }
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const triggerJob = async (jobId: string) => {
    try {
      await discordApi(`/api/jobs/${jobId}/run`, { method: 'POST' });
      // Refresh
      const data = await discordApi<any>('/api/jobs');
      setJobs(Array.isArray(data) ? data : data?.jobs || []);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div>
      <h1 className="page-title">⏰ Scheduled Jobs</h1>
      {error && <div className="error-box">{error}</div>}

      {schedulerStatus && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, color: '#888' }}>
            Scheduler: <strong style={{ color: schedulerStatus.running ? '#4caf50' : '#f44336' }}>
              {schedulerStatus.running ? 'Running' : 'Stopped'}
            </strong>
          </p>
        </div>
      )}

      {loading ? <p>Loading...</p> : (
        <div className="card">
          {jobs.length === 0 ? <p style={{ color: '#888' }}>No scheduled jobs found.</p> : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Schedule</th>
                  <th>Channel</th>
                  <th>Last Run</th>
                  <th>Next Run</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id}>
                    <td><strong>{job.name || job.id}</strong></td>
                    <td><code>{job.cron || job.schedule || '—'}</code></td>
                    <td>{job.channelName || job.channelId || '—'}</td>
                    <td>{job.lastRun ? new Date(job.lastRun).toLocaleString() : '—'}</td>
                    <td>{job.nextRun ? new Date(job.nextRun).toLocaleString() : '—'}</td>
                    <td>
                      <button onClick={() => triggerJob(job.id)} style={{ fontSize: 12, padding: '4px 10px' }}>
                        ▶ Run
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
