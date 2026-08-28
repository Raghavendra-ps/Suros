import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  Trash2, Plus, Moon, Sun, Activity, RefreshCw, Pencil,
  Server, Globe, Database, Cpu, Layers, Terminal, Box, Mail, Shield, HardDrive, Monitor, Link as LinkIcon,
  Check, AlertTriangle, MoreVertical, Settings
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
const templateDefinitions = [
  ['host_outage', 'Host Offline'],
  ['host_recovery', 'Host Recovery'],
  ['site_outage', 'Site Offline'],
  ['site_recovery', 'Site Recovery']
];
const templateVariables = ['{site_name}', '{site_url}', '{status}', '{offline_at}', '{online_at}'];

const templateMarkup = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\{(site_name|site_url|status|offline_at|online_at)\}/g, '<span class="template-inline-token" contenteditable="false">{$1}</span>').replace(/\n/g, '<br>');

const TemplateField = ({ value, onChange, onFocus, onDrop, onDragOver, onDragEnter, onDragLeave, className }) => {
  const fieldRef = useRef(null);

  const handleKeyDown = (event) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed) return;
    const node = selection.anchorNode;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const textOffset = node.nodeType === Node.TEXT_NODE ? selection.anchorOffset : null;
    const parent = node === fieldRef.current ? fieldRef.current : node.parentElement;
    const siblings = parent === fieldRef.current ? Array.from(fieldRef.current.childNodes) : [];
    let token = element?.closest('.template-inline-token');
    if (!token && siblings.length) {
      const index = node === fieldRef.current ? selection.anchorOffset : siblings.indexOf(node);
      const atStart = node === fieldRef.current ? true : textOffset === 0;
      const atEnd = node === fieldRef.current ? true : textOffset === node.textContent.length;
      const adjacent = event.key === 'Backspace' ? siblings[index - 1] : siblings[index];
      if (atStart && event.key === 'Backspace') token = adjacent;
      if (atEnd && event.key === 'Delete') token = adjacent;
    }
    if (!token || !token.classList.contains('template-inline-token')) return;
    event.preventDefault();
    token.remove();
    onChange(fieldRef.current.innerText);
  };

  useEffect(() => {
    if (fieldRef.current && fieldRef.current.innerText !== value) {
      fieldRef.current.innerHTML = templateMarkup(value);
    }
  }, [value]);

  return <div
    ref={fieldRef}
    className={className}
    contentEditable
    suppressContentEditableWarning
    onFocus={onFocus}
    onKeyDown={handleKeyDown}
    onInput={(event) => onChange(event.currentTarget.innerText)}
    onDrop={onDrop}
    onDragOver={onDragOver}
    onDragEnter={onDragEnter}
    onDragLeave={onDragLeave}
    dangerouslySetInnerHTML={{ __html: templateMarkup(value) }}
  />;
};

const formatLatency = (ms) => {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}k ms`;
  return `${Math.round(ms / 1000)}k ms`;
};

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(1))} ${units[index]}`;
};

