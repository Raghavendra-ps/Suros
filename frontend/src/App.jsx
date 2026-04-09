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

// Format latency: 999ms → "999 ms", 1000ms → "1k ms", 1345ms → "1.3k ms"
const formatLatency = (ms) => {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}k ms`;
  return `${Math.round(ms / 1000)}k ms`;
};

const App = () => {
  const [sites, setSites] = useState([]);
  const [stats, setStats] = useState({ up: 0, down: 0, avg_latency: 0, overall_uptime: 0, total_outages: 0, network_latency: null, network_outages: 0, power_outages: 0, current_outage: null, connectivity_history: [] });
  const [systemMetrics, setSystemMetrics] = useState({ cpu: 0, memory: { percent: 0 }, disk: { percent: 0 }, total_storage: { total: 0, used: 0, free: 0, percent: 0 }, disks: [], uptime: 0, temp: { cpu: null, gpu: null } });
  const [systemHistory, setSystemHistory] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem('odyssey_theme') || 'dark');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [newSite, setNewSite] = useState({ name: '', url: '', icon: 'Globe' });
  const [lastCheckTime, setLastCheckTime] = useState(null);
  const [timeAgo, setTimeAgo] = useState('—');
  const [isLoading, setIsLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customName, setCustomName] = useState(localStorage.getItem('odyssey_custom_name') || '');
  const [customLogo, setCustomLogo] = useState(localStorage.getItem('odyssey_custom_logo') || null);

  const fetchSites = async () => {
    try {
      const res = await axios.get('/api/sites');
      setSites(Array.isArray(res.data) ? res.data : []);
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

  const fetchSystemHistory = async () => {
    try {
      const res = await axios.get('/api/system-history');
      setSystemHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching system history:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchSites(), fetchStats(), fetchSystemMetrics(), fetchSystemHistory()]);
      setIsLoading(false);
    };
    init();

    const interval = setInterval(() => {
      fetchSites();
      fetchStats();
      fetchSystemHistory();
    }, 30000);

    const metricsInterval = setInterval(() => {
      fetchSystemMetrics();
    }, 5000);

    const timeAgoInterval = setInterval(() => {
      if (lastCheckTime) {
        const secs = Math.round((new Date() - lastCheckTime) / 1000);
        setTimeAgo(`checked ${secs}s ago`);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(metricsInterval);
      clearInterval(timeAgoInterval);
    };
  }, [lastCheckTime]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('odyssey_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const toggleSettings = () => setSettingsOpen(!settingsOpen);

  const handleCustomNameChange = (val) => {
    setCustomName(val);
    localStorage.setItem('odyssey_custom_name', val);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/upload-logo', {
        method: 'POST',
        body: formData
      });
      if (response.ok) {
        const data = await response.json();
        setCustomLogo(data.url);
        localStorage.setItem('odyssey_custom_logo', data.url);
      }
    } catch (err) {
      console.error('Logo upload failed:', err);
    }
  };

  const handleAddSite = async () => {
    if (!newSite.name || !newSite.url) return;
    let url = newSite.url;
    if (!url.startsWith('http')) url = 'https://' + url;

    try {
      if (editingSite) {
        await axios.put(`/api/sites/${editingSite.id}`, { ...newSite, url });
      } else {
        await axios.post('/api/sites', { ...newSite, url });
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
    } catch (err) {
      console.error('Error deleting site:', err);
    }
  };



  const safeSites = Array.isArray(sites) ? sites : [];
  const safeSystemHistory = Array.isArray(systemHistory) ? systemHistory : [];

  const chartLabels = (safeSites.length > 0 && Array.isArray(safeSites[0]?.history)) 
    ? safeSites[0].history.map(h => h ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '') 
    : [];

  const chartData = {
    labels: chartLabels,
    datasets: [{
      label: 'Avg Latency (ms)',
      data: (safeSites.length > 0 && Array.isArray(safeSites[0]?.history)) 
        ? safeSites[0].history.map(h => h ? h.latency : 0) 
        : [],
      borderColor: '#c84b2f',
      backgroundColor: 'rgba(200,75,47,0.07)',
      borderWidth: 2,
      pointRadius: 0,
      pointBackgroundColor: '#c84b2f',
      tension: 0.3,
      fill: true,
    }]
  };

  const memoryChartData = {
    labels: safeSystemHistory.map(h => h ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : ''),
    datasets: [{
      label: 'RAM %',
      data: safeSystemHistory.map(h => h ? h.ram : 0),
      borderColor: '#e08c2f',
      backgroundColor: 'rgba(224,140,47,0.07)',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
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
      x: { 
        grid: { color: 'rgba(200,200,200,0.05)', display: false }, 
        ticks: { 
          color: '#55504a', 
          font: { family: 'DM Mono', size: 9 }, 
          maxTicksLimit: 24,
          callback: function(value, index, values) {
            const label = this.getLabelForValue(value);
            // Only show labels for 00:00, 06:00, 12:00, 18:00
            if (label === '00:00' || label === '06:00' || label === '12:00' || label === '18:00') {
              return label;
            }
            return null;
          }
        } 
      },
      y: { 
        grid: { color: 'rgba(200,200,200,0.05)' }, 
        ticks: { color: '#55504a', font: { family: 'DM Mono', size: 9 }, padding: 8 }, 
        beginAtZero: true 
      }
    }
  };

  // Dial Helpers
  const arc = 219.9;
  // Latency thresholds: LAN 0-49ms, Fast 50-100ms, Average 101-2000ms, Slow 2000ms+
  const getLatencyLabel = (lat) => {
    if (lat === null || lat === undefined) return '—';
    if (lat < 50) return 'LAN';
    if (lat <= 100) return 'Fast';
    if (lat <= 2000) return 'Average';
    return 'Slow';
  };
  const getLatencyColor = (lat) => {
    if (lat === null || lat === undefined) return 'var(--text3)';
    if (lat <= 100) return 'var(--up)';
    if (lat <= 2000) return 'var(--degraded)';
    return 'var(--down)';
  };

  // Connectivity history chart for server outages
  const connectivityChartData = {
    labels: (stats.connectivity_history || []).map(h => new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })),
    datasets: [{
      label: 'Server Online',
      data: (stats.connectivity_history || []).map(h => h.online ? 1 : 0),
      borderColor: '#2fa87e',
      backgroundColor: 'rgba(47,168,126,0.15)',
      borderWidth: 1.5,
      pointRadius: 2,
      pointBackgroundColor: '#2fa87e',
      tension: 0.4,
      fill: true,
      stepped: 'before',
    }]
  };

  const connectivityChartOptions = {
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
      x: { grid: { color: 'rgba(200,200,200,0.05)', display: false }, ticks: { color: '#55504a', font: { family: 'DM Mono', size: 9 }, maxTicksLimit: 10 } },
      y: { grid: { color: 'rgba(200,200,200,0.05)' }, ticks: { color: '#55504a', font: { family: 'DM Mono', size: 9 }, beginAtZero: true, max: 1 } },
    }
  };

  const getDialStyle = (pct) => ({
    strokeDashoffset: arc - (Math.min(100, Math.max(0, pct)) / 100) * arc,
    transition: 'stroke-dashoffset 1s ease'
  });

  if (isLoading) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loader-orbit">
          <div className="loader-dot"></div>

        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <div className="logo">
          <div className="logo-circle">
            {customLogo ? (
              <img src={customLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <img src="/Odyssey.png" alt="Odyssey" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
          <span className="logo-text">{customName || 'Odyssey'}</span>
        </div>
        <div className="header-right">
          <button className="settings-icon" onClick={toggleSettings}>⚙</button>
        </div>
      </header>

      {/* Settings Panel */}
      <div className={`settings-panel ${settingsOpen ? 'open' : ''}`}>
        <div className="settings-panel-header">
          <span className="settings-panel-title">Settings</span>
          <button className="settings-icon" onClick={toggleSettings} style={{ width: 28, height: 28 }}>✕</button>
        </div>
        <div className="settings-section">
          <label>Custom Tab Name</label>
          <input type="text" value={customName} onChange={(e) => handleCustomNameChange(e.target.value)} placeholder="e.g. My Server" />
        </div>
        <div className="settings-section">
          <label>Custom Logo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="logo-circle" style={{ width: 28, height: 28, cursor: 'pointer' }} onClick={() => document.getElementById('logo-upload-input').click()}>
              {customLogo ? (
                <img src={customLogo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              ) : (
                <div className="logo-circle-placeholder" style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', opacity: 0.5 }} />
              )}
            </div>
            <button className="logo-upload-btn" onClick={() => document.getElementById('logo-upload-input').click()}>Upload Image</button>
            <input id="logo-upload-input" type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
          </div>
        </div>
        <div className="settings-section">
          <label>Add Site</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <input
              type="text"
              value={newSite.name}
              onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
              placeholder="Site Name"
            />
            <input
              type="text"
              value={newSite.url}
              onChange={(e) => setNewSite({ ...newSite, url: e.target.value })}
              placeholder="URL (e.g. https://example.com)"
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.3rem', marginTop: '0.3rem' }}>
              {ICONS.map(icon => (
                <button
                  key={icon}
                  className={`icon-btn ${newSite.icon === icon ? 'active' : ''}`}
                  onClick={() => setNewSite({ ...newSite, icon })}
                  style={{ width: 32, height: 32 }}
                >
                  <Icon name={icon} size={14} />
                </button>
              ))}
            </div>
            <button
              className="btn btn-accent"
              onClick={() => {
                if (!newSite.name || !newSite.url) return;
                let url = newSite.url;
                if (!url.startsWith('http')) url = 'https://' + url;
                handleAddSite({ ...newSite, url });
                setNewSite({ name: '', url: '', icon: 'Globe' });
                setSettingsOpen(false);
              }}
              style={{ alignSelf: 'flex-end', marginTop: '0.3rem' }}
            >
              + Add Site
            </button>
          </div>
        </div>
        <div className="settings-section">
          <div className="theme-row">
            <span>Dark Mode</span>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>
      </div>

      <div className="main">
        <div className="hero">
          <div className="hero-eyebrow">✦ Live</div>
          <h1>System Metrics</h1>
        </div>

        <div className="panel" style={{ marginBottom: '2.5rem', padding: '1.25rem' }}>
          <div className="panel-title" style={{ marginBottom: '1rem' }}>Host Server Metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem' }}>
            <div>
              <div className="stat-label" style={{ color: 'var(--text)' }}>CPU Usage</div>
              <div className="latency-bar" style={{ height: '8px', margin: '8px 0' }}>
                <div className="latency-fill" style={{ width: `${Math.round(systemMetrics.cpu)}%`, background: systemMetrics.cpu > 80 ? 'var(--down)' : 'var(--up)' }}></div>
              </div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{Math.round(systemMetrics.cpu)}%</div>
            </div>
            <div>
              <div className="stat-label" style={{ color: 'var(--text)' }}>RAM Usage</div>
              <div className="latency-bar" style={{ height: '8px', margin: '8px 0' }}>
                <div className="latency-fill" style={{ width: `${Math.round(systemMetrics.memory.percent)}%`, background: systemMetrics.memory.percent > 80 ? 'var(--down)' : 'var(--up)' }}></div>
              </div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{Math.round(systemMetrics.memory.percent)}%</div>
            </div>
            <div>
              <div className="stat-label" style={{ color: 'var(--text)' }}>Disk Usage</div>
              <div className="latency-bar" style={{ height: '8px', margin: '8px 0' }}>
                <div className="latency-fill" style={{ width: `${Math.round(systemMetrics.disk.percent)}%`, background: systemMetrics.disk.percent > 80 ? 'var(--down)' : 'var(--up)' }}></div>
              </div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{Math.round(systemMetrics.disk.percent)}%</div>
            </div>
            <div>
              <div className="stat-label" style={{ color: 'var(--text)' }}>GPU Usage</div>
              <div className="latency-bar" style={{ height: '8px', margin: '8px 0' }}>
                <div className="latency-fill" style={{ width: `${Math.round(systemMetrics.gpu?.util || 0)}%`, background: (systemMetrics.gpu?.util || 0) > 80 ? 'var(--down)' : 'var(--up)' }}></div>
              </div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{systemMetrics.gpu ? `${Math.round(systemMetrics.gpu.util)}%` : 'N/A'}</div>
              {systemMetrics.gpu && <div className="stat-sub" style={{ fontSize: '0.6rem' }}>{systemMetrics.gpu.memory.used}/{systemMetrics.gpu.memory.total} GB</div>}
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: '2.5rem', padding: '1.25rem' }}>
          <div className="panel-title" style={{ marginBottom: '1rem' }}>Thermal Health</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.25rem' }}>
            <div>
              <div className="stat-label" style={{ color: 'var(--text)' }}>CPU Temperature</div>
              <div className="latency-bar" style={{ height: '8px', margin: '8px 0' }}>
                <div className="latency-fill" style={{ 
                  width: `${Math.min(100, (systemMetrics.temp?.cpu || 0))}%`, 
                  background: (systemMetrics.temp?.cpu || 0) > 80 ? 'var(--down)' : (systemMetrics.temp?.cpu || 0) > 60 ? 'var(--slow)' : 'var(--up)' 
                }}></div>
              </div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{systemMetrics.temp?.cpu ? `${Math.round(systemMetrics.temp.cpu)}°C` : 'N/A'}</div>
            </div>
            <div>
              <div className="stat-label" style={{ color: 'var(--text)' }}>GPU Temperature</div>
              <div className="latency-bar" style={{ height: '8px', margin: '8px 0' }}>
                <div className="latency-fill" style={{ 
                  width: `${Math.min(100, (systemMetrics.temp?.gpu || 0))}%`, 
                  background: (systemMetrics.temp?.gpu || 0) > 80 ? 'var(--down)' : (systemMetrics.temp?.gpu || 0) > 60 ? 'var(--slow)' : 'var(--up)' 
                }}></div>
              </div>
              <div className="stat-value" style={{ fontSize: '1.2rem' }}>{systemMetrics.temp?.gpu ? `${Math.round(systemMetrics.temp.gpu)}°C` : 'N/A'}</div>
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
            <div className="stat-value">{formatLatency(stats.avg_latency)}</div>
            <div className="stat-sub">external only</div>
          </div>
          <div className="stat-card neutral">
            <div className="outage-wrap">
              <div className="stat-label">Server Outages</div>
              <div className="stat-value">{(stats.network_outages || 0) + (stats.power_outages || 0)}</div>
              <div className="stat-sub">internet / power</div>
              <div className="outage-tooltip">
                <div>Network outages: {stats.network_outages || 0}</div>
                <div>Power outages: {stats.power_outages || 0}</div>
                {stats.current_outage && <div style={{ color: 'var(--down)' }}>Currently offline!</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="dials-row">
          <div className="dial-card">
            <div className="dial-label">Site Outages</div>
            <svg className="dial-svg" width="180" height="120" viewBox="0 0 200 130">
              <path d="M30,120 A70,70,0,0,1,170,120" fill="none" stroke="var(--surface3)" stroke-width="12" stroke-linecap="round" />
              <path d="M30,120 A70,70,0,0,1,170,120" fill="none" stroke="var(--down)" stroke-width="12" stroke-linecap="round" strokeDasharray={arc} style={getDialStyle((stats.total_outages / 28) * 100)} />
              <text x="100" y="115" textAnchor="middle" fontFamily="Syne,sans-serif" fontSize="22" fontWeight="800" fill="var(--text)">{stats.total_outages}</text>
              <text x="100" y="130" textAnchor="middle" fontFamily="DM Moto,sans-serif" fontSize="8" fill="var(--text2)">last 24h</text>
            </svg>
          </div>
          <div className="dial-card">
            <div className="dial-label">Network Health</div>
            <svg className="dial-svg" width="180" height="120" viewBox="0 0 200 130">
              <path d="M30,120 A70,70,0,0,1,170,120" fill="none" stroke="var(--surface3)" stroke-width="12" stroke-linecap="round" />
              <path d="M30,120 A70,70,0,0,1,170,120" fill="none" stroke={stats.network_latency ? (stats.network_latency < 100 ? 'var(--up)' : 'var(--slow)') : 'var(--down)'} stroke-width="12" stroke-linecap="round" strokeDasharray={arc} style={getDialStyle(stats.network_latency ? Math.max(10, 100 - stats.network_latency / 5) : 0)} />
              <text x="100" y="115" textAnchor="middle" fontFamily="Syne,sans-serif" fontSize="22" fontWeight="800" fill="var(--text)">{stats.network_latency ? `${stats.network_latency}ms` : 'OFFLINE'}</text>
              <text x="100" y="130" textAnchor="middle" fontFamily="DM Moto,sans-serif" fontSize="8" fill="var(--text2)">1.1.1.1</text>
            </svg>
          </div>
          <div className="dial-card">
            <div className="dial-label">Storage</div>
            <div className="storage-wrap">
              <div className="storage-bar-container">
                <div className="storage-bar" style={{ width: `${systemMetrics.total_storage?.percent || 0}%`, backgroundColor: systemMetrics.total_storage?.percent < 80 ? 'var(--up)' : systemMetrics.total_storage?.percent < 90 ? 'var(--slow)' : 'var(--down)' }}></div>
              </div>
              <div className="storage-metric">
                <span className="storage-used">{systemMetrics.total_storage?.used || 0}</span>
                <span className="storage-sep"> / </span>
                <span className="storage-total">{systemMetrics.total_storage?.total || 0}</span>
                <span className="storage-unit">GB</span>
              </div>
              <div className="storage-tooltip">
                {systemMetrics.disks?.map((disk, i) => {
                  return (
                    <div key={i}>
                      {disk.device} | {disk.total}GB | {disk.mountpoint} | {disk.used}GB ({disk.percent}%)
                    </div>
                  );
                })}
              </div>
            </div>
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
              <div className="col-h" style={{ textAlign: 'right' }}>Outages</div>
              <div></div>
            </div>
            <div id="siteList">
              {safeSites.length === 0 ? (
                <div className="empty-state">No sites added yet — add sites to begin.</div>
              ) : (
                safeSites.map(site => site && (
                  <div key={site.id} className="site-row clickable" onClick={() => site.url && window.open(site.url, '_blank')}>
                    <div className={`status-dot ${site.status === 'success' ? 'online' : site.status === 'lan_up' ? 'lan' : site.status === 'slow' ? 'degraded' : 'offline'}`} title={site.status === 'lan_up' ? 'Reachable via LAN' : site.status === 'slow' ? 'Degraded' : site.status === 'success' ? 'Online' : 'Offline'}></div>
                    <div>
                      <div className="site-name">
                        <Icon name={site.icon} size={18} style={{ marginRight: '8px', color: 'var(--text2)' }} />
                        {site.name}
                      </div>
                      <div className="site-url">{site.url ? site.url.replace(/^https?:\/\//, '') : ''}</div>
                    </div>
                    <div className={`badge ${site.status === 'success' ? 'online' : site.status === 'lan_up' ? 'lan' : site.status === 'slow' ? 'degraded' : 'offline'}`}>
                      {site.status === 'success' ? 'Online' : site.status === 'lan_up' ? 'LAN' : site.status === 'slow' ? 'Slow' : 'Offline'}
                    </div>
                    <div className="ping-val">{site.latency ? `${Math.round(site.latency)}ms` : '—'}</div>
                    <div>
                      <div className="latency-bar">
                        <div
                          className="latency-fill"
                          style={{
                            width: `${Math.min((site.latency || 0) / 20, 100)}%`,
                            background: (site.latency || 0) >= 3000 ? 'var(--down)' : (site.latency || 0) >= 2000 ? 'var(--degraded)' : 'var(--up)'
                          }}
                        ></div>
                      </div>
                      <div className="latency-sub" style={{ color: (site.latency || 0) >= 3000 ? 'var(--down)' : (site.latency || 0) >= 2000 ? 'var(--degraded)' : 'var(--up)' }}>
                        {site.latency ? (site.latency < 100 ? 'Very Fast' : site.latency < 2000 ? 'Fast' : site.latency < 3000 ? 'Slow' : 'Very Slow') : '—'}
                      </div>
                    </div>
                    <div className="outage-badge" title="External outages recorded">
                      {(site.outage_count || 0) > 0 ? `${site.outage_count} ↓` : '—'}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                      <button className="delete-btn" onClick={() => handleEditSite(site)} title="Edit">
                        <Pencil size={12} />
                      </button>
                      <button className="delete-btn" onClick={() => handleDeleteSite(site.id, site.name)} title="Remove">
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
                    labels: chartLabels,
                    datasets: [{
                      label: 'Uptime %',
                      data: (chartLabels || []).map((_, i) => {
                        const checkStatuses = safeSites.map(s => (s && Array.isArray(s.history) && s.history[i] && s.history[i].status === 'success'));
                        const upCount = checkStatuses.filter(v => v).length;
                        return safeSites.length > 0 ? (upCount / safeSites.length) * 100 : 0;
                      }),
                      borderColor: '#11a367',
                      backgroundColor: 'rgba(17,163,103,0.07)',
                      borderWidth: 1.5,
                      pointRadius: 0,
                      tension: 0.1,
                      fill: true,
                    }]
                  }}
                  options={{ ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 100, ticks: { ...chartOptions.scales.y.ticks, stepSize: 20 } } } }}
                />
              </div>
            </div>

            <div className="panel" style={{ flex: 1 }}>
              <div className="panel-header">
                <span className="panel-title">Memory Pressure</span>
                <span className="last-check-label">RAM trend</span>
              </div>
              <div className="chart-wrap" style={{ height: '180px' }}>
                <Line
                  data={memoryChartData}
                  options={{ ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 100, ticks: { ...chartOptions.scales.y.ticks, stepSize: 20 } } } }}
                />
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Server Connectivity</span>
                <span className="last-check-label">internet history</span>
              </div>
              <div className="chart-wrap" style={{ height: '120px' }}>
                <Line data={connectivityChartData} options={connectivityChartOptions} />
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


