/**
 * ContestantDetail — Deep-dive view with resource charts and incident timeline.
 */

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, Grid, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, alpha, Skeleton, Divider,
  Button, Switch, FormControlLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText
} from '@mui/material';
import { ArrowLeft, Clock, Cpu, HardDrive, Monitor, Wifi, ShieldAlert, Activity, Terminal, Globe, Shield, ShieldCheck, RefreshCw, X, Maximize } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { contestantsAPI } from '../services/api';
import IntegrityBadge from '../components/IntegrityBadge';
import ScreenViewer from '../components/ScreenViewer';
import toast from 'react-hot-toast';
import { COLORS } from '../theme/theme';

// Mock resource data removed, fetching from API

const SEVERITY_COLORS = {
  CRITICAL: { color: '#f43f5e', bg: 'rgba(244,63,94,0.1)' },
  HIGH: { color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  MEDIUM: { color: '#eab308', bg: 'rgba(234,179,8,0.1)' },
};

export default function ContestantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showSystemEvents, setShowSystemEvents] = useState(false);
  const [isScreenMonitorOpen, setIsScreenMonitorOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  const { data: contestant, isLoading } = useQuery({
    queryKey: ['contestant', id],
    queryFn: () => contestantsAPI.get(id).then((r) => r.data),
  });

  const { data: incidents } = useQuery({
    queryKey: ['contestant-incidents', id],
    queryFn: () => contestantsAPI.getIncidents(id).then((r) => r.data),
  });

  const { data: scores } = useQuery({
    queryKey: ['contestant-scores', id],
    queryFn: () => contestantsAPI.getScores(id, 20).then((r) => r.data),
  });

  const { data: resourceData } = useQuery({
    queryKey: ['contestant-resources', id],
    queryFn: () => contestantsAPI.getResources(id).then((r) => r.data),
    refetchInterval: 5000, // Live update every 5 seconds
  });

  const { data: activityData } = useQuery({
    queryKey: ['contestant-activity', id],
    queryFn: () => contestantsAPI.getActivity(id).then((r) => r.data),
    refetchInterval: 10000,
  });

  if (isLoading) return <Skeleton variant="rounded" height={600} />;

  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['contestant', id] });
    queryClient.invalidateQueries({ queryKey: ['contestant-incidents', id] });
    queryClient.invalidateQueries({ queryKey: ['contestant-scores', id] });
    queryClient.invalidateQueries({ queryKey: ['contestant-resources', id] });
    queryClient.invalidateQueries({ queryKey: ['contestant-activity', id] });
  };

  const handleSendWarning = async () => {
    setConfirmDialog({
      open: true,
      title: "Send Warning",
      message: "Are you sure you want to deploy a Screen-Lock Warning to this agent?",
      onConfirm: async () => {
        try {
          await contestantsAPI.sendWarning(id);
          toast.success("Warning payload queued successfully. It will execute on the next heartbeat.");
          setConfirmDialog({ open: false });
        } catch (err) {
          console.error(err);
          toast.error("Failed to queue warning payload.");
          setConfirmDialog({ open: false });
        }
      }
    });
  };

  const handleDisconnect = async () => {
    setConfirmDialog({
      open: true,
      title: "Disconnect Agent",
      message: "WARNING: This will forcefully terminate the VOIGHT agent on the contestant's machine. They will need to manually restart the agent to continue. Are you sure?",
      onConfirm: async () => {
        try {
          await contestantsAPI.disconnect(id);
          toast.success("Disconnect payload queued successfully. It will execute on the next heartbeat.");
          setConfirmDialog({ open: false });
        } catch (err) {
          console.error(err);
          toast.error("Failed to queue disconnect payload.");
          setConfirmDialog({ open: false });
        }
      }
    });
  };

  const filteredActivity = activityData?.filter(e => showSystemEvents || e.type !== 'SYSTEM') || [];

  const osValue = contestant?.os?.toUpperCase() || '—';
  const ipValue = contestant?.ip || '—';

  return (
    <Box className="fade-in">
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ color: COLORS.textPrimary, bgcolor: alpha(COLORS.textMuted, 0.1), '&:hover': { bgcolor: alpha(COLORS.textMuted, 0.2) }, width: 40, height: 40 }}>
          <ArrowLeft size={20} />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, fontFamily: 'monospace', color: COLORS.textPrimary, textTransform: 'uppercase' }}>{contestant?.handle}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
            {contestant?.team && (
              <Chip label={contestant.team} size="small" sx={{ bgcolor: alpha(COLORS.accent, 0.1), color: COLORS.accent, borderRadius: 0, fontFamily: 'monospace', fontWeight: 800, textTransform: 'uppercase' }} />
            )}
            <Chip
              label={contestant?.is_online ? 'ONLINE' : 'OFFLINE'}
              size="small"
              icon={<span className={`status-dot ${contestant?.is_online ? 'online' : 'offline'}`} style={{ marginLeft: 8 }} />}
              sx={{
                bgcolor: contestant?.is_online ? alpha(COLORS.green, 0.1) : alpha(COLORS.textMuted, 0.1),
                color: contestant?.is_online ? COLORS.green : COLORS.textMuted,
                borderRadius: 0, fontFamily: 'monospace', fontWeight: 800, textTransform: 'uppercase'
              }}
            />
            {contestant?.screen_lock_count > 0 && (
              <Chip 
                label={`LOCKED x${contestant.screen_lock_count}`} 
                size="small" 
                sx={{ bgcolor: alpha('#a855f7', 0.1), color: '#a855f7', fontWeight: 800, borderRadius: 0, fontFamily: 'monospace', textTransform: 'uppercase' }} 
              />
            )}
          </Box>
        </Box>
        <IntegrityBadge
          score={contestant?.latest_score ?? 0}
          level={contestant?.latest_level || 'GREEN'}
          size="large"
        />
        <Button
          variant="contained"
          sx={{
            bgcolor: alpha(COLORS.yellow, 0.1),
            color: COLORS.yellow,
            '&:hover': { bgcolor: alpha(COLORS.yellow, 0.2) },
            ml: 2,
            fontWeight: 800,
            fontFamily: 'monospace',
            borderRadius: 0,
            textTransform: 'uppercase'
          }}
          startIcon={<ShieldAlert size={18} />}
          onClick={handleSendWarning}
        >
          Send Warning
        </Button>
        <IconButton 
          onClick={handleManualRefresh}
          sx={{
            bgcolor: alpha(COLORS.accent, 0.1),
            color: COLORS.accent,
            '&:hover': { bgcolor: alpha(COLORS.accent, 0.2) },
            ml: 1,
            width: 40,
            height: 40
          }}
          title="Manual Refresh"
        >
          <RefreshCw size={18} />
        </IconButton>
      </Box>

      <Grid container spacing={2}>
        {/* Live Screen Monitor (Hidden by default, open via button) */}
        <Grid size={{ xs: 12 }}>
          {contestant && (
            <Button
              variant="outlined"
              fullWidth
              onClick={() => setIsScreenMonitorOpen(true)}
              sx={{
                py: 2.5, mb: 1, borderStyle: 'dashed', borderColor: COLORS.border,
                color: COLORS.textSecondary, fontFamily: 'monospace', fontWeight: 800,
                letterSpacing: '0.1em',
                '&:hover': { borderColor: COLORS.accent, color: COLORS.accent, bgcolor: alpha(COLORS.accent, 0.05) }
              }}
            >
              <Maximize size={18} style={{ marginRight: 12 }} />
              VIEW LIVE SCREEN MONITOR
            </Button>
          )}
        </Grid>

        {/* Resource Usage Chart */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 900, mb: 2, fontFamily: 'monospace', textTransform: 'uppercase', color: COLORS.textPrimary }}>
                <Cpu size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: COLORS.textMuted }} />
                RESOURCE USAGE (LIVE)
              </Typography>
              {(!resourceData || resourceData.length === 0) ? (
                <Box sx={{ height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted }}>
                  <Activity size={48} opacity={0.2} style={{ marginBottom: 16 }} />
                  <Typography variant="body1">Awaiting Telemetry Data...</Typography>
                  <Typography variant="caption" sx={{ mt: 1 }}>The agent has not sent resource snapshots yet.</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={resourceData}>
                    <defs>
                      <linearGradient id="gradCpu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradGpu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.red} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.red} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradRam" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey="time" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                    <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <RechartsTooltip
                      contentStyle={{
                        background: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
                        borderRadius: 8, fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="cpu" name="CPU" stroke={COLORS.accent} fill="url(#gradCpu)" strokeWidth={2} />
                    <Area type="monotone" dataKey="gpu" name="GPU" stroke={COLORS.red} fill="url(#gradGpu)" strokeWidth={2} />
                    <Area type="monotone" dataKey="ram" name="RAM" stroke="#a78bfa" fill="url(#gradRam)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Info Cards (Bento Box Style) */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Grid container spacing={2} sx={{ height: '100%' }} alignItems="stretch">
            {[
              { label: 'Agent Version', value: contestant?.version || '—', icon: Monitor },
              { label: 'Enrolled At', value: contestant?.enrolled_at ? new Date(contestant.enrolled_at).toLocaleDateString() : '—', icon: Clock },
              { label: 'Last Seen', value: contestant?.last_seen ? new Date(contestant.last_seen).toLocaleTimeString() : '—', icon: Wifi },
              { label: 'Open Incidents', value: incidents?.filter((i) => i.status === 'OPEN').length ?? 0, icon: HardDrive },
              { label: 'Operating System', value: osValue, icon: Terminal },
              { label: 'IP Address', value: ipValue, icon: Globe },
            ].map((info, index) => {
              const isAlert = info.label === 'Open Incidents' && info.value > 0;
              const TINTS = [COLORS.accent, '#3b82f6', COLORS.green, COLORS.yellow, '#a855f7', COLORS.red];
              const tintColor = TINTS[index % TINTS.length];
              
              return (
                <Grid size={{ xs: 6 }} key={info.label} sx={{ display: 'flex' }}>
                  <Card sx={{
                    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    bgcolor: isAlert ? alpha(COLORS.red, 0.1) : alpha(tintColor, 0.03),
                    border: `1px solid ${isAlert ? COLORS.red : alpha(tintColor, 0.15)}`,
                    borderRadius: 0,
                    position: 'relative', overflow: 'hidden'
                  }}>
                    <CardContent sx={{ p: '16px !important', textAlign: 'center', position: 'relative', zIndex: 1 }}>
                      <info.icon size={16} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
                      <Typography variant="caption" sx={{ color: COLORS.textMuted, display: 'block', mb: 0.5, fontFamily: 'monospace', fontWeight: 800 }}>
                        {info.label.toUpperCase()}
                      </Typography>
                      <Typography variant="h6" sx={{ color: isAlert ? COLORS.red : COLORS.textPrimary, fontWeight: 900, fontFamily: 'monospace', fontSize: info.value.toString().length > 15 ? '0.8rem' : '1.1rem' }}>
                        {info.value}
                      </Typography>
                    </CardContent>
                    
                    {/* Background Watermark Icon */}
                    <info.icon size={80} style={{
                      position: 'absolute', right: -20, bottom: -20,
                      opacity: 0.05, color: isAlert ? COLORS.red : tintColor
                    }} />
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Grid>

        {/* Incident Timeline */}
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                <Shield size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                Incident Timeline
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead sx={{ bgcolor: alpha(COLORS.textMuted, 0.05), borderBottom: `1px solid ${alpha(COLORS.textMuted, 0.2)}` }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, color: COLORS.textSecondary, borderBottom: 'none' }}>Time</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: COLORS.textSecondary, borderBottom: 'none' }}>Indicator</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: COLORS.textSecondary, borderBottom: 'none' }}>Weight</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: COLORS.textSecondary, borderBottom: 'none' }}>Evidence</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: COLORS.textSecondary, borderBottom: 'none' }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {incidents?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} sx={{ textAlign: 'center', py: 6, color: COLORS.textMuted }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                            <ShieldCheck size={48} color={COLORS.green} style={{ opacity: 0.8 }} />
                            <Typography variant="body1" sx={{ color: COLORS.green, fontWeight: 500 }}>Contestant Integrity Intact</Typography>
                            <Typography variant="caption">No suspicious incidents or policy violations detected.</Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      incidents?.map((incident) => (
                        <TableRow key={incident.id}>
                          <TableCell>
                            <Typography variant="caption" sx={{ color: COLORS.textMuted }}>
                              {new Date(incident.detected_at).toLocaleTimeString()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip label={incident.indicator_type} size="small"
                              sx={{
                                bgcolor: alpha(COLORS.red, 0.1),
                                color: COLORS.red,
                                fontWeight: 600,
                                fontSize: '0.65rem',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: COLORS.red }}>
                              +{incident.weight}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" sx={{ color: COLORS.textSecondary, fontFamily: 'monospace' }}>
                              {incident.evidence || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip label={incident.status} size="small"
                              sx={{
                                bgcolor: incident.status === 'OPEN'
                                  ? alpha(COLORS.yellow, 0.1) : alpha(COLORS.green, 0.1),
                                color: incident.status === 'OPEN' ? COLORS.yellow : COLORS.green,
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
        {/* Activity Timeline (Audit Log) */}
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  <Clock size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                  Activity Timeline
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={showSystemEvents}
                      onChange={(e) => setShowSystemEvents(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={<Typography variant="caption" sx={{ color: COLORS.textMuted }}>Show Heartbeats</Typography>}
                />
              </Box>
              <Box sx={{ position: 'relative', pl: 4 }}>
                {filteredActivity?.length === 0 ? (
                  <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted, ml: -4 }}>
                    <Activity size={48} opacity={0.2} style={{ marginBottom: 16 }} />
                    <Typography variant="body1">No activity recorded yet.</Typography>
                  </Box>
                ) : (
                  <>
                    {/* Vertical line */}
                    <Box sx={{ position: 'absolute', left: 11, top: 0, bottom: 0, width: 2, bgcolor: COLORS.border }} />
                    {filteredActivity?.map((event, i) => (
                      <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2.5, position: 'relative' }}>
                      {/* Dot */}
                      <Box sx={{
                        position: 'absolute', left: -29, top: 4,
                        width: 12, height: 12, bgcolor: event.color, border: `2px solid ${COLORS.bgCard}`, zIndex: 1,
                      }} />
                      {/* Content */}
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.3 }}>
                          <Chip label={event.type} size="small" sx={{
                            bgcolor: alpha(event.color, 0.12), color: event.color,
                            fontWeight: 800, fontSize: '0.55rem', borderRadius: 0, height: 18, fontFamily: 'monospace',
                          }} />
                          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: COLORS.textMuted }}>{event.time}</Typography>
                          <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: COLORS.textMuted, ml: 'auto' }}>{event.detail}</Typography>
                        </Box>
                        <Typography sx={{ fontSize: '0.8rem', color: COLORS.textPrimary, fontWeight: 500 }}>{event.text}</Typography>
                      </Box>
                    </Box>
                    ))}
                  </>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ ...confirmDialog, open: false })}
        PaperProps={{ sx: { bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 } }}
      >
        <DialogTitle sx={{ fontFamily: 'monospace', fontWeight: 900, color: COLORS.textPrimary }}>{confirmDialog.title}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: COLORS.textSecondary, fontFamily: 'monospace' }}>
            {confirmDialog.message}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setConfirmDialog({ ...confirmDialog, open: false })} sx={{ color: COLORS.textMuted, fontFamily: 'monospace', fontWeight: 800 }}>Cancel</Button>
          <Button onClick={confirmDialog.onConfirm} variant="contained" color="error" sx={{ fontFamily: 'monospace', fontWeight: 800, borderRadius: 0 }}>Confirm</Button>
        </DialogActions>
      </Dialog>

      {/* Screen Monitor Fullscreen Dialog */}
      <Dialog 
        fullScreen 
        open={isScreenMonitorOpen} 
        onClose={() => setIsScreenMonitorOpen(false)}
        PaperProps={{ sx: { bgcolor: COLORS.bgDeep, backgroundImage: 'none' } }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${COLORS.border}`, bgcolor: COLORS.bgCard }}>
          <Typography variant="h6" sx={{ color: COLORS.textPrimary, fontFamily: 'monospace', fontWeight: 900, textTransform: 'uppercase' }}>
            <Monitor size={18} style={{ marginRight: 8, verticalAlign: 'middle', color: COLORS.accent }} />
            {contestant?.handle} - LIVE SCREEN MONITOR
          </Typography>
          <IconButton onClick={() => setIsScreenMonitorOpen(false)} sx={{ color: COLORS.textMuted }}>
            <X size={24} />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, overflow: 'hidden', p: 2, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ width: '100%', height: '100%', mx: 'auto', display: 'flex' }}>
            <ScreenViewer 
              contestants={[contestant]} 
              refreshInterval={5} 
              singleMode={true} 
              resourceData={resourceData}
              incidents={incidents}
              onSendWarning={handleSendWarning}
              onDisconnect={handleDisconnect}
            />
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
