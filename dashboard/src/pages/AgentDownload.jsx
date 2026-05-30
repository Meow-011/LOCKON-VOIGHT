/**
 * Agent Download Page — Public page for downloading the VOIGHT Sentinel agent.
 * This page does NOT require authentication.
 */

import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  Box, Typography, Card, CardContent, Button, alpha, Chip, CircularProgress, Alert, Tabs, Tab, Collapse, TextField
} from '@mui/material';
import { Download, Terminal as TermIcon, Copy, Check, ShieldAlert, Activity, Network, Cpu, EyeOff, Search, Globe } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const COLORS = {
  bgDeep: '#000000', bgCard: '#0d0d0d', bgSurface: '#141414',
  border: '#222222', borderLight: '#333333',
  textPrimary: '#ffffff', textSecondary: '#888888', textMuted: '#555555',
  accent: '#ea580c', green: '#22c55e', red: '#ef4444', yellow: '#eab308',
};

const PLATFORMS = [
  { key: 'windows', label: 'Windows', icon: '/Icons/Windows.svg', file: 'voight-sentinel-windows-bundle.zip', size: '~14 MB', color: '#3b82f6' },
  { key: 'linux', label: 'Linux', icon: '/Icons/Linux.svg', file: 'voight-sentinel-linux-bundle.zip', size: '~5 MB', color: '#f97316' },
  { key: 'macos', label: 'macOS', icon: '/Icons/Apple.svg', file: 'voight-sentinel-darwin-bundle.zip', size: '~5 MB', color: '#d946ef' },
];


const STEPS = {
  windows: [
    { step: 1, text: 'Download voight-sentinel-windows-bundle.zip' },
    { step: 2, text: 'Extract the archive to a folder' },
    { step: 3, text: 'Open config.json and set your "team_name" (Do not change the competition_key)', hasConfigExample: true },
    { step: 4, text: 'Double-click voight-sentinel.exe to run (Accept the Administrator prompt)' },
    { step: 5, text: 'Return to the Dashboard to verify your agent is ONLINE' },
  ],
  linux: [
    { step: 1, text: 'Download voight-sentinel-linux-bundle.zip' },
    { step: 2, text: 'Extract the archive' },
    { step: 3, text: 'Open config.json and set your "team_name" (Do not change the competition_key)', hasConfigExample: true },
    { step: 4, text: 'Make it executable', cmd: 'chmod +x voight-sentinel' },
    { step: 5, text: 'Run the agent with root privileges', cmd: 'sudo ./voight-sentinel' },
    { step: 6, text: 'Return to the Dashboard to verify your agent is ONLINE' },
  ],
  macos: [
    { step: 1, text: 'Download voight-sentinel-darwin-bundle.zip' },
    { step: 2, text: 'Extract the archive' },
    { step: 3, text: 'Open config.json and set your "team_name" (Do not change the competition_key)', hasConfigExample: true },
    { step: 4, text: 'Make it executable', cmd: 'chmod +x voight-sentinel-darwin' },
    { step: 5, text: 'Run the agent with root privileges', cmd: 'sudo ./voight-sentinel-darwin' },
    { step: 6, text: 'Return to the Dashboard to verify your agent is ONLINE' },
  ],
};

const JSON_PROCESSES = `{
  "event": "process_scan",
  "pid": 4512,
  "name": "cheatengine.exe",
  "cmdline": "C:\\\\Program Files\\\\Cheat Engine\\\\cheatengine.exe --silent",
  "memory_usage_mb": 142.5,
  "started_at": "2026-05-01T15:00:23Z"
}`;

const JSON_NETWORK = `{
  "event": "network_scan",
  "protocol": "TCP",
  "local_address": "192.168.1.45:4444",
  "remote_address": "104.21.55.2:80",
  "state": "ESTABLISHED",
  "process_id": 4512
}`;

const JSON_FINGERPRINT = `{
  "event": "system_info",
  "hostname": "LAPTOP-X900",
  "os": "Windows 11 Pro",
  "architecture": "x86_64",
  "mac_address": "00:1A:2B:3C:4D:5E",
  "hardware_id": "bcf52e78...a388a"
}`;

