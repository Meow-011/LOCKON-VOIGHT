/**
 * Settings Page — System configuration for LOCKON VOIGHT.
 */

import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Divider, Switch,
  Slider, TextField, Button, alpha, Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, InputAdornment
} from '@mui/material';
import { Settings as SettingsIcon, ShieldAlert, Webhook, Zap, Key, RefreshCw, AlertTriangle, Skull, Monitor, Send, Eye, EyeOff } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsAPI } from '../services/api';
import { COLORS } from '../theme/theme';

const DEFAULT_STATE = {
  sensitivity: 70,
  autoBan: false,
  webhook: 'https://discord.com/api/webhooks/...',
  scanInterval: 5,
  autoKillProcesses: false,
  webhookEnabled: false,
  webhookFormat: 'generic',
  webhookToken: '',
  screenBroadcastEnabled: false,
  screenCaptureInterval: 5
};

const getInitialState = () => {
  const saved = localStorage.getItem('voight_settings');
  if (saved) {
    try {
      return { ...DEFAULT_STATE, ...JSON.parse(saved) };
    } catch (e) {
      return DEFAULT_STATE;
    }
  }
  return DEFAULT_STATE;
};

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsAPI.get().then((r) => r.data),
  });

  const [sensitivity, setSensitivity] = useState(DEFAULT_STATE.sensitivity);
  const [autoBan, setAutoBan] = useState(DEFAULT_STATE.autoBan);
  const [webhook, setWebhook] = useState(DEFAULT_STATE.webhook);
  const [scanInterval, setScanInterval] = useState(DEFAULT_STATE.scanInterval);
  const [killSwitchConfirm, setKillSwitchConfirm] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [autoKillProcesses, setAutoKillProcesses] = useState(DEFAULT_STATE.autoKillProcesses);
  const [webhookEnabled, setWebhookEnabled] = useState(DEFAULT_STATE.webhookEnabled);
  const [webhookFormat, setWebhookFormat] = useState(DEFAULT_STATE.webhookFormat);
  const [webhookToken, setWebhookToken] = useState(DEFAULT_STATE.webhookToken);
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [screenBroadcastEnabled, setScreenBroadcastEnabled] = useState(DEFAULT_STATE.screenBroadcastEnabled);
  const [screenCaptureInterval, setScreenCaptureInterval] = useState(DEFAULT_STATE.screenCaptureInterval);
  const [lastWebhookStatus, setLastWebhookStatus] = useState(null);

  useEffect(() => {
    if (settingsData) {
      setSensitivity(settingsData.sensitivity);
      setAutoBan(settingsData.autoBan);
      setWebhook(settingsData.webhook);
      if (settingsData.scanInterval) setScanInterval(settingsData.scanInterval);
      if (settingsData.autoKillProcesses !== undefined) setAutoKillProcesses(settingsData.autoKillProcesses);
      if (settingsData.webhookEnabled !== undefined) setWebhookEnabled(settingsData.webhookEnabled);
      if (settingsData.webhookFormat) setWebhookFormat(settingsData.webhookFormat);
      if (settingsData.webhookToken !== undefined) setWebhookToken(settingsData.webhookToken || '');
      if (settingsData.screenBroadcastEnabled !== undefined) setScreenBroadcastEnabled(settingsData.screenBroadcastEnabled);
      if (settingsData.screenCaptureInterval) setScreenCaptureInterval(settingsData.screenCaptureInterval);
    }
  }, [settingsData]);

  const mutation = useMutation({
    mutationFn: (newState) => settingsAPI.update(newState),
    onSuccess: () => {
      queryClient.invalidateQueries(['settings']);
      setShowSnackbar(true);
    },
  });

  const testWebhookMutation = useMutation({
    mutationFn: () => settingsAPI.testWebhook(webhook, webhookFormat, webhookToken),
    onSuccess: (data) => {
      setLastWebhookStatus({ ok: true, time: new Date().toLocaleTimeString() });
      alert(`✅ Webhook test successful!\n${data.data?.message || ''}`);
    },
    onError: (err) => {
      setLastWebhookStatus({ ok: false, time: new Date().toLocaleTimeString() });
      const msg = err.response?.data?.detail || err.message;
      alert(`❌ Webhook test failed:\n${msg}`);
    }
  });

  if (isLoading) return null;

  const hasChanges = settingsData && (
    sensitivity !== settingsData.sensitivity || 
    autoBan !== settingsData.autoBan || 
    webhook !== settingsData.webhook ||
    scanInterval !== settingsData.scanInterval ||
    autoKillProcesses !== (settingsData.autoKillProcesses || false) ||
    webhookEnabled !== (settingsData.webhookEnabled || false) ||
    webhookFormat !== (settingsData.webhookFormat || 'generic') ||
    webhookToken !== (settingsData.webhookToken || '') ||
    screenBroadcastEnabled !== (settingsData.screenBroadcastEnabled || false) ||
    screenCaptureInterval !== (settingsData.screenCaptureInterval || 5)
  );

  const handleDeploy = () => {
    mutation.mutate({ sensitivity, autoBan, webhook, scanInterval, autoKillProcesses, webhookEnabled, webhookFormat, webhookToken, screenBroadcastEnabled, screenCaptureInterval });
  };

  return (
    <Box className="fade-in" sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
            <SettingsIcon size={28} color={COLORS.accent} />
            SYSTEM CONFIGURATION
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textMuted, mt: 1, fontFamily: 'monospace' }}>
            GLOBAL PROCTORING CONTROLS & ENVIRONMENT SECRETS
          </Typography>
        </Box>
      </Box>


      {/* AGENT SCAN FREQUENCIES */}
      <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgSurface, display: 'flex', alignItems: 'center', gap: 2 }}>
          <RefreshCw size={20} color={COLORS.accent} />
          <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>AGENT SCAN FREQUENCIES</Typography>
        </Box>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 4, p: 3 }}>
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: COLORS.textPrimary }}>PROCESS & NETWORK SCAN INTERVAL</Typography>
              <Typography variant="caption" sx={{ color: COLORS.accent, fontFamily: 'monospace', fontWeight: 800, bgcolor: alpha(COLORS.accent, 0.1), px: 1, py: 0.5 }}>
                [ CURRENT: {scanInterval} SECONDS ]
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: COLORS.textMuted, display: 'block', mb: 2 }}>
              How frequently the edge nodes analyze running processes and active network connections. Lower intervals increase detection speed but consume more contestant CPU.
            </Typography>
            <Slider
              value={scanInterval}
              onChange={(e, v) => setScanInterval(v)}
              min={1} max={30}
              marks={[
                { value: 1, label: '1s' },
                { value: 5, label: '5s' },
                { value: 15, label: '15s' },
                { value: 30, label: '30s' }
              ]}
              sx={{
                color: COLORS.accent,
                '& .MuiSlider-thumb': { borderRadius: 0, width: 12, height: 24 },
                '& .MuiSlider-rail': { bgcolor: COLORS.border, opacity: 1 },
                '& .MuiSlider-mark': { bgcolor: COLORS.textMuted, width: 2, height: 6 },
                '& .MuiSlider-markLabel': { color: COLORS.textMuted, fontFamily: 'monospace', fontSize: '0.65rem', mt: 0.5 }
              }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* CORE PROTOCOL */}
      <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgSurface, display: 'flex', alignItems: 'center', gap: 2 }}>
          <ShieldAlert size={20} color={COLORS.accent} />
          <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>CORE PROTOCOL</Typography>
        </Box>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 4, p: 3 }}>
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: COLORS.textPrimary }}>AUTOMATED MITIGATION THRESHOLD</Typography>
              <Typography variant="caption" sx={{ color: COLORS.accent, fontFamily: 'monospace', fontWeight: 800, bgcolor: alpha(COLORS.accent, 0.1), px: 1, py: 0.5 }}>
                [ CURRENT THRESHOLD: SCORE {sensitivity}+ ]
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: COLORS.textMuted, display: 'block', mb: 2 }}>
              Determines the Integrity Score required before the system automatically executes enforcement actions (if Master Switch is ON).
            </Typography>
            
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              {[
                { label: 'STRICT', val: 70, display: 'SCORE 70+' },
                { label: 'STANDARD', val: 80, display: 'SCORE 80+' },
                { label: 'RELAXED', val: 90, display: 'SCORE 90+' },
                { label: 'CRITICAL ONLY', val: 100, display: 'SCORE 100' }
              ].map(opt => (
                <Button 
                  key={opt.val}
                  onClick={() => setSensitivity(opt.val)}
                  sx={{ 
                    borderRadius: 0, px: 2, py: 0.5, border: `1px solid ${sensitivity === opt.val ? COLORS.accent : COLORS.borderLight}`,
                    bgcolor: sensitivity === opt.val ? alpha(COLORS.accent, 0.1) : 'transparent',
                    color: sensitivity === opt.val ? COLORS.accent : COLORS.textMuted,
                    fontWeight: 800, fontFamily: 'monospace',
                    '&:hover': { bgcolor: alpha(COLORS.accent, 0.2), borderColor: COLORS.accent }
                  }}>
                  {opt.label} ({opt.display})
                </Button>
              ))}
            </Box>
            
            <Box sx={{ bgcolor: alpha(COLORS.accent, 0.05), p: 1.5, borderLeft: `2px solid ${COLORS.accent}` }}>
              <Typography variant="caption" sx={{ color: COLORS.textSecondary, fontFamily: 'monospace', display: 'block' }}>
                {sensitivity === 70 && "STRICT: Zero tolerance. Auto-mitigates immediately when a node reaches 70 Integrity Score."}
                {sensitivity === 80 && "STANDARD: Balanced approach. Auto-mitigates when a node reaches 80 Integrity Score."}
                {sensitivity === 90 && "RELAXED: Highly lenient. Auto-mitigates only when a node reaches 90 Integrity Score."}
                {sensitivity === 100 && "CRITICAL ONLY: Auto-mitigates ONLY when a node hits maximum 100 (RED) Integrity Score."}
                {![70, 80, 90, 100].includes(sensitivity) && `CUSTOM: Auto-mitigates when a node reaches ${sensitivity} Integrity Score.`}
              </Typography>
            </Box>
          </Box>
          <Divider sx={{ borderColor: COLORS.borderLight }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, color: COLORS.textPrimary }}>MASTER SWITCH: AUTO-TRIGGER WARNING PAYLOADS</Typography>
              <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                If ON, the system will automatically deploy screen-lock warnings to nodes that hit the configured Integrity Score threshold above.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', border: `1px solid ${COLORS.borderLight}` }}>
              <Button 
                onClick={() => setAutoBan(true)}
                sx={{ 
                  borderRadius: 0, minWidth: 60, py: 0.5,
                  bgcolor: autoBan ? COLORS.green : 'transparent',
                  color: autoBan ? '#000' : COLORS.textMuted,
                  fontWeight: 800,
                  '&:hover': { bgcolor: autoBan ? COLORS.green : alpha(COLORS.green, 0.1) }
                }}>ON</Button>
              <Button 
                onClick={() => setAutoBan(false)}
                sx={{ 
                  borderRadius: 0, minWidth: 60, py: 0.5,
                  bgcolor: !autoBan ? COLORS.textSecondary : 'transparent',
                  color: !autoBan ? '#000' : COLORS.textMuted,
                  fontWeight: 800,
                  '&:hover': { bgcolor: !autoBan ? COLORS.textSecondary : alpha(COLORS.textSecondary, 0.1) }
                }}>OFF</Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* AUTOMATED REMEDIATION */}
      <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgSurface, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Skull size={20} color={COLORS.red} />
          <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>AUTOMATED REMEDIATION</Typography>
        </Box>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, color: COLORS.textPrimary }}>AUTO-KILL FLAGGED PROCESSES</Typography>
              <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                When enabled, the Agent will automatically terminate any process flagged by the detection engine (AI editors, local LLMs, AI agents, VMs, tunneling tools).
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', border: `1px solid ${COLORS.borderLight}` }}>
              <Button 
                onClick={() => setAutoKillProcesses(true)}
                sx={{ 
                  borderRadius: 0, minWidth: 60, py: 0.5,
                  bgcolor: autoKillProcesses ? COLORS.red : 'transparent',
                  color: autoKillProcesses ? '#fff' : COLORS.textMuted,
                  fontWeight: 800,
                  '&:hover': { bgcolor: autoKillProcesses ? COLORS.red : alpha(COLORS.red, 0.1) }
                }}>ON</Button>
              <Button 
                onClick={() => setAutoKillProcesses(false)}
                sx={{ 
                  borderRadius: 0, minWidth: 60, py: 0.5,
                  bgcolor: !autoKillProcesses ? COLORS.textSecondary : 'transparent',
                  color: !autoKillProcesses ? '#000' : COLORS.textMuted,
                  fontWeight: 800,
                  '&:hover': { bgcolor: !autoKillProcesses ? COLORS.textSecondary : alpha(COLORS.textSecondary, 0.1) }
                }}>OFF</Button>
            </Box>
          </Box>
          {autoKillProcesses && (
            <Box sx={{ bgcolor: alpha(COLORS.red, 0.08), p: 1.5, borderLeft: `2px solid ${COLORS.red}` }}>
              <Typography variant="caption" sx={{ color: COLORS.red, fontFamily: 'monospace', display: 'block', fontWeight: 700 }}>
                ⚠ WARNING: Auto-kill is ACTIVE. The Agent will forcefully terminate flagged processes on contestant machines without manual Proctor confirmation.
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* SCREEN BROADCASTING */}
      <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgSurface, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Monitor size={20} color={COLORS.accent} />
          <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>SCREEN BROADCASTING</Typography>
        </Box>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, color: COLORS.textPrimary }}>ENABLE SCREEN CAPTURE</Typography>
              <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                Agents will periodically capture and transmit screenshots of contestant screens to the Dashboard for Proctor review.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', border: `1px solid ${COLORS.borderLight}` }}>
              <Button 
                onClick={() => setScreenBroadcastEnabled(true)}
                sx={{ 
                  borderRadius: 0, minWidth: 60, py: 0.5,
                  bgcolor: screenBroadcastEnabled ? COLORS.green : 'transparent',
                  color: screenBroadcastEnabled ? '#000' : COLORS.textMuted,
                  fontWeight: 800,
                  '&:hover': { bgcolor: screenBroadcastEnabled ? COLORS.green : alpha(COLORS.green, 0.1) }
                }}>ON</Button>
              <Button 
                onClick={() => setScreenBroadcastEnabled(false)}
                sx={{ 
                  borderRadius: 0, minWidth: 60, py: 0.5,
                  bgcolor: !screenBroadcastEnabled ? COLORS.textSecondary : 'transparent',
                  color: !screenBroadcastEnabled ? '#000' : COLORS.textMuted,
                  fontWeight: 800,
                  '&:hover': { bgcolor: !screenBroadcastEnabled ? COLORS.textSecondary : alpha(COLORS.textSecondary, 0.1) }
                }}>OFF</Button>
            </Box>
          </Box>
          {screenBroadcastEnabled && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: COLORS.textPrimary }}>CAPTURE INTERVAL</Typography>
                <Typography variant="caption" sx={{ color: COLORS.accent, fontFamily: 'monospace', fontWeight: 800, bgcolor: alpha(COLORS.accent, 0.1), px: 1, py: 0.5 }}>
                  [ EVERY {screenCaptureInterval} SECONDS ]
                </Typography>
              </Box>
              <Slider
                value={screenCaptureInterval}
                onChange={(e, v) => setScreenCaptureInterval(v)}
                min={2} max={30}
                marks={[
                  { value: 2, label: '2s' },
                  { value: 5, label: '5s' },
                  { value: 15, label: '15s' },
                  { value: 30, label: '30s' }
                ]}
                sx={{
                  color: COLORS.accent,
                  '& .MuiSlider-thumb': { borderRadius: 0, width: 12, height: 24 },
                  '& .MuiSlider-rail': { bgcolor: COLORS.border, opacity: 1 },
                  '& .MuiSlider-mark': { bgcolor: COLORS.textMuted, width: 2, height: 6 },
                  '& .MuiSlider-markLabel': { color: COLORS.textMuted, fontFamily: 'monospace', fontSize: '0.65rem', mt: 0.5 }
                }}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* INTEGRATIONS */}
      <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgSurface, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Webhook size={20} color={COLORS.yellow} />
          <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>INTEGRATIONS</Typography>
        </Box>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5, color: COLORS.textPrimary }}>WEBHOOK NOTIFICATIONS</Typography>
              <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                Send real-time incident alerts to external systems when IoA events are detected.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', border: `1px solid ${COLORS.borderLight}` }}>
              <Button 
                onClick={() => setWebhookEnabled(true)}
                sx={{ 
                  borderRadius: 0, minWidth: 60, py: 0.5,
                  bgcolor: webhookEnabled ? COLORS.yellow : 'transparent',
                  color: webhookEnabled ? '#000' : COLORS.textMuted,
                  fontWeight: 800,
                  '&:hover': { bgcolor: webhookEnabled ? COLORS.yellow : alpha(COLORS.yellow, 0.1) }
                }}>ON</Button>
              <Button 
                onClick={() => setWebhookEnabled(false)}
                sx={{ 
                  borderRadius: 0, minWidth: 60, py: 0.5,
                  bgcolor: !webhookEnabled ? COLORS.textSecondary : 'transparent',
                  color: !webhookEnabled ? '#000' : COLORS.textMuted,
                  fontWeight: 800,
                  '&:hover': { bgcolor: !webhookEnabled ? COLORS.textSecondary : alpha(COLORS.textSecondary, 0.1) }
                }}>OFF</Button>
            </Box>
          </Box>
          {webhookEnabled && (
            <>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: COLORS.textPrimary }}>EXPORT FORMAT</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {[
                    { label: 'GENERIC JSON', val: 'generic' },
                    { label: 'SPLUNK HEC', val: 'splunk_hec' },
                    { label: 'ELASTIC', val: 'elastic' }
                  ].map(opt => (
                    <Button 
                      key={opt.val}
                      onClick={() => setWebhookFormat(opt.val)}
                      sx={{ 
                        borderRadius: 0, px: 2, py: 0.5, border: `1px solid ${webhookFormat === opt.val ? COLORS.yellow : COLORS.borderLight}`,
                        bgcolor: webhookFormat === opt.val ? alpha(COLORS.yellow, 0.1) : 'transparent',
                        color: webhookFormat === opt.val ? COLORS.yellow : COLORS.textMuted,
                        fontWeight: 800, fontFamily: 'monospace',
                        '&:hover': { bgcolor: alpha(COLORS.yellow, 0.2), borderColor: COLORS.yellow }
                      }}>
                      {opt.label}
                    </Button>
                  ))}
                </Box>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: COLORS.textPrimary }}>SIEM / WEBHOOK ENDPOINT</Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <TextField
                    fullWidth
                    value={webhook}
                    onChange={(e) => setWebhook(e.target.value)}
                    variant="outlined"
                    size="small"
                    placeholder="https://..."
                    slotProps={{
                      input: {
                        startAdornment: <Typography sx={{ color: COLORS.yellow, mr: 1, fontFamily: 'monospace', fontWeight: 'bold' }}>{'>'}</Typography>
                      }
                    }}
                    sx={{
                      flexGrow: 1,
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 0,
                        bgcolor: '#000',
                        fontFamily: 'monospace',
                        color: COLORS.textSecondary,
                        '& fieldset': { borderColor: COLORS.borderLight },
                        '&:hover fieldset': { borderColor: COLORS.textMuted },
                        '&.Mui-focused fieldset': { borderColor: COLORS.yellow },
                      }
                    }}
                  />
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Button
                      variant="outlined"
                      startIcon={testWebhookMutation.isPending ? null : <Send size={14} />}
                      disabled={testWebhookMutation.isPending || !webhook}
                      onClick={() => testWebhookMutation.mutate()}
                      sx={{
                        borderRadius: 0, borderColor: COLORS.yellow, color: COLORS.yellow,
                        fontFamily: 'monospace', fontWeight: 800, letterSpacing: '0.05em', height: '40px',
                        whiteSpace: 'nowrap', minWidth: '140px',
                        '&:hover': { bgcolor: alpha(COLORS.yellow, 0.1), borderColor: COLORS.yellow }
                      }}
                    >
                      {testWebhookMutation.isPending ? 'TESTING...' : 'TEST WEBHOOK'}
                    </Button>
                    {lastWebhookStatus && (
                      <Typography variant="caption" sx={{ mt: 0.5, fontFamily: 'monospace', color: lastWebhookStatus.ok ? COLORS.green : COLORS.red }}>
                        {lastWebhookStatus.ok ? '🟢 OK' : '🔴 FAILED'} ({lastWebhookStatus.time})
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: COLORS.textPrimary }}>AUTHORIZATION TOKEN (OPTIONAL)</Typography>
                <TextField
                  fullWidth
                  type={showWebhookToken ? "text" : "password"}
                  value={webhookToken}
                  onChange={(e) => setWebhookToken(e.target.value)}
                  variant="outlined"
                  size="small"
                  placeholder="Bearer token or API Key..."
                  slotProps={{
                    input: {
                      startAdornment: <Key size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />,
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowWebhookToken(!showWebhookToken)} edge="end" sx={{ color: COLORS.textMuted }}>
                            {showWebhookToken ? <EyeOff size={16} /> : <Eye size={16} />}
                          </IconButton>
                        </InputAdornment>
                      )
                    }
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 0,
                      bgcolor: '#000',
                      fontFamily: 'monospace',
                      color: COLORS.textSecondary,
                      '& fieldset': { borderColor: COLORS.borderLight },
                      '&:hover fieldset': { borderColor: COLORS.textMuted },
                      '&.Mui-focused fieldset': { borderColor: COLORS.yellow },
                    }
                  }}
                />
                <Typography variant="caption" sx={{ color: COLORS.textMuted, display: 'block', mt: 1, fontFamily: 'monospace' }}>
                  {webhookFormat === 'splunk_hec' 
                    ? "Splunk HEC: Passed as 'Authorization: Splunk <token>' header. Ensure your endpoint ends with /services/collector/raw."
                    : webhookFormat === 'elastic'
                    ? "Elastic: Passed as 'Authorization: Bearer <token>' header."
                    : "Generic: Passed as 'Authorization: Bearer <token>' header. Use for Discord/Slack if using a custom proxy that requires auth."}
                </Typography>
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      {/* DANGER ZONE */}
      <Card sx={{ bgcolor: COLORS.bgDeep, border: `2px solid ${COLORS.red}`, borderRadius: 0, mt: 2 }}>
        <Box sx={{ p: 2, borderBottom: `2px solid ${COLORS.red}`, bgcolor: COLORS.red, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Zap size={20} color="#000" />
          <Typography variant="subtitle1" sx={{ fontWeight: 900, letterSpacing: '0.05em', color: '#000' }}>GLOBAL KILL SWITCH</Typography>
        </Box>
        <CardContent sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: alpha(COLORS.red, 0.05) }}>
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 800, color: COLORS.red }}>INITIATE FULL LOCKDOWN</Typography>
            <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
              Sever all node connections and halt all background processes instantly. Type <span style={{ color: '#fff', fontWeight: 'bold' }}>CONFIRM</span> to engage.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField 
              placeholder="CONFIRM"
              value={killSwitchConfirm}
              onChange={(e) => setKillSwitchConfirm(e.target.value)}
              size="small"
              sx={{ 
                width: 120,
                '& .MuiOutlinedInput-root': { 
                  borderRadius: 0, bgcolor: '#000', color: COLORS.red, fontFamily: 'monospace', textAlign: 'center',
                  '& fieldset': { borderColor: COLORS.red },
                  '&.Mui-focused fieldset': { borderColor: COLORS.red, borderWidth: 2 }
                },
                '& input': { textAlign: 'center', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.1em' }
              }}
            />
            <Button
              variant="contained"
              disabled={killSwitchConfirm.toUpperCase() !== 'CONFIRM'}
              sx={{
                bgcolor: COLORS.red, color: '#000', borderRadius: 0, fontWeight: 900, letterSpacing: '0.1em',
                px: 3, py: 1, height: 40,
                '&:hover': { bgcolor: '#fff', color: COLORS.red },
                '&.Mui-disabled': { bgcolor: alpha(COLORS.red, 0.2), color: alpha(COLORS.red, 0.5) }
              }}
            >
              ENGAGE
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Floating Save Bar */}
      <Box sx={{ 
        position: 'sticky', bottom: 0, py: 2, 
        borderTop: `2px solid ${COLORS.yellow}`, bgcolor: alpha(COLORS.bgCard, 0.95), backdropFilter: 'blur(8px)', zIndex: 10,
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3,
        mt: 4, px: 4,
        transform: hasChanges ? 'translateY(0)' : 'translateY(100%)',
        opacity: hasChanges ? 1 : 0,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: hasChanges ? 'auto' : 'none'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, animation: 'pulse 2s infinite' }}>
          <Box sx={{ width: 8, height: 8, bgcolor: COLORS.yellow, borderRadius: '50%' }} />
          <Typography sx={{ fontFamily: 'monospace', color: COLORS.yellow, fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.05em' }}>
            UNSAVED CHANGES DETECTED
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          onClick={handleDeploy}
          sx={{ 
            bgcolor: COLORS.yellow, color: '#000', borderRadius: 0, fontWeight: 900, letterSpacing: '0.05em', px: 4,
            '&:hover': { bgcolor: '#fff' }
          }}
        >
          DEPLOY CONFIGURATION
        </Button>
      </Box>

      {/* Success Snackbar */}
      <Snackbar open={showSnackbar} autoHideDuration={3000} onClose={() => setShowSnackbar(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setShowSnackbar(false)} severity="success" sx={{ width: '100%', bgcolor: COLORS.green, color: '#000', borderRadius: 0, fontWeight: 800, '& .MuiAlert-icon': { color: '#000' } }}>
          Configuration deployed successfully to all edge nodes.
        </Alert>
      </Snackbar>
    </Box>
  );
}
