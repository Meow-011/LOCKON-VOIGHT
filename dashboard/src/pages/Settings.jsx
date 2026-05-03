/**
 * Settings Page — System configuration for LOCKON VOIGHT.
 */

import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Divider, Switch,
  Slider, TextField, Button, alpha, Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { Settings as SettingsIcon, ShieldAlert, Webhook, Zap, Key, RefreshCw, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsAPI } from '../services/api';
import { COLORS } from '../theme/theme';

const DEFAULT_STATE = {
  sensitivity: 70,
  autoBan: false,
  webhook: 'https://discord.com/api/webhooks/...',
  competitionKey: 'GLOBAL_COMP_KEY_12345',
  scanInterval: 5
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
  const [competitionKey, setCompetitionKey] = useState(DEFAULT_STATE.competitionKey);
  const [scanInterval, setScanInterval] = useState(DEFAULT_STATE.scanInterval);
  const [killSwitchConfirm, setKillSwitchConfirm] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);

  useEffect(() => {
    if (settingsData) {
      setSensitivity(settingsData.sensitivity);
      setAutoBan(settingsData.autoBan);
      setWebhook(settingsData.webhook);
      setCompetitionKey(settingsData.competitionKey);
      if (settingsData.scanInterval) setScanInterval(settingsData.scanInterval);
    }
  }, [settingsData]);

  const mutation = useMutation({
    mutationFn: (newState) => settingsAPI.update(newState),
    onSuccess: () => {
      queryClient.invalidateQueries(['settings']);
      setShowSnackbar(true);
    },
  });

  if (isLoading) return null;

  const hasChanges = settingsData && (
    sensitivity !== settingsData.sensitivity || 
    autoBan !== settingsData.autoBan || 
    webhook !== settingsData.webhook ||
    competitionKey !== settingsData.competitionKey ||
    scanInterval !== settingsData.scanInterval
  );

  const handleDeploy = () => {
    mutation.mutate({ sensitivity, autoBan, webhook, competitionKey, scanInterval });
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

      {/* AGENT ENROLLMENT */}
      <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgSurface, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Key size={20} color={COLORS.accent} />
          <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>AGENT ENROLLMENT</Typography>
        </Box>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 4, p: 3 }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: COLORS.textPrimary, mb: 1 }}>GLOBAL COMPETITION KEY</Typography>
            <Typography variant="caption" sx={{ color: COLORS.textMuted, display: 'block', mb: 2 }}>
              The universal secret key embedded in all downloadable agent bundles. Agents without this key will be rejected by the server. 
              Rotating this key will invalidate all existing agent bundles and require contestants to download a new one.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <TextField
                fullWidth
                value={competitionKey}
                type={showKey ? 'text' : 'password'}
                onChange={(e) => setCompetitionKey(e.target.value)}
                variant="outlined"
                size="small"
                slotProps={{
                  htmlInput: { readOnly: true },
                  input: { sx: { fontFamily: 'monospace', color: showKey ? COLORS.green : COLORS.textPrimary } }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 0, bgcolor: '#000',
                    '& fieldset': { borderColor: COLORS.borderLight },
                  }
                }}
              />
              <Button 
                onClick={() => setShowKey(!showKey)}
                sx={{ minWidth: 80, borderRadius: 0, border: `1px solid ${COLORS.borderLight}`, color: COLORS.textMuted, '&:hover': { color: COLORS.textPrimary, borderColor: COLORS.border } }}
              >
                {showKey ? 'HIDE' : 'SHOW'}
              </Button>
              <Button 
                onClick={() => setRotateConfirmOpen(true)}
                sx={{ minWidth: 140, borderRadius: 0, bgcolor: alpha(COLORS.red, 0.1), color: COLORS.red, border: `1px solid ${alpha(COLORS.red, 0.3)}`, '&:hover': { bgcolor: alpha(COLORS.red, 0.2) } }}
                startIcon={<AlertTriangle size={16} />}
              >
                ROTATE KEY
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

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

      {/* INTEGRATIONS */}
      <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgSurface, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Webhook size={20} color={COLORS.yellow} />
          <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '0.05em' }}>INTEGRATIONS</Typography>
        </Box>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 3 }}>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1, color: COLORS.textPrimary }}>SIEM / WEBHOOK ENDPOINT</Typography>
            <TextField
              fullWidth
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              variant="outlined"
              size="small"
              slotProps={{
                input: {
                  startAdornment: <Typography sx={{ color: COLORS.yellow, mr: 1, fontFamily: 'monospace', fontWeight: 'bold' }}>{'>_'}</Typography>
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
          </Box>
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

      {/* Rotate Key Confirm Dialog */}
      <Dialog open={rotateConfirmOpen} onClose={() => setRotateConfirmOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.red}`, borderRadius: 0 } }}>
        <DialogTitle sx={{ fontFamily: 'monospace', fontWeight: 800, color: COLORS.red, display: 'flex', alignItems: 'center', gap: 2 }}>
          <AlertTriangle size={20} /> ROTATE COMPETITION KEY
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <Typography sx={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            Rotating the global key will <strong style={{ color: COLORS.red }}>disconnect all currently active agents</strong>. 
            Contestants will be forced to download a new agent bundle. Are you sure you want to proceed?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setRotateConfirmOpen(false)} sx={{ color: COLORS.textMuted, fontFamily: 'monospace' }}>CANCEL</Button>
          <Button variant="contained" 
            onClick={() => {
              setCompetitionKey('COMP_KEY_' + Math.random().toString(36).substr(2, 9).toUpperCase());
              setRotateConfirmOpen(false);
            }}
            sx={{ bgcolor: COLORS.red, color: '#fff', fontWeight: 900, borderRadius: 0, fontFamily: 'monospace', '&:hover': { bgcolor: '#fff', color: COLORS.red } }}>
            ROTATE KEY
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar open={showSnackbar} autoHideDuration={3000} onClose={() => setShowSnackbar(false)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setShowSnackbar(false)} severity="success" sx={{ width: '100%', bgcolor: COLORS.green, color: '#000', borderRadius: 0, fontWeight: 800, '& .MuiAlert-icon': { color: '#000' } }}>
          Configuration deployed successfully to all edge nodes.
        </Alert>
      </Snackbar>
    </Box>
  );
}
