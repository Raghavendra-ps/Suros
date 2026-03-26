import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { 
  Trash2, Plus, Moon, Sun, Activity, RefreshCw, Pencil, 
  Server, Globe, Database, Cpu, Layers, Terminal, Box, Mail, Shield, HardDrive, Monitor, Link as LinkIcon 
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const IconMap = {
  Server, Globe, Database, Cpu, Layers, Activity, Terminal, Box, Mail, Shield, HardDrive, Monitor, Link: LinkIcon
};

const Icon = ({ name, size = 16, ...props }) => {
  const LucideIcon = IconMap[name] || Globe;
  return <LucideIcon size={size} {...props} />;
};

const ICONS = Object.keys(IconMap);

const App = () => {
  const [sites, setSites] = useState([]);
  const [stats, setStats] = useState({ up: 0, down: 0, avg_latency: 0, overall_uptime: 0 });
  const [systemMetrics, setSystemMetrics] = useState({ cpu: 0, memory: { percent: 0 }, disk: { percent: 0 }, uptime: 0 });
  const [feed, setFeed] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem('odyssey_theme') || 'dark');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [newSite, setNewSite] = useState({ name: '', url: '', icon: 'Globe' });
  const [lastCheckTime, setLastCheckTime] = useState(null);
  const [timeAgo, setTimeAgo] = useState('—');
  const [isLoading, setIsLoading] = useState(true);

  const fetchSites = async () => {
    try {
      const res = await axios.get('/api/sites');
      setSites(res.data);
      setLastCheckTime(new Date());
    } catch (err) {
      console.error('Error fetching sites:', err);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchSystemMetrics = async () => {
    try {
      const res = await axios.get('/api/system-metrics');
      setSystemMetrics(res.data);
    } catch (err) {
      console.error('Error fetching system metrics:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchSites(), fetchStats(), fetchSystemMetrics()]);
      setIsLoading(false);
    };
    init();
    
    const interval = setInterval(() => {
      fetchSites();
      fetchStats();
      fetchSystemMetrics();
    }, 60000);

    const timeAgoInterval = setInterval(() => {
      if (lastCheckTime) {
        const secs = Math.round((new Date() - lastCheckTime) / 1000);
        setTimeAgo(`checked ${secs}s ago`);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(timeAgoInterval);
    };
  }, [lastCheckTime]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('odyssey_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const handleAddSite = async () => {
    if (!newSite.name || !newSite.url) return;
    let url = newSite.url;
    if (!url.startsWith('http')) url = 'https://' + url;
    
    try {
      if (editingSite) {
        await axios.put(`/api/sites/${editingSite.id}`, { ...newSite, url });
        addFeedItem('neutral', `Updated ${newSite.name}.`);
      } else {
        await axios.post('/api/sites', { ...newSite, url });
        addFeedItem('neutral', `Added ${newSite.name} to monitoring.`);
      }
      setIsModalOpen(false);
      setEditingSite(null);
      setNewSite({ name: '', url: '', icon: 'Globe' });
      fetchSites();
    } catch (err) {
      console.error('Error saving site:', err);
    }
  };

  const handleEditSite = (site) => {
    setEditingSite(site);
    setNewSite({ name: site.name, url: site.url, icon: site.icon || 'Globe' });
    setIsModalOpen(true);
  };

  const handleDeleteSite = async (id, name) => {
    try {
      await axios.delete(`/api/sites/${id}`);
      fetchSites();
      addFeedItem('down', `Removed ${name} from monitoring.`);
    } catch (err) {
      console.error('Error deleting site:', err);
    }
  };

  const addFeedItem = (status, msg) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setFeed(prev => [{ status, msg, time }, ...prev].slice(0, 50));
  };

  const chartData = {
    labels: sites.length > 0 ? (sites[0].history || []).map(h => new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : [],
    datasets: [{
      label: 'Avg Latency (ms)',
      data: sites.length > 0 ? (sites[0].history || []).map(h => h.latency) : [],
      borderColor: '#c84b2f',
      backgroundColor: 'rgba(200,75,47,0.07)',
      borderWidth: 1.5,
      pointRadius: 2.5,
      pointBackgroundColor: '#c84b2f',
      tension: 0.4,
      fill: true,
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1816',
        titleColor: '#f2ede4',
        bodyColor: '#8a8278',
        borderColor: '#332e28',
        borderWidth: 1,
        titleFont: { family: 'DM Mono', size: 10 },
        bodyFont: { family: 'DM Mono', size: 10 },
      }
    },
    scales: {
      x: { grid: { color: 'rgba(200,200,200,0.05)' }, ticks: { color: '#55504a', font: { family: 'DM Mono', size: 9 }, maxTicksLimit: 7 } },
      y: { grid: { color: 'rgba(200,200,200,0.05)' }, ticks: { color: '#55504a', font: { family: 'DM Mono', size: 9 } }, beginAtZero: true }
    }
  };

  // Dial Helpers
  const arc = 172.8;
  const getDialStyle = (pct) => ({
    strokeDashoffset: arc - (pct / 100) * arc,
    transition: 'stroke-dashoffset 1s ease'
  });

  if (isLoading) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loader-orbit">
          <div className="loader-dot"></div>
          <div style={{ marginTop: '20px', fontFamily: 'DM Mono', color: 'var(--text3)', fontSize: '0.8rem' }}>Initializing Odyssey...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <div className="logo">
          <div className="logo-circle">
            <img src="/Odyssey.png" alt="Odyssey" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span className="logo-text">Odyssey</span>
        </div>
        <div className="header-right">
          <span className="last-check-label">{timeAgo}</span>
          <button className="btn btn-accent" onClick={() => setIsModalOpen(true)}>
            <Plus size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Add Site
          </button>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>

      <div className="main">
        <div className="hero">
          <div className="hero-eyebrow">✦ Live</div>
          <h1>System Metrics</h1>
        </div>

        <div className="panel" style={{ marginBottom: '2.5rem', padding: '1.25rem' }}>
          <div className="panel-title" style={{ marginBottom: '1rem' }}>Host Server Metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1.25rem' }}>
            <div>
              <div className="stat-label">CPU Usage</div>
              <div className="latency-bar" style={{ height: '8px', margin: '8px 0' }}>
                <div className="latency-fill" style={{ width: `${Math.round(systemMetrics.cpu)}%`, background: systemMetrics.cpu > 80 ? 'var(--down)' : 'var(--up)' }}></div>
              </div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{Math.round(systemMetrics.cpu)}%</div>
            </div>
            <div>
              <div className="stat-label">RAM Usage</div>
              <div className="latency-bar" style={{ height: '8px', margin: '8px 0' }}>
                <div className="latency-fill" style={{ width: `${Math.round(systemMetrics.memory.percent)}%`, background: systemMetrics.memory.percent > 80 ? 'var(--down)' : 'var(--up)' }}></div>
              </div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{Math.round(systemMetrics.memory.percent)}%</div>
            </div>
            <div>
              <div className="stat-label">Disk Usage</div>
              <div className="latency-bar" style={{ height: '8px', margin: '8px 0' }}>
                <div className="latency-fill" style={{ width: `${Math.round(systemMetrics.disk.percent)}%`, background: systemMetrics.disk.percent > 80 ? 'var(--down)' : 'var(--up)' }}></div>
              </div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{Math.round(systemMetrics.disk.percent)}%</div>
            </div>
            <div>
              <div className="stat-label">Network Out</div>
              <div className="latency-bar" style={{ height: '8px', margin: '8px 0' }}>
                <div className="latency-fill" style={{ width: `${Math.min(systemMetrics.net_out || 0, 100)}%`, background: 'var(--accent)' }}></div>
              </div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{Math.round(systemMetrics.net_out || 0)} Mbps</div>
            </div>
            <div>
              <div className="stat-label">GPU Usage</div>
              <div className="latency-bar" style={{ height: '8px', margin: '8px 0' }}>
                <div className="latency-fill" style={{ width: `${Math.round(systemMetrics.gpu?.util || 0)}%`, background: (systemMetrics.gpu?.util || 0) > 80 ? 'var(--down)' : 'var(--up)' }}></div>
              </div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{systemMetrics.gpu ? `${Math.round(systemMetrics.gpu.util)}%` : 'N/A'}</div>
              {systemMetrics.gpu && <div className="stat-sub" style={{ fontSize: '0.6rem' }}>{systemMetrics.gpu.memory.used}/{systemMetrics.gpu.memory.total} GB</div>}
            </div>
          </div>
        </div>

        <div className="summary-row">
          <div className="stat-card up">
            <div className="stat-label">Active Services</div>
            <div className="stat-value">{stats.up}</div>
            <div className="stat-sub">status: success</div>
          </div>
          <div className="stat-card down">
            <div className="stat-label">Offline Services</div>
            <div className="stat-value">{stats.down}</div>
            <div className="stat-sub">action required</div>
          </div>
          <div className="stat-card warn">
            <div className="stat-label">Average Latency</div>
            <div className="stat-value">{Math.round(stats.avg_latency)}ms</div>
            <div className="stat-sub">system performance</div>
          </div>
          <div className="stat-card neutral">
            <div className="stat-label">Overall Uptime</div>
            <div className="stat-value">{Math.round(stats.overall_uptime)}%</div>
            <div className="stat-sub">total system health</div>
          </div>
        </div>

        <div className="dials-row">
          <div className="dial-card">
            <div className="dial-label">Uptime Rate</div>
            <svg className="dial-svg" width="140" height="90" viewBox="0 0 130 82">
              <path d="M15,77 A55,55,0,0,1,115,77" fill="none" stroke="var(--surface3)" stroke-width="8" stroke-linecap="round" />
              <path d="M15,77 A55,55,0,0,1,115,77" fill="none" stroke="var(--up)" stroke-width="8" stroke-linecap="round" strokeDasharray={arc} style={getDialStyle(stats.overall_uptime)} />
              <text x="65" y="74" textAnchor="middle" fontFamily="Syne,sans-serif" fontSize="14" fontWeight="800" fill="var(--text)">{Math.round(stats.overall_uptime)}%</text>
            </svg>
          </div>
          <div className="dial-card">
            <div className="dial-label">Avg Response</div>
            <svg className="dial-svg" width="140" height="90" viewBox="0 0 130 82">
              <path d="M15,77 A55,55,0,0,1,115,77" fill="none" stroke="var(--surface3)" stroke-width="8" stroke-linecap="round" />
              <path d="M15,77 A55,55,0,0,1,115,77" fill="none" stroke="var(--accent2)" stroke-width="8" stroke-linecap="round" strokeDasharray={arc} style={getDialStyle(Math.max(0, 100 - stats.avg_latency / 20))} />
              <text x="65" y="74" textAnchor="middle" fontFamily="Syne,sans-serif" fontSize="14" fontWeight="800" fill="var(--text)">{Math.round(stats.avg_latency)}ms</text>
            </svg>
          </div>
          <div className="dial-card">
            <div className="dial-label">Health Score</div>
            <svg className="dial-svg" width="140" height="90" viewBox="0 0 130 82">
              <path d="M15,77 A55,55,0,0,1,115,77" fill="none" stroke="var(--surface3)" stroke-width="8" stroke-linecap="round" />
              <path d="M15,77 A55,55,0,0,1,115,77" fill="none" stroke={stats.overall_uptime > 80 ? 'var(--up)' : 'var(--slow)'} stroke-width="8" stroke-linecap="round" strokeDasharray={arc} style={getDialStyle(stats.overall_uptime * 0.9)} />
              <text x="65" y="74" textAnchor="middle" fontFamily="Syne,sans-serif" fontSize="14" fontWeight="800" fill="var(--text)">{Math.round(stats.overall_uptime * 0.9)}</text>
            </svg>
          </div>
        </div>

        <div className="hero" style={{ marginTop: '2rem' }}>
          <h1>Services</h1>
        </div>

        <div className="grid-2">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Monitored Sites</span>
              <span className="last-check-label">{sites.length} sites</span>
            </div>
            <div className="col-headers">
              <div></div>
              <div className="col-h">Site</div>
              <div className="col-h">Status</div>
              <div className="col-h">Ping</div>
              <div className="col-h">Latency</div>
              <div></div>
            </div>
            <div id="siteList">
              {sites.length === 0 ? (
                <div className="empty-state">No sites added yet — click + Add Site to begin.</div>
              ) : (
                sites.map(site => (
                  <div key={site.id} className="site-row clickable" onClick={() => window.open(site.url, '_blank')}>
                    <div className={`status-dot ${site.status === 'success' ? 'up' : site.status}`}></div>
                    <div>
                      <div className="site-name">
                        <Icon name={site.icon} size={18} style={{ marginRight: '8px', color: 'var(--text2)' }} />
                        {site.name}
                      </div>
                      <div className="site-url">{site.url.replace(/^https?:\/\//, '')}</div>
                    </div>
                    <div className={`badge ${site.status === 'success' ? 'up' : site.status}`}>
                      {site.status === 'success' ? 'SUCCESS' : site.status.toUpperCase()}
                    </div>
                    <div className="ping-val">{site.latency ? `${Math.round(site.latency)}ms` : '—'}</div>
                    <div>
                      <div className="latency-bar">
                        <div 
                          className="latency-fill" 
                          style={{ 
                            width: `${Math.min((site.latency || 0) / 20, 100)}%`, 
                            background: (site.latency || 0) > 1000 ? 'var(--down)' : (site.latency || 0) > 500 ? 'var(--slow)' : 'var(--up)' 
                          }} 
                        ></div>
                      </div>
                      <div className="latency-sub">
                        {site.latency ? (site.latency < 300 ? 'Fast' : site.latency < 800 ? 'Moderate' : 'Slow') : '—'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                      <button className="delete-btn" onClick={() => handleEditSite(site)} title="Edit">
                        <Pencil size={12} />
                      </button>
                      <button className="delete-btn" onClick={() => handleDeleteSite(id, name)} title="Remove">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Response Time Trend</span>
                <span className="last-check-label">last 100 checks</span>
              </div>
              <div className="chart-wrap">
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">System Uptime Trend</span>
                <span className="last-check-label">overall accuracy</span>
              </div>
              <div className="chart-wrap" style={{ height: '140px' }}>
                <Line 
                  data={{
                    labels: chartData.labels,
                    datasets: [{
                      label: 'Uptime %',
                      data: chartData.labels.map((_, i) => {
                        const checkStatuses = sites.map(s => (s.history[i] || {}).status === 'success');
                        const upCount = checkStatuses.filter(v => v).length;
                        return sites.length > 0 ? (upCount / sites.length) * 100 : 0;
                      }),
                      borderColor: '#11a367',
                      backgroundColor: 'rgba(17,163,103,0.07)',
                      borderWidth: 1.5,
                      pointRadius: 0,
                      tension: 0.1,
                      fill: true,
                    }]
                  }} 
                  options={{ ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: 100 } } }} 
                />
              </div>
            </div>

            <div className="panel" style={{ flex: 1 }}>
              <div className="panel-header">
                <span className="panel-title">Event Feed</span>
                <button className="btn" onClick={() => setFeed([])} style={{ fontSize: '0.62rem', padding: '4px 10px' }}>Clear</button>
              </div>
              <div className="feed">
                {feed.length === 0 ? (
                  <div className="feed-item">
                    <div className="feed-dot" style={{ background: 'var(--text3)' }}></div>
                    <div>
                      <div className="feed-time">now</div>
                      <div className="feed-msg">Monitoring started. Live updates enabled.</div>
                    </div>
                  </div>
                ) : (
                  feed.map((item, i) => (
                    <div key={i} className="feed-item">
                      <div className="feed-dot" style={{ background: item.status === 'success' ? 'var(--up)' : item.status === 'down' ? 'var(--down)' : 'var(--text3)' }}></div>
                      <div>
                        <div className="feed-time">{item.time}</div>
                        <div className="feed-msg">{item.msg}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay open" onClick={(e) => e.target.className.includes('modal-overlay') && setIsModalOpen(false)}>
          <div className="modal">
            <h2>{editingSite ? 'Edit site' : 'Add a site'}</h2>
            <p>{editingSite ? 'Update the name or URL.' : 'Enter a name and URL — we\'ll check it every minute.'}</p>
            <div className="form-group">
              <label>Select Icon</label>
              <div className="icon-grid">
                {ICONS.map(icon => (
                  <button 
                    key={icon} 
                    className={`icon-btn ${newSite.icon === icon ? 'active' : ''}`}
                    onClick={() => setNewSite({ ...newSite, icon })}
                  >
                    <Icon name={icon} size={20} />
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Site Name</label>
              <input 
                type="text" 
                value={newSite.name} 
                onChange={(e) => setNewSite({ ...newSite, name: e.target.value })} 
                placeholder="e.g. My Portfolio" 
              />
            </div>
            <div className="form-group">
              <label>URL</label>
              <input 
                type="url" 
                value={newSite.url} 
                onChange={(e) => setNewSite({ ...newSite, url: e.target.value })} 
                placeholder="https://example.com" 
              />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => { setIsModalOpen(false); setEditingSite(null); setNewSite({ name: '', url: '', icon: 'Globe' }); }}>Cancel</button>
              <button className="btn btn-accent" onClick={handleAddSite}>{editingSite ? 'Save Changes' : 'Add Site'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


