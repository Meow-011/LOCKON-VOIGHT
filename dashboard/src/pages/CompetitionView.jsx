/**
 * CompetitionView — Live contestant grid with real-time integrity scores.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText, TextField,
  IconButton, Tooltip, alpha, Skeleton, Alert, keyframes
} from '@mui/material';
import {
  UserPlus, Copy, ArrowLeft, Wifi, WifiOff,
  ExternalLink, RefreshCw, Activity, Edit2, Trash2, ShieldCheck, Search, Filter, ShieldAlert
} from 'lucide-react';
import { competitionsAPI, contestantsAPI } from '../services/api';
import { useWebSocket } from '../services/websocket';
import IntegrityBadge from '../components/IntegrityBadge';
import toast from 'react-hot-toast';
import { COLORS } from '../theme/theme';

const sharpBlinkRed = keyframes`
  0%, 49% { border-color: ${COLORS.border}; background-color: ${COLORS.bgCard}; }
  50%, 99% { border-color: ${COLORS.red}; background-color: ${alpha(COLORS.red, 0.15)}; }
  100% { border-color: ${COLORS.border}; background-color: ${COLORS.bgCard}; }
`;

export default function CompetitionView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [newContestant, setNewContestant] = useState({ handle: '', team: '' });

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ handle: '', team: '' });

  // UX Enhancements: Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState('ALL'); // ALL, CRITICAL, WARNING, OFFLINE

  useEffect(() => {
    if (editTarget) {
      setEditForm({ handle: editTarget.handle || '', team: editTarget.team || '' });
    }
  }, [editTarget]);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  const handleDelete = async (contestantId) => {
    setConfirmDialog({
      open: true,
      title: "Delete Contestant",
      message: "Are you sure you want to delete this contestant?",
      onConfirm: async () => {
        try {
          await contestantsAPI.delete(contestantId);
          refetch();
          toast.success("Contestant deleted successfully.");
        } catch (err) {
          console.error(err);
          toast.error("Failed to delete contestant.");
        }
      }
    });
  };

  const handleTeamWarning = (teamName, members) => {
    setConfirmDialog({
      open: true,
      title: "Warn Entire Team",
      message: `Are you sure you want to deploy a Screen-Lock Warning to ALL ${members.length} members of team ${teamName}?`,
      onConfirm: async () => {
        try {
          const promises = members.map(m => contestantsAPI.sendWarning(m.id));
          await Promise.all(promises);
          toast.success(`Warnings queued for team ${teamName}.`);
        } catch (err) {
          console.error(err);
          toast.error("Failed to queue some warnings.");
        }
      }
    });
  };

  const handleEditSave = async () => {
    try {
      await contestantsAPI.update(editTarget.id, editForm);
      setEditTarget(null);
      refetch();
      toast.success("Contestant updated successfully.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update contestant.");
    }
  };

  const { data: realCompetition, isLoading: compLoading } = useQuery({
    queryKey: ['competition', id],
    queryFn: () => competitionsAPI.get(id).then((r) => r.data),
  });

  const { data: realContestants, isLoading: contLoading, refetch } = useQuery({
    queryKey: ['contestants', id],
    queryFn: () => competitionsAPI.listContestants(id).then((r) => r.data),
    refetchInterval: 60000, // Sync every minute, rely on WS for real-time
    placeholderData: keepPreviousData, // Zero-Flash UI updates
  });

  const competition = realCompetition || null;
  const contestants = realContestants || [];

  const { isConnected, contestantUpdates } = useWebSocket(id);

  const handleAddContestant = async () => {
    try {
      await competitionsAPI.addContestant(id, newContestant);
      setAddOpen(false);
      setNewContestant({ handle: '', team: '' });
      refetch();
    } catch (err) {
      console.error('Add failed:', err);
    }
  };

  const copyToken = (token) => {
    navigator.clipboard.writeText(token);
  };

  // Merge WebSocket updates with query data
  const mergedContestants = contestants?.map((c) => {
    const wsUpdate = contestantUpdates[c.id];
    return wsUpdate ? { ...c, ...wsUpdate } : c;
  }) || [];

  // ─── UX/UI Data Processing (Search, Filter, Sort) ───
  const processedContestants = mergedContestants.filter(c => {
    const matchesSearch = c.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.ip && c.ip.includes(searchQuery)) ||
      (c.team && c.team.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterState === 'CRITICAL') return c.latest_level === 'RED';
    if (filterState === 'WARNING') return c.latest_level === 'YELLOW';
    if (filterState === 'OFFLINE') return !c.is_online;
    if (filterState === 'LOCKED') return c.screen_lock_count > 0;
    return true;
  });

  const teamsObj = processedContestants.reduce((acc, contestant) => {
    const teamName = (contestant.team || 'UNASSIGNED').trim().toUpperCase();
    if (!acc[teamName]) acc[teamName] = [];
    acc[teamName].push(contestant);
    return acc;
  }, {});

  // Sort teams so that teams with CRITICAL issues float to the top
  const sortedTeams = Object.entries(teamsObj).sort(([teamA, membersA], [teamB, membersB]) => {
    const aCritical = membersA.some(m => m.latest_level === 'RED') ? 1 : 0;
    const bCritical = membersB.some(m => m.latest_level === 'RED') ? 1 : 0;
    if (aCritical !== bCritical) return bCritical - aCritical; // Critical first

    const aWarning = membersA.some(m => m.latest_level === 'YELLOW') ? 1 : 0;
    const bWarning = membersB.some(m => m.latest_level === 'YELLOW') ? 1 : 0;
    if (aWarning !== bWarning) return bWarning - aWarning; // Warning second

    const aLocked = membersA.some(m => m.screen_lock_count > 0) ? 1 : 0;
    const bLocked = membersB.some(m => m.screen_lock_count > 0) ? 1 : 0;
    if (aLocked !== bLocked) return bLocked - aLocked; // Locked third

    return teamA.localeCompare(teamB);
  });

  // Calculate stats for filter chips
  const stats = {
    critical: mergedContestants.filter(c => c.latest_level === 'RED').length,
    warning: mergedContestants.filter(c => c.latest_level === 'YELLOW').length,
    locked: mergedContestants.filter(c => c.screen_lock_count > 0).length,
    offline: mergedContestants.filter(c => !c.is_online).length,
  };

  if (compLoading) return <Skeleton variant="rounded" height={400} />;

  return (
    <Box className="fade-in">
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <IconButton onClick={() => navigate('/competitions')} sx={{ color: COLORS.textMuted }}>
          <ArrowLeft size={20} />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, fontFamily: 'monospace', color: COLORS.textPrimary, textTransform: 'uppercase' }}>{competition?.name}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
            <Chip label={competition?.status?.toUpperCase()} size="small"
              sx={{
                bgcolor: competition?.status === 'active' ? alpha(COLORS.green, 0.1) : alpha(COLORS.textMuted, 0.1),
                color: competition?.status === 'active' ? COLORS.green : COLORS.textMuted,
                fontWeight: 800, fontFamily: 'monospace', borderRadius: 0, textTransform: 'uppercase'
              }}
            />
            <Chip
              icon={isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
              label={isConnected ? 'LIVE' : 'OFFLINE'}
              size="small"
              sx={{
                bgcolor: isConnected ? alpha(COLORS.green, 0.1) : alpha(COLORS.red, 0.1),
                color: isConnected ? COLORS.green : COLORS.red,
                fontWeight: 800, fontFamily: 'monospace', borderRadius: 0, textTransform: 'uppercase',
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
          </Box>
        </Box>
        <Button
          id="add-contestant-btn"
          variant="contained"
          startIcon={<UserPlus size={16} />}
          onClick={() => setAddOpen(true)}
          sx={{ fontWeight: 800, fontFamily: 'monospace', borderRadius: 0, textTransform: 'uppercase' }}
        >
          Add Contestant
        </Button>
      </Box>

      {/* ─── UX/UI Filtering Bar ─── */}
      <Box sx={{ display: 'flex', gap: 2, mb: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          placeholder="Search machine, IP, or team..."
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          slotProps={{ input: { startAdornment: <Search size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} /> } }}
          sx={{
            minWidth: 280,
            '& .MuiOutlinedInput-root': {
              bgcolor: COLORS.bgDeep, borderRadius: 0, fontFamily: 'monospace', fontSize: '0.8rem',
              '& fieldset': { borderColor: COLORS.border },
              '&:hover fieldset': { borderColor: COLORS.textMuted },
              '&.Mui-focused fieldset': { borderColor: COLORS.accent },
            }
          }}
        />
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Filter size={16} color={COLORS.textMuted} style={{ marginRight: 4 }} />
          {[
            { id: 'ALL', label: 'ALL', count: mergedContestants.length, color: COLORS.textMuted },
            { id: 'CRITICAL', label: 'CRITICAL', count: stats.critical, color: COLORS.red },
            { id: 'WARNING', label: 'WARNING', count: stats.warning, color: COLORS.yellow },
            { id: 'LOCKED', label: 'LOCKED', count: stats.locked, color: '#a855f7' },
            { id: 'OFFLINE', label: 'OFFLINE', count: stats.offline, color: COLORS.textMuted },
          ].map(f => (
            <Chip
              key={f.id}
              label={`${f.label} ${f.count > 0 ? `(${f.count})` : ''}`}
              onClick={() => setFilterState(f.id)}
              sx={{
                borderRadius: 0, fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer',
                bgcolor: filterState === f.id ? alpha(f.color, 0.2) : 'transparent',
                color: filterState === f.id ? f.color : COLORS.textMuted,
                border: `1px solid ${filterState === f.id ? f.color : COLORS.border}`,
                '&:hover': { bgcolor: alpha(f.color, 0.1), color: f.color, borderColor: f.color }
              }}
            />
          ))}
        </Box>
      </Box>

      {/* ─── Global Health Bar (HUD) ─── */}
      <Box sx={{ display: 'flex', height: 4, width: '100%', mb: 4, bgcolor: COLORS.bgDeep, borderRadius: 2, overflow: 'hidden' }}>
        {mergedContestants.length > 0 ? (
          <>
            <Box sx={{ width: `${((mergedContestants.length - stats.critical - stats.warning - stats.offline) / mergedContestants.length) * 100}%`, bgcolor: COLORS.green, transition: 'width 0.5s' }} />
            <Box sx={{ width: `${(stats.warning / mergedContestants.length) * 100}%`, bgcolor: COLORS.yellow, transition: 'width 0.5s' }} />
            <Box sx={{ width: `${(stats.critical / mergedContestants.length) * 100}%`, bgcolor: COLORS.red, transition: 'width 0.5s' }} />
            <Box sx={{ width: `${(stats.offline / mergedContestants.length) * 100}%`, bgcolor: COLORS.borderLight, transition: 'width 0.5s' }} />
          </>
        ) : (
          <Box sx={{ width: '100%', bgcolor: COLORS.border }} />
        )}
      </Box>

      {/* Node-Based Team Grid */}
      {contLoading && mergedContestants?.length === 0 ? (
        <Grid container spacing={3}>
          {[1, 2, 3].map((i) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={i}>
              <Skeleton variant="rectangular" height={200} sx={{ bgcolor: COLORS.bgSurface }} />
            </Grid>
          ))}
        </Grid>
      ) : mergedContestants?.length === 0 ? (
        <Card sx={{ textAlign: 'center', py: 8, bgcolor: 'transparent', border: `1px dashed ${COLORS.border}`, borderRadius: 0 }}>
          <WifiOff size={48} color={COLORS.borderLight} style={{ marginBottom: 16 }} />
          <Typography variant="h6" sx={{ color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            NO ACTIVE NODES
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 3 }}>
            Deploy agents and enroll contestants to establish the network topology.
          </Typography>
          <Button variant="outlined" startIcon={<UserPlus size={16} />} onClick={() => setAddOpen(true)} sx={{ borderRadius: 0, borderColor: COLORS.border, color: COLORS.textPrimary }}>
            Initialize First Node
          </Button>
        </Card>
      ) : sortedTeams.length === 0 ? (
        <Card sx={{ textAlign: 'center', py: 10, bgcolor: 'transparent', border: `1px dashed ${COLORS.borderLight}`, borderRadius: 0 }}>
          <ShieldCheck size={48} color={COLORS.green} style={{ marginBottom: 16, opacity: 0.8 }} />
          <Typography variant="h5" sx={{ color: COLORS.green, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            ALL SYSTEMS NOMINAL
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textMuted, mt: 1 }}>
            No anomalies found. The current filter criteria yields zero targets.
          </Typography>
        </Card>
      ) : (
        <Box sx={{
          columnCount: { xs: 1, md: 2, lg: 3 },
          columnGap: 3,
        }}>
          {sortedTeams.map(([teamName, members]) => {
            const onlineCount = members.filter(m => m.is_online).length;
            const totalCount = members.length;
            const hasCritical = members.some(m => m.latest_level === 'RED');
            const hasWarning = members.some(m => m.latest_level === 'YELLOW');
            const avgScore = totalCount > 0 ? members.reduce((sum, m) => sum + (m.latest_score || 0), 0) / totalCount : 0;

            let borderColor = COLORS.borderLight;
            let borderThickness = '1px';
            if (hasCritical) { borderColor = COLORS.red; borderThickness = '2px'; }
            else if (hasWarning) borderColor = COLORS.yellow;

            return (
              <Box key={teamName} sx={{ breakInside: 'avoid', mb: 3 }}>
                <Card sx={{
                  bgcolor: COLORS.bgDeep,
                  border: `${borderThickness} solid ${borderColor}`,
                  borderRadius: 0,
                  transition: 'all 0.2s ease',
                  // Zero-glow: if critical, use a stark background stripe or just keep the hard border
                  backgroundImage: hasCritical ? 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.05), rgba(239, 68, 68, 0.05) 10px, transparent 10px, transparent 20px)' : 'none'
                }}>
                  {/* Team Header */}
                  <Box sx={{
                    p: 2,
                    borderBottom: `${borderThickness} solid ${borderColor}`,
                    bgcolor: hasCritical ? COLORS.red : hasWarning ? alpha(COLORS.yellow, 0.1) : COLORS.bgSurface,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap'
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1, mr: 2 }}>
                      <Activity size={18} color={hasCritical ? '#000' : COLORS.textPrimary} style={{ flexShrink: 0 }} />
                      <Typography variant="subtitle2" sx={{
                        fontWeight: 900, color: hasCritical ? '#000' : COLORS.textPrimary,
                        letterSpacing: '0.1em', fontFamily: 'monospace',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>
                        {teamName.toUpperCase()}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: hasCritical ? '#000' : COLORS.textSecondary }}>
                        <ShieldCheck size={14} style={{ flexShrink: 0 }} />
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 800, whiteSpace: 'nowrap' }}>
                          Avg Score: {avgScore.toFixed(0)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: hasCritical ? '#000' : (onlineCount === totalCount && totalCount > 0 ? COLORS.green : COLORS.textMuted) }}>
                        <Wifi size={14} style={{ flexShrink: 0 }} />
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 900, whiteSpace: 'nowrap' }}>
                          {onlineCount}/{totalCount} Online
                        </Typography>
                      </Box>
                      <Tooltip title="Deploy Screen-Lock Warning to Entire Team">
                        <IconButton size="small" onClick={() => handleTeamWarning(teamName, members)} sx={{ color: hasCritical ? '#000' : COLORS.textMuted, '&:hover': { color: hasCritical ? '#fff' : COLORS.red } }}>
                          <ShieldAlert size={16} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>

                  {/* Agent Slots */}
                  <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {members.map(m => (
                      <Box
                        key={m.id}
                        onClick={() => navigate(`/contestants/${m.id}`)}
                        sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          p: 1.5, pl: 2,
                          bgcolor: COLORS.bgCard,
                          border: `1px solid ${COLORS.border}`,
                          borderLeft: `4px solid ${m.latest_level === 'RED' ? COLORS.red : m.latest_level === 'YELLOW' ? COLORS.yellow : COLORS.borderLight}`,
                          cursor: 'pointer',
                          animation: m.latest_level === 'RED' ? `${sharpBlinkRed} 1s infinite` : 'none',
                          transition: 'all 0.15s ease-out',
                          '&:hover': {
                            borderColor: COLORS.textPrimary,
                            bgcolor: COLORS.bgSurface,
                            transform: 'translateY(-2px)', // Elevation effect instead of just translation
                            boxShadow: `0 4px 12px rgba(0,0,0,0.5)`
                          }
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                          <Box sx={{
                            width: 10, height: 10, mt: 0.5, borderRadius: 0, // square indicator
                            bgcolor: m.is_online ? COLORS.green : COLORS.textMuted,
                          }} />
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <Typography variant="body2" sx={{ fontWeight: 900, fontFamily: 'monospace', lineHeight: 1.2, letterSpacing: '0.05em', color: COLORS.textPrimary }}>
                                {m.handle.toUpperCase()}
                              </Typography>
                              {m.screen_lock_count > 0 && (
                                <Chip label={`LOCKED x${m.screen_lock_count}`} size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', fontWeight: 800, borderRadius: 0 }} />
                              )}
                            </Box>
                            <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: '0.65rem', fontFamily: 'monospace', display: 'block', mb: 0.5 }}>
                              IP: {m.ip || "UNKNOWN"}
                            </Typography>
                            <Chip
                              label={m.enrollment_token && !m.is_enrolled ? 'AWAITING ENROLLMENT' : m.is_online ? 'CONNECTION STABLE' : 'OFFLINE'}
                              size="small"
                              sx={{
                                height: 16, fontSize: '0.55rem', fontWeight: 800, borderRadius: 0,
                                bgcolor: m.enrollment_token && !m.is_enrolled ? alpha(COLORS.yellow, 0.1) : m.is_online ? alpha(COLORS.green, 0.1) : alpha(COLORS.textMuted, 0.1),
                                color: m.enrollment_token && !m.is_enrolled ? COLORS.yellow : m.is_online ? COLORS.green : COLORS.textMuted
                              }}
                            />
                          </Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                          {m.is_enrolled ? (
                            <IntegrityBadge score={m.latest_score ?? 0} level={m.latest_level || 'GREEN'} size="small" />
                          ) : (
                            <Tooltip title="Copy Token">
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); copyToken(m.enrollment_token); }} sx={{ color: COLORS.textMuted }}>
                                <Copy size={14} />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditTarget(m); }} sx={{ color: COLORS.accent, '&:hover': { bgcolor: alpha(COLORS.accent, 0.1) } }}>
                              <Edit2 size={14} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }} sx={{ color: COLORS.red, '&:hover': { bgcolor: alpha(COLORS.red, 0.1) } }}>
                              <Trash2 size={14} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Card>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Add Contestant Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Contestant</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2, mt: 1 }}>
            An enrollment token will be auto-generated. Share it with the contestant to install the VOIGHT Agent.
          </Alert>
          <TextField
            id="contestant-handle"
            fullWidth label="Handle / Name" sx={{ mb: 2 }}
            value={newContestant.handle}
            onChange={(e) => setNewContestant({ ...newContestant, handle: e.target.value })}
            placeholder="e.g. Player1"
          />
          <TextField
            id="contestant-team"
            fullWidth label="Team (optional)"
            value={newContestant.team}
            onChange={(e) => setNewContestant({ ...newContestant, team: e.target.value })}
            placeholder="e.g. Team Alpha"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddContestant} disabled={!newContestant.handle}>
            Add & Generate Token
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Contestant Dialog */}
      <Dialog open={Boolean(editTarget)} onClose={() => setEditTarget(null)} PaperProps={{ sx: { bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.borderLight}`, borderRadius: 0, minWidth: 400 } }}>
        <DialogTitle sx={{ color: COLORS.textPrimary, fontFamily: 'monospace', fontWeight: 800 }}>EDIT CONTESTANT</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
          <TextField
            label="HANDLE (Owner)"
            value={editForm.handle}
            onChange={(e) => setEditForm({ ...editForm, handle: e.target.value })}
            fullWidth
            variant="outlined"
            size="small"
            InputLabelProps={{ style: { color: COLORS.textMuted, fontFamily: 'monospace' } }}
            InputProps={{ style: { color: COLORS.textPrimary, fontFamily: 'monospace', borderRadius: 0 } }}
            sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: COLORS.borderLight }, '&:hover fieldset': { borderColor: COLORS.accent }, '&.Mui-focused fieldset': { borderColor: COLORS.accent } } }}
          />
          <TextField
            label="TEAM"
            value={editForm.team}
            onChange={(e) => setEditForm({ ...editForm, team: e.target.value })}
            fullWidth
            variant="outlined"
            size="small"
            InputLabelProps={{ style: { color: COLORS.textMuted, fontFamily: 'monospace' } }}
            InputProps={{ style: { color: COLORS.textPrimary, fontFamily: 'monospace', borderRadius: 0 } }}
            sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: COLORS.borderLight }, '&:hover fieldset': { borderColor: COLORS.accent }, '&.Mui-focused fieldset': { borderColor: COLORS.accent } } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setEditTarget(null)} sx={{ color: COLORS.textMuted, fontFamily: 'monospace' }}>CANCEL</Button>
          <Button onClick={handleEditSave} variant="contained" sx={{ bgcolor: COLORS.accent, color: '#000', fontWeight: 800, borderRadius: 0, fontFamily: 'monospace', '&:hover': { bgcolor: '#fff' } }}>SAVE CHANGES</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ ...confirmDialog, open: false })}
        PaperProps={{ sx: { bgcolor: COLORS.bgCard, border: `1px solid ${COLORS.borderLight}`, borderRadius: 0 } }}
      >
        <DialogTitle sx={{ color: COLORS.textPrimary, fontFamily: 'monospace', fontWeight: 800 }}>{confirmDialog.title}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: COLORS.textMuted, fontFamily: 'monospace', fontSize: '0.9rem' }}>
            {confirmDialog.message}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setConfirmDialog({ ...confirmDialog, open: false })} sx={{ color: COLORS.textMuted, fontFamily: 'monospace', fontWeight: 800 }}>Cancel</Button>
          <Button onClick={() => {
            confirmDialog.onConfirm();
            setConfirmDialog({ ...confirmDialog, open: false });
          }} sx={{ color: COLORS.accent, fontFamily: 'monospace', fontWeight: 800 }}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