const JSON_FILE_SYSTEM = `{
  "event": "file_scan",
  "file_path": "C:\\\\Users\\\\Bob\\\\Downloads\\\\mistral-7b-v0.1.Q4_K_M.gguf",
  "file_size_mb": 4200.5,
  "file_type": "GGUF Model",
  "scanned_at": "2026-05-01T15:10:00Z"
}`;

const JSON_DNS = `{
  "event": "dns_cache",
  "domain": "api.openai.com",
  "resolved_ip": "104.18.3.161",
  "record_type": "A",
  "ttl": 300,
  "timestamp": "2026-05-01T15:12:45Z"
}`;

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button size="small" onClick={handleCopy} sx={{
      minWidth: 32, p: 0.5, color: copied ? COLORS.green : COLORS.textMuted,
      '&:hover': { color: COLORS.accent },
    }}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </Button>
  );
}

function TelemetryItem({ title, description, icon, payload }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Box>
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{ display: 'flex', gap: 3, cursor: 'pointer', '&:hover .title': { color: COLORS.accent }, transition: 'all 0.2s' }}
      >
        <Box sx={{ mt: 0.5, color: COLORS.accent }}>{icon}</Box>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Typography className="title" sx={{ color: COLORS.textPrimary, fontWeight: 700, transition: 'color 0.2s' }}>{title}</Typography>
            <Typography sx={{ color: COLORS.textMuted, fontSize: '0.65rem', fontFamily: 'monospace', '&:hover': { color: COLORS.textPrimary } }}>
              {expanded ? '[- HIDE JSON]' : '[+ VIEW JSON]'}
            </Typography>
          </Box>
          <Typography sx={{ color: COLORS.textMuted, fontSize: '0.85rem' }}>{description}</Typography>
        </Box>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ ml: 6, mt: 2, p: 2, bgcolor: '#000', border: `1px solid ${COLORS.borderLight}` }}>
          <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.65rem', fontWeight: 800, mb: 1, letterSpacing: '0.1em' }}>RAW JSON PAYLOAD</Typography>
          <Typography sx={{ color: COLORS.green, fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>{payload}</Typography>
        </Box>
      </Collapse>
    </Box>
  );
}