const App = () => {
  const [sites, setSites] = useState([]);
  const [stats, setStats] = useState({ up: 0, down: 0, avg_latency: 0, overall_uptime: 0, total_outages: 0, network_latency: null, network_outages: 0, power_outages: 0, current_outage: null, connectivity_history: [] });
  const [systemMetrics, setSystemMetrics] = useState({ cpu: 0, memory: { percent: 0 }, disk: { percent: 0 }, total_storage: { total: 0, used: 0, free: 0, percent: 0 }, disks: [], uptime: 0, temp: { cpu: null, gpu: null } });
  const [systemHistory, setSystemHistory] = useState([]);
  const [drives, setDrives] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [netHistory, setNetHistory] = useState([]);
  const [ramHistory, setRamHistory] = useState([]);
  const [pressureHistory, setPressureHistory] = useState([]);
  const prevStats = useRef({});

  const fetchProcesses = async () => {
    try {
      const res = await axios.get('/api/processes');
      setProcesses(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching processes:', err);
    }
  };

  const fetchDrives = async () => {
    try {
      const res = await axios.get('/api/drives');
      setDrives(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching drives:', err);
    }
  };

  const [theme, setTheme] = useState(localStorage.getItem('odyssey_theme') || 'dark');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState(null);

  const [settings, setSettings] = useState({
    dashboard_name: 'Odyssey',
    logo_url: null,
    email_enabled: 0,
    email_provider: 'gmail',
    email_smtp_server: '',
    email_smtp_port: 587,
    email_username: '',
    email_password: '',
    email_recipient: '',
    ntfy_enabled: 0,
    ntfy_url: 'https://ntfy.sh',
    ntfy_topic: '',
    ntfy_token: '',
    polling_rate: 30
  });
  const [activeSettingsTab, setActiveSettingsTab] = useState('email');
  const [activeTemplateKey, setActiveTemplateKey] = useState('host_outage');
  const [focusedTemplateField, setFocusedTemplateField] = useState(null);
  const [templateDropTarget, setTemplateDropTarget] = useState(null);
  const [logs, setLogs] = useState({ entries: [] });
  const [testStatus, setTestStatus] = useState(null);
  const [draftSettings, setDraftSettings] = useState({});
  const [saveStatus, setSaveStatus] = useState(null);

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameDevice, setRenameDevice] = useState('');
  const [renameVal, setRenameVal] = useState('');

  const handleSaveRename = async () => {
    try {
      await axios.post('/api/drives/alias', { device: renameDevice, alias: renameVal });
      setIsRenameModalOpen(false);
      fetchDrives();
    } catch (err) {
      console.error('Error saving drive name:', err);
    }
  };

  const [newSite, setNewSite] = useState({ name: '', url: '', icon: 'Globe' });
  const [lastCheckTime, setLastCheckTime] = useState(null);
  const [timeAgo, setTimeAgo] = useState('—');
  const [isLoading, setIsLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customName, setCustomName] = useState('Odyssey');
  const [customLogo, setCustomLogo] = useState(null);
  const pollingRate = Math.max(0.5, Number(settings.polling_rate) || 30);

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
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      if (res.data.network_rates) {
        setNetHistory(prev => {
          const next = [...prev, { rx: res.data.network_rates.rx, tx: res.data.network_rates.tx, time: t }];
          if (next.length > 30) next.shift();
          return next;
        });
      }
      if (res.data.cpu_pressure !== null && res.data.cpu_pressure !== undefined) {
        setPressureHistory(prev => {
          const next = [...prev, { value: res.data.cpu_pressure, time: t }];
          if (next.length > 60) next.shift();
          return next;
        });
      }
      setRamHistory(prev => {
        const next = [...prev, { value: res.data.memory?.percent || 0, time: t }];
        if (next.length > 30) next.shift();
        return next;
      });
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

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/settings');
      setCustomName(res.data.dashboard_name || 'Odyssey');
      setCustomLogo(res.data.logo_url || null);
      setSettings(res.data);
      setDraftSettings(prev => Object.keys(prev).length === 0 ? res.data : prev);
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await axios.get('/api/logs');
      setLogs(res.data || { entries: [] });
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const clearLogs = async () => {
    try {
      await axios.delete('/api/logs/application');
      setLogs({ entries: [] });
    } catch (err) {
      console.error('Error clearing application logs:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchSettings(), fetchSites(), fetchStats(), fetchSystemMetrics(), fetchSystemHistory(), fetchDrives(), fetchProcesses()]);
      setIsLoading(false);
    };
    init();

    const procInterval = setInterval(() => { fetchProcesses(); }, 10000);
    const interval = setInterval(() => { fetchSites(); fetchStats(); fetchSystemHistory(); fetchDrives(); }, pollingRate * 1000);
    const metricsInterval = setInterval(() => { fetchSystemMetrics(); }, pollingRate * 1000);

    return () => {
      clearInterval(interval);
      clearInterval(metricsInterval);
      clearInterval(procInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingRate]);

  useEffect(() => {
    if (!lastCheckTime) return;
    const timeAgoInterval = setInterval(() => {
      const secs = Math.round((new Date() - lastCheckTime) / 1000);
      setTimeAgo(`checked ${secs}s ago`);
    }, 5000);
    return () => clearInterval(timeAgoInterval);
  }, [lastCheckTime]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('odyssey_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const toggleSettings = () => setSettingsOpen(!settingsOpen);

  const insertTemplateVariable = (variable, fieldName = focusedTemplateField, selectionStart = null, selectionEnd = null) => {
    if (!fieldName) return;
    const field = `${activeTemplateKey}_${fieldName}`;
    setDraftSettings(prev => {
      const current = prev[field] || '';
      const start = selectionStart ?? current.length;
      const end = selectionEnd ?? start;
      return { ...prev, [field]: `${current.slice(0, start)}${variable}${current.slice(end)}` };
    });
  };

  const handleTemplateDrop = (event, fieldName) => {
    event.preventDefault();
    const variable = event.dataTransfer.getData('text/plain');
    if (!variable) return;
    const target = event.currentTarget;
    setFocusedTemplateField(fieldName);
    setTemplateDropTarget(null);
    insertTemplateVariable(variable, fieldName, target.innerText.length, target.innerText.length);
  };

  const handleSaveAlertSettings = async (updatedSettings) => {
    try {
      const res = await axios.put('/api/settings', updatedSettings);
      setSettings(res.data);
      setDraftSettings(res.data);
      setCustomName(res.data.dashboard_name || 'Odyssey');
      setCustomLogo(res.data.logo_url || null);
    } catch (err) {
      console.error('Error updating settings:', err);
    }
  };

  const handleSaveDraft = async () => {
    setSaveStatus('saving');
    try {
      const res = await axios.put('/api/settings', draftSettings);
      setSettings(res.data);
      setDraftSettings(res.data);
      setCustomName(res.data.dashboard_name || 'Odyssey');
      setCustomLogo(res.data.logo_url || null);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Error updating settings:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleTestNotifications = async () => {
    setTestStatus('Sending test notification...');
    try {
      const res = await axios.post('/api/settings/test-notification');
      if (res.data.success) {
        setTestStatus('Success! ' + res.data.details.join(', '));
      } else {
        setTestStatus('Failed: ' + res.data.details.join(', '));
      }
    } catch (err) {
      setTestStatus('Failed: ' + (err.response?.data?.detail || err.message));
    }
    setTimeout(() => setTestStatus(null), 5000);
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/api/upload-logo', { method: 'POST', body: formData });
      if (response.ok) {
        const data = await response.json();
        setCustomLogo(data.url);
        await fetchSettings();
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
      setNewSite({ name: '', url: '', icon: '' });
      fetchSites();
    } catch (err) {
      console.error('Error saving site:', err);
    }
  };

  const handleEditSite = (site) => {
    setEditingSite(site);
    setNewSite({ name: site.name, url: site.url, icon: site.icon || '' });
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

  const renameDrive = async (device, currentAlias) => {
    const newAlias = window.prompt(`Rename drive ${device}:`, currentAlias || '');
    if (newAlias === null) return;
    try {
      await axios.post('/api/drives/alias', { device, alias: newAlias });
      fetchDrives();
    } catch (err) {
      console.error('Error renaming drive:', err);
    }
  };

  const safeSites = Array.isArray(sites) ? sites : [];
  const safeSystemHistory = Array.isArray(systemHistory) ? systemHistory : [];

  const chartLabels = (safeSites.length > 0 && Array.isArray(safeSites[0]?.history))
    ? safeSites[0].history.map(h => h ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : '')
    : [];

  const latencyChartData = {
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

  const gpuChartData = {
    labels: safeSystemHistory.map(h => h ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : ''),
    datasets: [{
      label: 'GPU %',
      data: safeSystemHistory.map(h => (h && h.gpu !== null && h.gpu !== undefined) ? h.gpu : 0),
      borderColor: '#2fa87e',
      backgroundColor: 'rgba(47,168,126,0.07)',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
      fill: true,
    }]
  };

  const pressureChartData = {
    labels: pressureHistory.length > 0
      ? pressureHistory.map(h => h.time)
      : safeSystemHistory.map(h => h ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) : ''),
    datasets: [{
      label: 'CPU Pressure %',
      data: pressureHistory.length > 0
        ? pressureHistory.map(h => h.value)
        : safeSystemHistory.map(h => h?.cpu_pressure ?? 0),
      borderColor: '#c84b2f',
      backgroundColor: 'rgba(200,75,47,0.08)',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.3,
      fill: true,
    }]
  };

  const pressureValues = pressureHistory.length > 0
    ? pressureHistory.map(point => point.value)
    : safeSystemHistory.map(point => point?.cpu_pressure ?? 0);
  const pressureMax = Math.max(1, ...pressureValues) * 1.2;

  // Shared mini sparkline options — no axes, no borders, transparent bg
  const sparklineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false, border: { color: 'transparent' } },
      y: { display: false, border: { color: 'transparent' }, min: 0, max: 100 }
    },
    animation: { duration: 300 }
  };

  const pressureChartOptions = {
    ...sparklineOptions,
    scales: {
      x: { display: false, border: { color: 'transparent' } },
      y: { display: false, border: { color: 'transparent' }, min: 0, max: pressureMax }
    }
  };

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
      x: {
        grid: { color: 'rgba(200,200,200,0.05)', display: false },
        border: { color: 'transparent' },
        ticks: { color: '#55504a', font: { family: 'DM Mono', size: 9 }, maxTicksLimit: 10 }
      },
      y: {
        grid: { color: 'rgba(200,200,200,0.05)' },
        border: { color: 'transparent' },
        ticks: { color: '#55504a', font: { family: 'DM Mono', size: 9 }, beginAtZero: true, max: 1 }
      },
    }
  };

  // Response time chart options — no CSS vars, all literal colors
  const responseTimeOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: {
        display: false,
        border: { color: 'transparent' }
      },
      y: {
        display: true,
        grid: { color: 'rgba(200,200,200,0.05)', drawTicks: false },
        border: { color: 'transparent' },
        ticks: {
          color: '#55504a',
          font: { size: 7, family: 'DM Mono' },
          callback: (val) => `${Math.round(val)}ms`
        }
      }
    },
    animation: { duration: 300 }
  };

  const arc = 219.9;

  const getDialStyle = (pct) => ({
    strokeDashoffset: arc - (Math.min(100, Math.max(0, pct)) / 100) * arc,
    transition: 'stroke-dashoffset 1s ease'
  });

  if (isLoading) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loader-orbit"></div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <div className="logo" style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src={theme === 'dark' ? '/suros-logo-dark.png' : '/suros-logo-light.png'}
            style={{ height: '32px', width: 'auto', objectFit: 'contain' }}
            alt="Suros Logo"
          />
          <span className="suros-title-text" style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '1.9rem',
            letterSpacing: '-0.04em',
            textTransform: 'uppercase',
            display: 'inline-block',
            transform: 'scaleX(1.3) scaleY(0.95)',
            transformOrigin: 'left center',
            lineHeight: 1,
            color: theme === 'dark' ? '#ff3333' : '#000000',
            marginLeft: '14px',
            verticalAlign: 'middle',
            WebkitTextStroke: theme === 'dark' ? '1px #ff3333' : '1px #000000'
          }}>SUROS</span>
        </div>
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="header-icon-btn" onClick={toggleTheme} title="Toggle Theme">
            {theme === 'dark' ? <Moon size={20} strokeWidth={1.5} /> : <Sun size={20} strokeWidth={1.5} />}
          </button>
          <button className="header-icon-btn" onClick={toggleSettings} title="Open Settings">
            <Settings size={20} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {settingsOpen && (
        <div className="drawer-backdrop" onClick={() => setSettingsOpen(false)}></div>
      )}

      <div className={`settings-drawer ${settingsOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={() => setSettingsOpen(false)}>✕</button>
        </div>

        <div className="drawer-split-layout">
          <div className="drawer-sidebar">
            <button
              className={`sidebar-tab-btn ${activeSettingsTab === 'polling' ? 'active' : ''}`}
              onClick={() => setActiveSettingsTab('polling')}
            >
              Polling Rate
            </button>
            <button
              className={`sidebar-tab-btn ${activeSettingsTab === 'email' ? 'active' : ''}`}
              onClick={() => setActiveSettingsTab('email')}
            >
              Email Alerts
            </button>
            <button
              className={`sidebar-tab-btn ${activeSettingsTab === 'ntfy' ? 'active' : ''}`}
              onClick={() => setActiveSettingsTab('ntfy')}
            >
              ntfy Push Alerts
            </button>
            <button
              className={`sidebar-tab-btn ${activeSettingsTab === 'templates' ? 'active' : ''}`}
              onClick={() => setActiveSettingsTab('templates')}
            >
              Templates
            </button>
            <button
              className={`sidebar-tab-btn ${activeSettingsTab === 'logging' ? 'active' : ''}`}
              onClick={() => { setActiveSettingsTab('logging'); fetchLogs(); }}
            >
              Logging
            </button>
          </div>

          <div className="drawer-fields-container">
            {activeSettingsTab === 'polling' && (
              <div className="settings-section-fields">
                <div className="form-group">
                  <label>Polling interval (seconds)</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={draftSettings.polling_rate ?? 30}
                    onChange={(e) => setDraftSettings({ ...draftSettings, polling_rate: Math.max(0.5, Number(e.target.value) || 0.5) })}
                  />
                </div>
                <div className="settings-save-row">
                  <button className="btn btn-accent" onClick={handleSaveDraft} disabled={saveStatus === 'saving'}>
                    {saveStatus === 'saved' ? '✓ Saved' : 'Save Polling Rate'}
                  </button>
                </div>
              </div>
            )}
            {activeSettingsTab === 'email' && (
              <div className="settings-section-fields">
                <div className="form-group checkbox-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    id="emailEnabledCheck"
                    checked={draftSettings.email_enabled === 1}
                    onChange={(e) => { const v = { ...draftSettings, email_enabled: e.target.checked ? 1 : 0 }; setDraftSettings(v); handleSaveAlertSettings(v); }}
                    style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                  />
                  <label htmlFor="emailEnabledCheck" style={{ margin: 0, cursor: 'pointer', textTransform: 'none' }}>Enable Email Alerts</label>
                </div>

                <div className="form-group">
                  <label>Provider</label>
                  <select
                    value={draftSettings.email_provider || 'gmail'}
                    onChange={(e) => { const v = { ...draftSettings, email_provider: e.target.value }; setDraftSettings(v); handleSaveAlertSettings(v); }}
                  >
                    <option value="gmail">Gmail App Password</option>
                    <option value="microsoft">Microsoft (Outlook/Office365)</option>
                    <option value="apple">Apple iCloud</option>
                    <option value="resend">Resend API</option>
                  </select>
                </div>

                {draftSettings.email_provider === 'resend' ? (
                  <div className="form-group">
                    <label>Resend API Key</label>
                    <input type="password" value={draftSettings.email_password || ''} onChange={(e) => setDraftSettings({ ...draftSettings, email_password: e.target.value })} placeholder="re_..." />
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label>SMTP Username / Email</label>
                      <input type="email" value={draftSettings.email_username || ''} onChange={(e) => setDraftSettings({ ...draftSettings, email_username: e.target.value })} placeholder="your-email@provider.com" />
                    </div>
                    <div className="form-group">
                      <label>SMTP Password / App Password</label>
                      <input type="password" value={draftSettings.email_password || ''} onChange={(e) => setDraftSettings({ ...draftSettings, email_password: e.target.value })} placeholder="••••••••••••••••" />
                    </div>
                    <div className="form-group">
                      <label>Custom SMTP Server (optional)</label>
                      <input type="text" value={draftSettings.email_smtp_server || ''} onChange={(e) => setDraftSettings({ ...draftSettings, email_smtp_server: e.target.value })} placeholder="smtp.provider.com" />
                    </div>
                    <div className="form-group">
                      <label>SMTP Port (optional)</label>
                      <input type="number" value={draftSettings.email_smtp_port || 587} onChange={(e) => setDraftSettings({ ...draftSettings, email_smtp_port: parseInt(e.target.value) || 587 })} placeholder="587" />
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label>Recipient Address</label>
                  <input type="email" value={draftSettings.email_recipient || ''} onChange={(e) => setDraftSettings({ ...draftSettings, email_recipient: e.target.value })} placeholder="notifications@recipient.com" />
                </div>

                <div className="settings-save-row">
                  <button className="btn btn-accent" onClick={handleSaveDraft} disabled={saveStatus === 'saving'}>
                    {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? '✗ Error' : 'Save Changes'}
                  </button>
                  <button className="btn" onClick={handleTestNotifications} style={{ marginLeft: '0.5rem' }}>Test Connection</button>
                </div>
                {testStatus && <div className="test-status-msg">{testStatus}</div>}
              </div>
            )}

            {activeSettingsTab === 'ntfy' && (
              <div className="settings-section-fields">
                <div className="form-group checkbox-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    id="ntfyEnabledCheck"
                    checked={draftSettings.ntfy_enabled === 1}
                    onChange={(e) => { const v = { ...draftSettings, ntfy_enabled: e.target.checked ? 1 : 0 }; setDraftSettings(v); handleSaveAlertSettings(v); }}
                    style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                  />
                  <label htmlFor="ntfyEnabledCheck" style={{ margin: 0, cursor: 'pointer', textTransform: 'none' }}>Enable ntfy Alerts</label>
                </div>

                <div className="form-group">
                  <label>ntfy Server URL</label>
                  <input type="text" value={draftSettings.ntfy_url || ''} onChange={(e) => setDraftSettings({ ...draftSettings, ntfy_url: e.target.value })} placeholder="https://ntfy.sh" />
                </div>

                <div className="form-group">
                  <label>Topic</label>
                  <input type="text" value={draftSettings.ntfy_topic || ''} onChange={(e) => setDraftSettings({ ...draftSettings, ntfy_topic: e.target.value })} placeholder="my-secret-topic" />
                </div>

                <div className="form-group">
                  <label>Access Token (optional)</label>
                  <input type="password" value={draftSettings.ntfy_token || ''} onChange={(e) => setDraftSettings({ ...draftSettings, ntfy_token: e.target.value })} placeholder="tk_..." />
                </div>

                <div className="settings-save-row">
                  <button className="btn btn-accent" onClick={handleSaveDraft} disabled={saveStatus === 'saving'}>
                    {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? '✗ Error' : 'Save Changes'}
                  </button>
                  <button className="btn" onClick={handleTestNotifications} style={{ marginLeft: '0.5rem' }}>Test Connection</button>
                </div>
                {testStatus && <div className="test-status-msg">{testStatus}</div>}
              </div>
            )}

            {activeSettingsTab === 'templates' && (
              <div className="templates-page">
                <div className="template-palette">
                  <span className="template-variable-label">DRAG VARIABLES INTO A TEMPLATE FIELD</span>
                  <div className="template-variable-legend">
                    {templateVariables.map(variable => (
                      <button type="button" className="template-token" key={variable} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', variable)} onClick={() => insertTemplateVariable(variable)}>{variable}</button>
                    ))}
                  </div>
                </div>
                <div className="template-workspace">
                  <nav className="template-nav" aria-label="Alert templates">
                    {templateDefinitions.map(([key, label]) => (
                      <button type="button" className={`template-nav-btn ${activeTemplateKey === key ? 'active' : ''}`} key={key} onClick={() => { setActiveTemplateKey(key); setFocusedTemplateField(null); }}>
                        <span>{label}</span>
                      </button>
                    ))}
                  </nav>
                  <div className="template-editor-panel">
                    {(() => {
                      const activeTemplate = templateDefinitions.find(([key]) => key === activeTemplateKey) || templateDefinitions[0];
                      const [key, label] = activeTemplate;
                      const title = draftSettings[`${key}_title`] || '';
                      const body = draftSettings[`${key}_body`] || '';
                      return (
                        <>
                          <div className="template-editor-block">
                            <div className="template-editor-heading"><span>{label.toUpperCase()}</span></div>
                            <span className="template-field-label">SUBJECT / TITLE</span>
                            <TemplateField className={`template-input template-edit-block ${templateDropTarget === 'title' ? 'drop-active' : ''}`} value={title} onFocus={() => setFocusedTemplateField('title')} onDragOver={(e) => e.preventDefault()} onDragEnter={() => setTemplateDropTarget('title')} onDragLeave={() => setTemplateDropTarget(null)} onDrop={(e) => handleTemplateDrop(e, 'title')} onChange={(value) => setDraftSettings({ ...draftSettings, [`${key}_title`]: value })} />
                            <span className="template-field-label">MESSAGE BODY</span>
                            <TemplateField className={`template-textarea template-edit-block ${templateDropTarget === 'body' ? 'drop-active' : ''}`} value={body} onFocus={() => setFocusedTemplateField('body')} onDragOver={(e) => e.preventDefault()} onDragEnter={() => setTemplateDropTarget('body')} onDragLeave={() => setTemplateDropTarget(null)} onDrop={(e) => handleTemplateDrop(e, 'body')} onChange={(value) => setDraftSettings({ ...draftSettings, [`${key}_body`]: value })} />
                            <div className="settings-save-row"><button className="btn btn-accent" onClick={handleSaveDraft} disabled={saveStatus === 'saving'}>{saveStatus === 'saved' ? '✓ Saved' : 'Save Templates'}</button></div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {activeSettingsTab === 'logging' && (
              <div className="logging-page">
                <div className="logging-summary">
                  <span>APPLICATION LOG</span>
                  <strong>{logs.entries.length} recent entries</strong>
                </div>
                <pre className="logging-output">{logs.entries.length ? logs.entries.join('\n') : 'No application log entries yet.'}</pre>
                <div className="logging-actions">
                  <button className="btn" onClick={fetchLogs}>Refresh Logs</button>
                  <button className="btn logging-clear-btn" onClick={clearLogs}>Clear Application Logs</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="main">
        <div className="bento-grid">

          {/* Card 1: CPU Metrics */}
          <div className="panel bento-card span-12 cpu-metrics-card">
            <div className="stat-label" style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>CPU Metrics</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text2)', fontFamily: 'DM Mono' }}>{systemMetrics.cpu_name || 'Detecting CPU...'}</span>
            </div>
            <div className="cpu-metrics-inner" style={{ display: 'grid', gridTemplateColumns: '160px 1.2fr 3.8fr', gap: '2rem', alignItems: 'center' }}>

              <div className="cpu-gauge-wrap">
                <svg className="cpu-gauge-svg" viewBox="0 0 200 115" width="150" height="86">
                  <path d="M 22,108 A 78,78 0 0 1 178,108" fill="none" stroke="var(--surface3)" strokeWidth="13" strokeLinecap="round" />
                  <path
                    d="M 22,108 A 78,78 0 0 1 178,108"
                    fill="none"
                    stroke={systemMetrics.cpu > 80 ? 'var(--down)' : systemMetrics.cpu > 50 ? 'var(--degraded)' : 'var(--up)'}
                    strokeWidth="13"
                    strokeLinecap="round"
                    strokeDasharray="245"
                    strokeDashoffset={245 * (1 - (systemMetrics.cpu || 0) / 100)}
                  />
                  <text x="100" y="100" textAnchor="middle" fontFamily="Syne,sans-serif" fontSize="26" fontWeight="800" fill="var(--text)">
                    {Math.round(systemMetrics.cpu)}%
                  </text>
                  <text x="100" y="113" textAnchor="middle" fontFamily="DM Mono,monospace" fontSize="8" fill="var(--text3)">CPU LOAD</text>
                </svg>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', justifyContent: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: 'DM Mono' }}>Temperature</span>
                  <span className="stat-value" style={{ fontSize: '1.2rem', fontWeight: '700' }}>
                    {systemMetrics.temp?.cpu ? `${Math.round(systemMetrics.temp.cpu)}°C` : 'N/A'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: 'DM Mono' }}>Pressure</span>
                  <span className={`badge ${systemMetrics.cpu > 80 ? 'offline' : systemMetrics.cpu > 50 ? 'degraded' : 'online'}`} style={{ fontSize: '0.62rem', padding: '2px 10px' }}>
                    {systemMetrics.cpu > 80 ? 'High' : systemMetrics.cpu > 50 ? 'Moderate' : 'Low'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: 'DM Mono' }}>Cores</span>
                  <span style={{ fontSize: '0.8rem', fontFamily: 'DM Mono', color: 'var(--text2)', fontWeight: '600' }}>
                    {systemMetrics.cpu_cores ? `${systemMetrics.cpu_cores.length / 2}C / ${systemMetrics.cpu_cores.length}T` : '6C / 12T'}
                  </span>
                </div>
              </div>

              <div style={{ width: '100%' }}>
                <span style={{ fontSize: '0.6rem', color: 'var(--text3)', fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '6px' }}>Core Utilization</span>
                {systemMetrics.cpu_cores && systemMetrics.cpu_cores.length > 0 ? (
                  <div className="core-bar-grid" style={{ width: '100%' }}>
                    {systemMetrics.cpu_cores.map((core, i) => (
                      <div key={i} className="core-bar-item" title={`Core ${i}: ${Math.round(core)}%`}>
                        <div className="core-bar-track">
                          <div
                            className="core-bar-fill"
                            style={{
                              height: `${Math.max(core, 2)}%`,
                              background: core > 80 ? 'var(--down)' : core > 50 ? 'var(--degraded)' : 'var(--up)'
                            }}
                          />
                        </div>
                        <span className="core-bar-label">C{i}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text3)', fontSize: '0.7rem', fontFamily: 'DM Mono' }}>No core data</div>
                )}
              </div>

            </div>
            <div className="cpu-pressure-meta">
              <span>CPU PRESSURE / 10 MIN AVG</span>
              <strong>{systemMetrics.cpu_pressure == null ? 'N/A' : `${Number(systemMetrics.cpu_pressure).toFixed(2)}%`}</strong>
            </div>
            <div className="cpu-pressure-chart" aria-label="CPU pressure history">
              <Line data={pressureChartData} options={pressureChartOptions} />
            </div>
          </div>

          {/* Card 2: RAM Metrics */}
          <div className="panel bento-card span-4" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="stat-label">RAM Metrics</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 2px' }}>
                <span className="stat-value" style={{ fontSize: '1.8rem', fontWeight: '800' }}>{Math.round(systemMetrics.memory.percent)}%</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text3)', fontFamily: 'DM Mono' }}>{systemMetrics.memory.used} / {systemMetrics.memory.total} GB</span>
              </div>
              <div className="latency-bar" style={{ height: '5px', margin: '2px 0' }}>
                <div className="latency-fill" style={{ width: `${Math.round(systemMetrics.memory.percent)}%`, background: systemMetrics.memory.percent < 50 ? 'var(--up)' : systemMetrics.memory.percent < 80 ? 'var(--lan)' : 'var(--down)' }}></div>
              </div>
            </div>
            <div className="sparkline-wrap" style={{ height: '80px', marginTop: '6px' }}>
              <Line data={memoryChartData} options={sparklineOptions} />
            </div>
          </div>

          {/* Card 3: GPU Metrics */}
          <div className="panel bento-card span-4" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>GPU Metrics</span>
              {systemMetrics.gpu_name && <span style={{ fontSize: '0.58rem', color: 'var(--text2)', fontFamily: 'DM Mono' }}>{systemMetrics.gpu_name}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 2px' }}>
              <span className="stat-value" style={{ fontSize: '1.8rem', fontWeight: '800' }}>{systemMetrics.gpu ? `${Math.round(systemMetrics.gpu.util)}%` : 'N/A'}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text3)', fontFamily: 'DM Mono' }}>{systemMetrics.temp?.gpu ? `${Math.round(systemMetrics.temp.gpu)}°C` : 'Temp N/A'}</span>
            </div>
            <div className="latency-bar" style={{ height: '5px', margin: '2px 0' }}>
              <div className="latency-fill" style={{ width: `${systemMetrics.gpu ? Math.round(systemMetrics.gpu.util) : 0}%`, background: systemMetrics.gpu && systemMetrics.gpu.util > 80 ? 'var(--down)' : 'var(--up)' }}></div>
            </div>
            <div className="sparkline-wrap" style={{ height: '80px', marginTop: '6px' }}>
              <Line data={gpuChartData} options={sparklineOptions} />
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text3)', fontFamily: 'DM Mono', marginTop: '4px' }}>
              {systemMetrics.gpu ? `VRAM: ${systemMetrics.gpu.memory.used}/${systemMetrics.gpu.memory.total} GB` : 'No GPU detected'}
            </div>
          </div>

          {/* Card 4: Storage */}
          <div className="panel bento-card span-4" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="stat-label">Storage</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '8px 0 2px' }}>
              <span className="stat-value" style={{ fontSize: '1.8rem', fontWeight: '800' }}>{Math.round(systemMetrics.total_storage?.percent || 0)}%</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text3)', fontFamily: 'DM Mono' }}>{Math.round(systemMetrics.total_storage?.used || 0)} / {Math.round(systemMetrics.total_storage?.total || 0)} GB</span>
            </div>
            <div className="latency-bar" style={{ height: '5px', margin: '2px 0' }}>
              <div className="storage-bar" style={{ width: `${Math.round(systemMetrics.total_storage?.percent || 0)}%`, height: '100%', backgroundColor: (systemMetrics.total_storage?.percent || 0) < 80 ? 'var(--up)' : 'var(--slow)' }}></div>
            </div>
            <div className="sparkline-wrap">
              <Line
                data={{
                  labels: ramHistory.map(h => h.time),
                  datasets: [{ data: ramHistory.map(() => Math.round(systemMetrics.total_storage?.percent || 0)), borderColor: '#2f6fc8', borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: false }]
                }}
                options={sparklineOptions}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text3)', marginTop: '4px' }}>
              <span style={{ fontFamily: 'DM Mono' }}>Free Space</span>
              <span style={{ fontFamily: 'DM Mono' }}>{Math.round(systemMetrics.total_storage?.free || 0)} GB</span>
            </div>
          </div>

          {/* Card 8: Server Outages + Response Time + Avg Latency */}
          <div className="stat-card neutral span-12 response-time-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1.25rem', maxHeight: '160px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '8px' }}>
                <div style={{ minWidth: '130px' }} className="stat-label">Server Outages</div>
                <div style={{ flex: 1, paddingLeft: '1.5rem' }} className="stat-label">Response Time</div>
                <div style={{ minWidth: '130px', textAlign: 'right' }} className="stat-label">Avg Latency</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flex: 1, width: '100%', gap: '2rem' }}>
                <div style={{ minWidth: '130px' }}>
                  <div className="stat-value" style={{ fontSize: '1.8rem', fontWeight: '800', lineHeight: 1 }}>
                    {(stats.network_outages || 0) + (stats.power_outages || 0)}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '0.58rem', color: 'var(--text2)', fontFamily: 'DM Mono', marginTop: '6px' }}>
                    <span>Net: {stats.network_outages || 0}</span>
                    <span>Power: {stats.power_outages || 0}</span>
                  </div>
                </div>

                <div style={{ flex: 1, height: '70px', alignSelf: 'stretch' }}>
                  <Line data={latencyChartData} options={responseTimeOptions} />
                </div>

                <div style={{ textAlign: 'right', minWidth: '130px' }}>
                  <div className="stat-value" style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--accent)', lineHeight: 1 }}>
                    {formatLatency(stats.avg_latency)}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Card 9: Site Outages Dial */}
          <div className="dial-card span-4">
            <div className="dial-label">Site Outages</div>
            <svg className="dial-svg" width="180" height="120" viewBox="0 0 200 130">
              <path d="M30,120 A70,70,0,0,1,170,120" fill="none" stroke="var(--surface3)" strokeWidth="12" strokeLinecap="round" />
              <path d="M30,120 A70,70,0,0,1,170,120" fill="none" stroke="var(--down)" strokeWidth="12" strokeLinecap="round" strokeDasharray={arc} style={getDialStyle((stats.total_outages / 28) * 100)} />
              <text x="100" y="115" textAnchor="middle" fontFamily="Syne,sans-serif" fontSize="22" fontWeight="800" fill="var(--text)">{stats.total_outages}</text>
              <text x="100" y="130" textAnchor="middle" fontFamily="DM Mono,sans-serif" fontSize="8" fill="var(--text2)">last 24h</text>
            </svg>
          </div>

          {/* Card 10: Network Throughput */}
          <div className="panel bento-card span-8" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="stat-label" style={{ marginBottom: '6px' }}>Network Throughput</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'DM Mono', marginTop: '4px' }}>
                <span style={{ color: 'var(--up)' }}>▼ DN: {(() => {
                  const bytes = systemMetrics.network_rates?.rx || 0;
                  if (bytes === 0) return '0 B/s';
                  const k = 1024;
                  const sizes = ['B/s', 'KiB/s', 'MiB/s', 'GiB/s'];
                  const i = Math.floor(Math.log(bytes) / Math.log(k));
                  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
                })()}</span>
                <span style={{ color: 'var(--down)' }}>▲ UP: {(() => {
                  const bytes = systemMetrics.network_rates?.tx || 0;
                  if (bytes === 0) return '0 B/s';
                  const k = 1024;
                  const sizes = ['B/s', 'KiB/s', 'MiB/s', 'GiB/s'];
                  const i = Math.floor(Math.log(bytes) / Math.log(k));
                  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
                })()}</span>
              </div>
              <div className="network-total-row">
                <span>24H DN: {formatBytes(systemMetrics.network_totals?.rx || 0)}</span>
                <span>24H UP: {formatBytes(systemMetrics.network_totals?.tx || 0)}</span>
              </div>
            </div>
            <div style={{ height: '70px', marginTop: '8px' }}>
              <Line
                data={{
                  labels: netHistory.map(h => h.time),
                  datasets: [
                    { label: 'Download', data: netHistory.map(h => h.rx), borderColor: '#2fa87e', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false },
                    { label: 'Upload', data: netHistory.map(h => h.tx), borderColor: '#c84b2f', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false }, tooltip: { enabled: false } },
                  scales: {
                    x: { display: false, border: { color: 'transparent' } },
                    y: { display: false, border: { color: 'transparent' } }
                  }
                }}
              />
            </div>
          </div>

          {/* Active Processes */}
          <div className="panel span-12" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="panel-header" style={{ padding: '1.25rem 1.25rem 0.5rem 1.25rem', borderBottom: 'none' }}>
              <span className="panel-title">Active Processes</span>
            </div>
            <div className="proc-list-container" style={{ overflowY: 'auto', padding: '0 1.25rem 1.25rem 1.25rem', fontSize: '0.68rem', fontFamily: 'DM Mono', maxHeight: '280px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--text2)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text3)' }}>
                    <th style={{ padding: '4px 0' }}>PID</th>
                    <th>CMD</th>
                    <th>USER</th>
                    <th style={{ textAlign: 'right' }}>MEM</th>
                    <th style={{ textAlign: 'right' }}>CPU</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.map((proc, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(200,200,200,0.02)' }}>
                      <td style={{ padding: '4px 0', color: 'var(--accent)' }}>{proc.pid}</td>
                      <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={proc.name}>{proc.name}</td>
                      <td>{proc.user}</td>
                      <td style={{ textAlign: 'right' }}>{proc.mem}M</td>
                      <td className="proc-cpu-cell" style={{ textAlign: 'right', minWidth: '48px' }}>
                        <div
                          className="proc-cpu-fill"
                          style={{
                            width: `${Math.min(proc.cpu, 100)}%`,
                            background: proc.cpu > 50 ? 'rgba(200, 75, 47, 0.15)' : 'rgba(47, 168, 126, 0.15)'
                          }}
                        />
                        <span style={{ position: 'relative', zIndex: 1, fontWeight: proc.cpu > 10 ? '700' : '400' }}>
                          {proc.cpu}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monitored Sites List */}
          <div className="panel span-12">
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  Monitored Sites
                  <span style={{ color: '#2fa87e', fontWeight: 'bold', fontSize: '0.85rem', background: 'rgba(47,168,126,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                    {sites.filter(s => s.status === 'online').length}
                  </span>
                  <span style={{ color: '#c84b2f', fontWeight: 'bold', fontSize: '0.85rem', background: 'rgba(200,75,47,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                    {sites.filter(s => s.status !== 'online').length}
                  </span>
                </span>
              </div>
              <button
                className="btn btn-accent"
                onClick={() => { setEditingSite(null); setNewSite({ name: '', url: '', icon: '' }); setIsModalOpen(true); }}
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              >
                + Add Site
              </button>
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
                    <div className={`status-dot ${site.status === 'success' ? 'online' : site.status === 'lan_up' ? 'lan' : site.status === 'slow' ? 'degraded' : 'offline'}`}
                      title={site.status === 'lan_up' ? 'Reachable via LAN' : site.status === 'slow' ? 'Degraded' : site.status === 'success' ? 'Online' : 'Offline'}></div>
                    <div>
                      <div className="site-name">
                        <Icon name={site.icon} size={18} style={{ marginRight: '8px', color: 'var(--text2)' }} />
                        {site.name}
                      </div>
                      <div className="site-url">{site.url ? site.url.replace(/^https?:\/\//, '') : ''}</div>
                      {Array.isArray(site.history) && site.history.length > 0 && (
                        <div className="site-history-dots">
                          {site.history.slice(-20).map((h, i) => (
                            <div
                              key={i}
                              className={`history-dot ${h?.status === 'success' ? 'dot-up' : h?.status === 'slow' ? 'dot-slow' : h?.status === 'lan_up' ? 'dot-up' : h ? 'dot-down' : 'dot-unknown'}`}
                              title={h?.status || 'unknown'}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={`badge ${site.status === 'success' ? 'online' : site.status === 'lan_up' ? 'lan' : site.status === 'slow' ? 'degraded' : 'offline'}`}>
                      {site.status === 'success' ? 'Online' : site.status === 'lan_up' ? 'LAN' : site.status === 'slow' ? 'Slow' : 'Offline'}
                    </div>
                    <div className="ping-val">{site.latency ? `${Math.round(site.latency)}ms` : '—'}</div>
                    <div>
                      <div className="latency-bar" style={site.status === 'lan_up' ? { border: '2px dotted #2fa87e', background: 'transparent' } : {}}>
                        <div
                          className="latency-fill"
                          style={{
                            width: site.status === 'lan_up' ? '0%' : `${Math.max(0, 100 - Math.min((site.latency || 0) / 30, 100))}%`,
                            background: site.status === 'lan_up' ? 'transparent' : (site.latency || 0) >= 3000 ? 'var(--down)' : (site.latency || 0) >= 2000 ? 'var(--degraded)' : 'var(--up)',
                            border: 'none'
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
                      <button className="delete-btn" onClick={() => handleEditSite(site)} title="Edit"><Pencil size={12} /></button>
                      <button className="delete-btn" onClick={() => handleDeleteSite(site.id, site.name)} title="Remove"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Drives Monitoring */}
          <div className="panel bento-card span-12">
            <div className="stat-label" style={{ marginBottom: '1.25rem' }}>Drives Monitoring</div>
            <div className="drives-grid">
              {drives.map((drive, idx) => {
                const isFailed = drive.status.toLowerCase() === 'failed';
                const usedPct = drive.used_pct ?? 0;
                const diskColor = usedPct > 85 ? 'var(--down)' : usedPct > 75 ? 'var(--degraded)' : usedPct > 60 ? 'var(--lan)' : 'var(--up)';
                const isLeftCol = idx % 2 === 0;
                const borderStyle = isLeftCol
                  ? { borderLeft: `5px solid ${diskColor}`, borderRight: '1px solid var(--border)' }
                  : { borderRight: `5px solid ${diskColor}`, borderLeft: '1px solid var(--border)' };
                return (
                  <div key={idx} className={`drive-card ${isFailed ? 'failed' : ''}`} style={borderStyle}>
                    <div className="drive-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="drive-title-area">
                        <div className="drive-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{drive.device} - {drive.model}</span>
                          <button onClick={() => renameDrive(drive.device, drive.model)} className="drive-rename-btn" title="Rename Drive">
                            <Pencil size={11} />
                          </button>
                        </div>
                        <div className="drive-updated">Last Updated on {drive.last_updated}</div>
                      </div>
                      <div className="drive-status-small" style={{ color: isFailed ? 'var(--down)' : 'var(--up)' }}>
                        {isFailed ? <AlertTriangle size={16} strokeWidth={2.0} /> : <Check size={16} strokeWidth={2.5} />}
                      </div>
                    </div>

                    <div className="drive-body-row">
                      <div className="drive-metrics-grid">
                        <div className="drive-metric-col">
                          <span className="drive-metric-label">S.M.A.R.T</span>
                          <span className="drive-metric-value" style={{ color: isFailed ? 'var(--down)' : 'var(--up)', fontWeight: '600', fontSize: '1.15rem' }}>
                            {isFailed ? 'FAILED' : 'PASSED'}
                          </span>
                        </div>
                        <div className="drive-metric-col">
                          <span className="drive-metric-label">Temperature</span>
                          <span className="drive-metric-value">
                            {drive.temperature !== null && drive.temperature !== undefined ? `${drive.temperature}°C` : 'N/A'}
                          </span>
                        </div>
                        <div className="drive-metric-col">
                          <span className="drive-metric-label">Capacity</span>
                          <div>
                            <span className="drive-metric-value">
                              {(() => {
                                const cap = drive.capacity;
                                if (!cap) return 'N/A';
                                const match = cap.match(/^([\d.]+)\s*([a-zA-Z]+)$/);
                                if (match) return `${Math.round(parseFloat(match[1]))} ${match[2]}`;
                                return cap;
                              })()}
                            </span>
                            {usedPct >= 0 && (
                              <div className="drive-storage-bar">
                                <div className="drive-storage-fill" style={{ width: `${Math.round(usedPct)}%`, background: diskColor }} />
                              </div>
                            )}
                            {usedPct >= 0 && <span style={{ fontSize: '0.55rem', color: 'var(--text3)', fontFamily: 'DM Mono' }}>{Math.round(usedPct)}% used</span>}
                          </div>
                        </div>
                        <div className="drive-metric-col">
                          <span className="drive-metric-label">Powered On</span>
                          <span className="drive-metric-value">{drive.powered_on}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay open" onClick={(e) => e.target.className.includes('modal-overlay') && setIsModalOpen(false)}>
          <div className="modal">
            <h2>{editingSite ? 'Edit site' : 'Add a site'}</h2>
            <p>{editingSite ? 'Update the name or URL.' : "Enter a name and URL — we'll check it every minute."}</p>
            <div className="form-group">
              <label>Select Icon</label>
              <div className="icon-grid">
                {ICONS.map(icon => (
                  <button key={icon} className={`icon-btn ${newSite.icon === icon ? 'active' : ''}`} onClick={() => setNewSite({ ...newSite, icon })}>
                    <Icon name={icon} size={20} />
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Site Name</label>
              <input type="text" value={newSite.name} onChange={(e) => setNewSite({ ...newSite, name: e.target.value })} placeholder="e.g. My Portfolio" />
            </div>
            <div className="form-group">
              <label>URL</label>
              <input type="url" value={newSite.url} onChange={(e) => setNewSite({ ...newSite, url: e.target.value })} placeholder="https://example.com" />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => { setIsModalOpen(false); setEditingSite(null); setNewSite({ name: '', url: '', icon: 'Globe' }); }}>Cancel</button>
              <button className="btn btn-accent" onClick={handleAddSite}>{editingSite ? 'Save Changes' : 'Add Site'}</button>
            </div>
          </div>
        </div>
      )}

      {isRenameModalOpen && (
        <div className="modal-overlay open" onClick={(e) => e.target.className.includes('modal-overlay') && setIsRenameModalOpen(false)}>
          <div className="modal">
            <h2>Rename Drive</h2>
            <p>Assign a custom friendly name to device <strong>{renameDevice}</strong>.</p>
            <div className="form-group">
              <label>Custom Name</label>
              <input type="text" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} placeholder="e.g. SSD Storage" />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setIsRenameModalOpen(false)}>Cancel</button>
              <button className="btn btn-accent" onClick={handleSaveRename}>Save Name</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;