function StepItem({ s, isLast }) {
  const [showConfig, setShowConfig] = useState(false);
  const [compKey, setCompKey] = useState("GLOBAL_COMP_KEY_12345");

  useEffect(() => {
    // Fetch public config from API (no auth required)
    axios.get('/api/settings/public')
      .then(res => {
        if (res.data && res.data.competitionKey) {
          setCompKey(res.data.competitionKey);
        }
      })
      .catch(err => console.error(err));
  }, []);

  return (
    <Box sx={{ p: 2.5, borderBottom: isLast ? 'none' : `1px solid ${COLORS.border}`, '&:hover': { bgcolor: alpha(COLORS.accent, 0.03) } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: s.cmd || s.hasConfigExample ? 1.5 : 0 }}>
        <Box sx={{ width: 24, height: 24, bgcolor: COLORS.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Typography sx={{ color: '#000', fontWeight: 900, fontSize: '0.7rem' }}>{s.step}</Typography>
        </Box>
        <Typography sx={{ color: COLORS.textPrimary, fontSize: '0.85rem', fontWeight: 500, flex: 1 }}>{s.text}</Typography>

        {s.hasConfigExample && (
          <Typography
            onClick={() => setShowConfig(!showConfig)}
            sx={{ color: COLORS.textMuted, fontSize: '0.65rem', fontFamily: 'monospace', cursor: 'pointer', '&:hover': { color: COLORS.accent }, flexShrink: 0 }}
          >
            {showConfig ? '[- HIDE EXAMPLE]' : '[+ VIEW EXAMPLE]'}
          </Typography>
        )}
      </Box>

      {s.cmd && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 5, bgcolor: '#000', border: `1px solid ${COLORS.borderLight}`, px: 2, py: 1 }}>
          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', color: COLORS.green, flex: 1 }}>
            $ {s.cmd}
          </Typography>
          <CopyButton text={s.cmd} />
        </Box>
      )}

      {s.hasConfigExample && (
        <Collapse in={showConfig}>
          <Box sx={{ ml: 5, p: 2, bgcolor: '#000', border: `1px solid ${COLORS.borderLight}` }}>
            <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.65rem', fontWeight: 800, mb: 1, letterSpacing: '0.1em' }}>config.json</Typography>
            <Box sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
              <span style={{ color: COLORS.textMuted }}>{`{\n`}</span>
              <span style={{ color: COLORS.textMuted }}>{`  "server_address": "${window.location.hostname}",\n`}</span>
              <span style={{ color: COLORS.textMuted }}>{`  "grpc_port": 50052,\n`}</span>
              <span style={{ color: COLORS.green }}>{`  "team_name": "`}</span><span style={{ color: COLORS.yellow, fontWeight: 'bold' }}>{`YOUR_TEAM_NAME_HERE`}</span><span style={{ color: COLORS.green }}>{`",\n`}</span>
              <span style={{ color: COLORS.green }}>{`  "contestant_name": "`}</span><span style={{ color: COLORS.yellow, fontWeight: 'bold' }}>{`YOUR_ALIAS_HERE`}</span><span style={{ color: COLORS.green }}>{`",\n`}</span>
              <span style={{ color: COLORS.textMuted }}>{`  "competition_key": "${compKey}",\n`}</span>
              <span style={{ color: COLORS.textMuted }}>{`  "use_tls": false\n`}</span>
              <span style={{ color: COLORS.textMuted }}>{`}`}</span>
            </Box>
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

export default function AgentDownloadPage() {
  const [selectedPlatform, setSelectedPlatform] = useState('windows');
  const [downloading, setDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [activeTab, setActiveTab] = useState('download');

  const platform = PLATFORMS.find(p => p.key === selectedPlatform);
  const steps = STEPS[selectedPlatform];

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadComplete(false);

    try {
      // Fetch the actual key from backend
      let compKey = "GLOBAL_COMP_KEY_12345";
      try {
        const res = await axios.get('/api/settings/public');
        if (res.data && res.data.competitionKey) {
          compKey = res.data.competitionKey;
        }
      } catch (err) {
        console.error("Failed to fetch settings from backend", err);
      }

      // Fetch the static ZIP template
      const response = await fetch(`/downloads/${platform.file}`);
      const blob = await response.blob();

      // Load it with JSZip
      const zip = await JSZip.loadAsync(blob);

      // Locate and modify config.json inside the ZIP
      const configObj = zip.file("config.json");
      if (configObj) {
        const configText = await configObj.async("string");
        try {
          // We ignore the existing JSON and create a fresh one in the exact order we want
          const orderedConfig = {
            server_address: window.location.hostname,
            grpc_port: 50052,
            team_name: "YOUR_TEAM_NAME_HERE",
            contestant_name: "YOUR_ALIAS_HERE",
            competition_key: compKey,
            use_tls: false
          };
          zip.file("config.json", JSON.stringify(orderedConfig, null, 2));
        } catch (err) {
          console.error("Failed to parse config.json inside ZIP", err);
        }
      }

      // Generate the new modified ZIP
      const content = await zip.generateAsync({ type: "blob" });

      // Simulate slight delay to make it feel like "packaging"
      setTimeout(() => {
        saveAs(content, platform.file);
        setDownloading(false);
        setDownloadComplete(true);
        setTimeout(() => setDownloadComplete(false), 4000);
      }, 1000);

    } catch (e) {
      console.error("Download failed:", e);
      setDownloading(false);
      toast.error("Failed to package the download bundle.");
    }
  };

  return (
    <Box sx={{ height: '100vh', overflowY: 'auto', bgcolor: COLORS.bgDeep, position: 'relative' }}>

      {/* Fixed Background Video */}
      <video
        autoPlay muted loop playsInline
        style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          objectFit: 'cover', zIndex: 0,
        }}
      >
        <source src="/Background/background.mp4" type="video/mp4" />
      </video>

      {/* Fixed Dark Overlay */}
      <Box sx={{
        position: 'fixed', inset: 0, zIndex: 1,
        background: `
          radial-gradient(ellipse at 50% 30%, ${alpha('#000', 0.5)} 0%, ${alpha('#000', 0.85)} 70%),
          rgba(0,0,0,0.6)
        `,
      }} />

      <Box sx={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8, px: 3, position: 'relative', zIndex: 2 }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 6, zIndex: 1, position: 'relative' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <Box sx={{ display: 'inline-flex' }}>
              <img src="/Logo.svg" alt="VOIGHT Logo" style={{ width: 220, height: 220, objectFit: 'contain' }} />
            </Box>
          </Box>
          <Typography variant="h3" sx={{
            fontWeight: 900, letterSpacing: '-0.02em', mb: 1, color: COLORS.textPrimary,
            fontSize: { xs: '1.8rem', md: '2.2rem' }
          }}>
            AGENT DOWNLOAD
          </Typography>

          {/* Navigation Tabs */}
          <Box sx={{ mt: 3, borderBottom: `1px solid ${COLORS.border}`, display: 'inline-block' }}>
            <Tabs value={activeTab} onChange={(e, val) => setActiveTab(val)}
              textColor="inherit"
              TabIndicatorProps={{ style: { backgroundColor: COLORS.accent, height: 3 } }}
              sx={{
                '& .MuiTab-root': { color: COLORS.textMuted, fontWeight: 700, fontFamily: 'monospace', fontSize: '0.85rem', px: 4 },
                '& .Mui-selected': { color: COLORS.textPrimary }
              }}
            >
              <Tab label="INSTALLATION" value="download" />
              <Tab label="DATA & PRIVACY" value="privacy" />
            </Tabs>
          </Box>
        </Box>

        {activeTab === 'download' && (
          <Box sx={{ width: '100%', maxWidth: 700, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Warning Box */}
            <Alert
              severity="warning"
              icon={<ShieldAlert size={24} />}
              sx={{
                bgcolor: alpha(COLORS.yellow, 0.1), color: COLORS.yellow, borderRadius: 0,
                border: `1px solid ${alpha(COLORS.yellow, 0.3)}`, width: '100%', maxWidth: 700, mb: 4,
                '& .MuiAlert-icon': { color: COLORS.yellow, alignItems: 'center' }
              }}
            >
              <Typography sx={{ fontWeight: 800, mb: 0.5 }}>ELEVATED PRIVILEGES REQUIRED</Typography>
              <Typography sx={{ fontSize: '0.85rem' }}>
                VOIGHT Sentinel must be run with <strong>Administrator/Root privileges</strong> to effectively monitor active processes and network telemetry.
              </Typography>
            </Alert>

            {/* Platform Selector */}
            <Box sx={{ display: 'flex', gap: 2, mb: 5, width: '100%', maxWidth: 700, zIndex: 1 }}>
              {PLATFORMS.map((p) => {
                const isSelected = selectedPlatform === p.key;
                return (
                  <Button key={p.key} onClick={() => setSelectedPlatform(p.key)}
                    sx={{
                      flex: 1, py: 3, borderRadius: 0, display: 'flex', flexDirection: 'column', gap: 1,
                      bgcolor: isSelected ? alpha(p.color, 0.1) : COLORS.bgCard,
                      border: `2px solid ${isSelected ? p.color : COLORS.border}`,
                      color: isSelected ? p.color : COLORS.textMuted,
                      '&:hover': { bgcolor: alpha(p.color, 0.05), borderColor: p.color },
                      transition: 'all 0.2s',
                    }}
                  >
                    <img
                      src={p.icon}
                      alt={p.label}
                      style={{
                        width: 32, height: 32, objectFit: 'contain',
                        filter: isSelected ? 'none' : 'grayscale(100%) opacity(50%)',
                        transition: 'filter 0.2s'
                      }}
                    />
                    <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', fontFamily: 'monospace' }}>{p.label}</Typography>
                    <Typography sx={{ fontSize: '0.6rem', color: COLORS.textMuted }}>{p.size}</Typography>
                  </Button>
                );
              })}
            </Box>



            {/* Download Button */}
            <Button variant="contained"
              onClick={handleDownload}
              disabled={downloading}
              sx={{
                bgcolor: downloadComplete ? COLORS.green : (platform?.color || COLORS.accent),
                color: '#fff', borderRadius: 0,
                fontWeight: 900, fontSize: '1.1rem', py: 2.5, px: 6, mb: 8, letterSpacing: '0.05em',
                fontFamily: 'monospace', zIndex: 1, minWidth: 280,
                '&:hover': {
                  bgcolor: downloadComplete ? COLORS.green : '#fff', color: '#000',
                },
                '&.Mui-disabled': {
                  bgcolor: alpha(platform?.color || COLORS.accent, 0.5), color: alpha('#fff', 0.8)
                },
                transition: 'all 0.2s',
              }}
            >
              {downloading ? (
                <CircularProgress size={22} sx={{ color: '#fff', mr: 1.5 }} />
              ) : downloadComplete ? (
                <Check size={22} style={{ marginRight: 12 }} />
              ) : (
                <Download size={22} style={{ marginRight: 12 }} />
              )}
              {downloading ? 'GENERATING BUNDLE...' : downloadComplete ? 'DOWNLOAD COMPLETE' : `DOWNLOAD BUNDLE`}
            </Button>

            {/* Installation Steps */}
            <Card sx={{
              bgcolor: COLORS.bgCard,
              border: `1px solid ${COLORS.border}`, borderRadius: 0, width: '100%', maxWidth: 700, zIndex: 1
            }}>
              <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgSurface, display: 'flex', alignItems: 'center', gap: 2 }}>
                <TermIcon size={18} color={platform?.color || COLORS.accent} />
                <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.1em', color: COLORS.textPrimary }}>
                  INSTALLATION INSTRUCTIONS - {selectedPlatform.toUpperCase()}
                </Typography>
              </Box>
              <CardContent sx={{ p: 0 }}>
                {steps.map((s, i) => (
                  <StepItem key={s.step} s={s} isLast={i === steps.length - 1} />
                ))}
              </CardContent>
            </Card>
          </Box>
        )}

        {activeTab === 'privacy' && (
          <Box sx={{ width: '100%', maxWidth: 700 }}>
            <Card sx={{ bgcolor: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 0, zIndex: 1 }}>
              <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgSurface, display: 'flex', alignItems: 'center', gap: 2 }}>
                <EyeOff size={18} color={COLORS.accent} />
                <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.1em', color: COLORS.textPrimary }}>
                  TELEMETRY DISCLOSURE
                </Typography>
              </Box>
              <CardContent sx={{ p: 4 }}>
                <Typography sx={{ color: COLORS.textSecondary, mb: 4, fontSize: '0.95rem', lineHeight: 1.6 }}>
                  VOIGHT Sentinel is designed with strict privacy boundaries. It only collects data necessary to ensure competition integrity and detect unauthorized tools. <strong>We do not monitor your personal files, keystrokes, or browser history.</strong>
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>

                  <TelemetryItem
                    title="Active Processes"
                    description="Monitors running executables, command-line arguments, and memory usage to detect unauthorized tools or scripts."
                    icon={<Activity size={24} />}
                    payload={JSON_PROCESSES}
                  />

                  <TelemetryItem
                    title="Network Connections"
                    description="Logs active IP connections and open ports to identify reverse shells, C2 communication, or unauthorized infrastructure access."
                    icon={<Network size={24} />}
                    payload={JSON_NETWORK}
                  />

                  <TelemetryItem
                    title="System Fingerprint"
                    description="Collects basic hardware ID, OS version, and hostname strictly for device identification and anti-spoofing measures."
                    icon={<Cpu size={24} />}
                    payload={JSON_FINGERPRINT}
                  />

                  <TelemetryItem
                    title="File System Scanning (Large Files)"
                    description="Scans the local filesystem for extremely large files (e.g. LLM models like .gguf, .safetensors) exceeding defined thresholds to prevent unauthorized offline AI assistance. We do not read the contents of your personal files, only metadata (path, size, and type)."
                    icon={<Search size={24} />}
                    payload={JSON_FILE_SYSTEM}
                  />

                  <TelemetryItem
                    title="Local DNS Cache Profiling"
                    description="Polls the local operating system DNS resolver cache to correlate resolved domains with network traffic, defeating CDN/Cloudflare IP masking techniques."
                    icon={<Globe size={24} />}
                    payload={JSON_DNS}
                  />

                </Box>
              </CardContent>
            </Card>
          </Box>
        )}

        {/* Footer */}
        <Box sx={{ mt: 6, textAlign: 'center' }}>
          <Typography sx={{ color: COLORS.textMuted, fontFamily: 'monospace', fontSize: '0.7rem' }}>
            LOCKON VOIGHT - INTEGRITY PROTOCOL AGENT
          </Typography>
          <Typography sx={{ color: COLORS.textMuted, fontFamily: 'monospace', fontSize: '0.6rem', mt: 0.5 }}>
            Do not tamper with or reverse-engineer this software. All activity is monitored.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
