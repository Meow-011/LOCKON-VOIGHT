/**
 * Fleet Command Page — Agent nodes management and system health.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Card, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, alpha, Button, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText,
  Collapse, Tabs, Tab, TextField, keyframes, Grid, InputAdornment, MenuItem, Select, FormControl,
  Checkbox, TableSortLabel
} from '@mui/material';
import { Server, Terminal, Cpu, MemoryStick, Download, AlertOctagon, Send, ChevronDown, ChevronRight, Edit2, Trash2, Search, Filter, ShieldAlert, Activity, Wifi, Shield, Pause, Play } from 'lucide-react';

import toast from 'react-hot-toast';
import { COLORS } from '../theme/theme';
import { agentsAPI, competitionsAPI, contestantsAPI, incidentsAPI } from '../services/api';
import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';



function formatUptime(lastSeen) {
  const diff = Date.now() - lastSeen;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

const sharpBlinkRed = keyframes`
  0%, 49% { border-color: ${COLORS.border}; background-color: transparent; }
  50%, 99% { border-color: ${COLORS.red}; background-color: ${alpha(COLORS.red, 0.15)}; }
  100% { border-color: ${COLORS.border}; background-color: transparent; }
`;

function OSIcon({ os }) {
  if (!os) return <Server size={14} />;
  const lower = os.toLowerCase();
  if (lower.includes('win')) return <img src="/Icons/Windows.svg" alt="Windows" width={16} height={16} style={{ opacity: 0.8 }} />;
  if (lower.includes('darwin') || lower.includes('mac')) return <img src="/Icons/Apple.svg" alt="Apple" width={16} height={16} style={{ opacity: 0.8 }} />;
  if (lower.includes('linux')) return <img src="/Icons/Linux.svg" alt="Linux" width={16} height={16} style={{ opacity: 0.8 }} />;
  return <Server size={14} />;
}

function AgentRow({ agent, selected, onSelect, setWarningTarget, setEditTarget, onDelete }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const isRed = (agent.latest_level === 'RED' || agent.latest_level === 'CRITICAL') && agent.status !== 'OFFLINE';
  const isYellow = (agent.latest_level === 'YELLOW' || agent.latest_level === 'ELEVATED') && agent.status !== 'OFFLINE';
  
  let statusColor = COLORS.textMuted;
  if (agent.status === 'ONLINE') {
    statusColor = isRed ? COLORS.red : isYellow ? COLORS.yellow : COLORS.green;
  }

  const rowStyle = {
    '&:hover': { bgcolor: alpha(COLORS.accent, 0.05) },
    '& > *': { borderBottom: 'unset' },
    borderLeft: `4px solid ${isRed ? COLORS.red : isYellow ? COLORS.yellow : 'transparent'}`,
    bgcolor: isRed ? alpha(COLORS.red, 0.05) : isYellow ? alpha(COLORS.yellow, 0.05) : 'transparent',
    animation: isRed ? `${sharpBlinkRed} 1s infinite` : 'none',
    transition: 'all 0.15s ease-out'
  };

  return (
    <React.Fragment>
      <TableRow hover sx={rowStyle}>
        <TableCell padding="checkbox">
          <Checkbox 
            checked={selected} 
            onChange={() => onSelect(agent.id)} 
            sx={{ color: COLORS.borderLight, '&.Mui-checked': { color: COLORS.accent } }} 
          />
        </TableCell>
        <TableCell>
          <IconButton size="small" onClick={() => setOpen(!open)} sx={{ color: COLORS.textMuted }}>
            {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography 
            onClick={(e) => { e.stopPropagation(); navigate(`/contestants/${agent.id}`, { state: { fromFleet: true } }); }}
            sx={{ 
              fontWeight: 800, 
              fontFamily: 'monospace', 
              color: COLORS.textPrimary,
              cursor: 'pointer',
              display: 'inline-block',
              transition: 'all 0.2s',
              '&:hover': { color: COLORS.accent, textDecoration: 'underline' }
            }}
          >
            {agent.handle ? agent.handle.toUpperCase() : "UNKNOWN_HANDLE"}
          </Typography>
          <Typography variant="caption" sx={{ color: COLORS.textSecondary, display: 'block', fontFamily: 'monospace', mt: 0.5 }}>
            TEAM: {agent.team ? agent.team.toUpperCase() : "—"} | {agent.id.split('-')[0].toUpperCase()}
          </Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', color: COLORS.accent }}>
            {agent.ip}
          </Typography>
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <OSIcon os={agent.os} />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: COLORS.textSecondary }}>
              {agent.os}
            </Typography>
          </Box>
        </TableCell>

        <TableCell>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Cpu size={14} color={agent.cpu > 80 ? COLORS.red : COLORS.textMuted} />
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: agent.cpu > 80 ? COLORS.red : COLORS.textPrimary }}>
                {agent.cpu}%
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MemoryStick size={14} color={agent.ram > 80 ? COLORS.red : COLORS.textMuted} />
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: agent.ram > 80 ? COLORS.red : COLORS.textPrimary }}>
                {agent.ram}%
              </Typography>
            </Box>
          </Box>
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{
              width: 8, height: 8, bgcolor: statusColor,
              ...(agent.status === 'OFFLINE' && {
                animation: 'pulse-dot 1.5s infinite',
                '@keyframes pulse-dot': {
                  '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                  '50%': { opacity: 0.4, transform: 'scale(1.3)' },
                },
              }),
            }} />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 800, color: statusColor }}>
              {agent.status === 'ONLINE' ? (isRed ? 'COMPROMISED' : isYellow ? 'WARNING' : 'ONLINE') : 'OFFLINE'}
            </Typography>
          </Box>
        </TableCell>
        <TableCell>
          {(() => {
            const diffMs = Date.now() - agent.lastSeen;
            const isStale = diffMs > 300000; // 5 minutes
            return (
              <Typography variant="caption" sx={{
                fontFamily: 'monospace', fontWeight: 600,
                color: isStale ? COLORS.red : COLORS.textMuted,
              }}>
                {formatUptime(agent.lastSeen)}
              </Typography>
            );
          })()}
        </TableCell>
        <TableCell align="right">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, max-content)', gap: 0.5, justifyContent: 'flex-end' }}>
            <Tooltip title="Edit Details">
              <IconButton 
                size="small" 
                onClick={(e) => { e.stopPropagation(); setEditTarget(agent); }}
                sx={{ borderRadius: 0, color: COLORS.accent, border: `1px solid ${alpha(COLORS.accent, 0.3)}`, '&:hover': { bgcolor: alpha(COLORS.accent, 0.1) } }}
              >
                <Edit2 size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete Node">
              <IconButton 
                size="small" 
                onClick={(e) => { e.stopPropagation(); onDelete(agent.id); }}
                sx={{ borderRadius: 0, color: COLORS.red, border: `1px solid ${alpha(COLORS.red, 0.3)}`, '&:hover': { bgcolor: alpha(COLORS.red, 0.1) } }}
              >
                <Trash2 size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Send AI Violation Warning (Screen Lock)">
              <IconButton 
                size="small" 
                onClick={(e) => { e.stopPropagation(); setWarningTarget(agent); }}
                sx={{ 
                  borderRadius: 0, 
                  color: COLORS.red, 
                  bgcolor: alpha(COLORS.red, 0.1),
                  border: `1px solid ${COLORS.red}`, 
                  '&:hover': { bgcolor: COLORS.red, color: '#000' } 
                }}
              >
                <AlertOctagon size={16} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Monitor Contestant">
              <IconButton 
                size="small" 
                onClick={(e) => { e.stopPropagation(); navigate(`/contestants/${agent.id}`, { state: { fromFleet: true } }); }}
                sx={{ borderRadius: 0, color: COLORS.textMuted, border: `1px solid ${COLORS.borderLight}`, '&:hover': { bgcolor: alpha(COLORS.accent, 0.1), color: COLORS.accent, borderColor: COLORS.accent } }}
              >
                <Terminal size={16} />
              </IconButton>
            </Tooltip>
          </Box>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0, border: 'none' }} colSpan={8}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 2, bgcolor: COLORS.bgDeep, p: 2, border: `1px solid ${COLORS.borderLight}` }}>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.accent, display: 'block', mb: 0.5, fontFamily: 'monospace' }}>
                    AGENT VERSION:
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', color: agent.version.includes('2.1.4') ? COLORS.textSecondary : COLORS.yellow, fontWeight: 700 }}>
                    {agent.version} {agent.version.includes('2.1.4') ? '' : '(OUTDATED)'}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.accent, display: 'block', mb: 0.5, fontFamily: 'monospace' }}>
                    LAST SEEN EXACT:
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>
                    {new Date(agent.lastSeen).toISOString()}
                  </Typography>
                </Grid>
              </Grid>
              <Typography variant="caption" sx={{ fontWeight: 800, color: COLORS.accent, display: 'block', mb: 1, fontFamily: 'monospace' }}>
                RAW FINGERPRINT DATA:
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', color: COLORS.textMuted, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {agent.raw_fingerprint?.split('\n').map(line => line.trimEnd()).join('\n')}
              </Typography>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </React.Fragment>
  );
}

export default function FleetCommandPage() {
  const navigate = useNavigate();
  const [warningTarget, setWarningTarget] = useState(null);
  const [selectedComp, setSelectedComp] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortConfig, setSortConfig] = useState({ key: 'lastSeen', direction: 'desc' });
  const [selectedNodes, setSelectedNodes] = useState([]);
  const queryClient = useQueryClient();

  const { data: recentIncidents } = useQuery({
    queryKey: ['fleet-incidents'],
    queryFn: () => incidentsAPI.list({ limit: 50 }).then(r => r.data),
    refetchInterval: 5000,
  });

  // Tactical Event Log Filters State
  const [logFilters, setLogFilters] = useState({
    paused: false,
    minSev: 0,
    hideScreenLocks: false,
    search: ''
  });
  const [frozenIncidents, setFrozenIncidents] = useState([]);

  React.useEffect(() => {
    if (!logFilters.paused && recentIncidents) {
      setFrozenIncidents(recentIncidents);
    }
  }, [recentIncidents, logFilters.paused]);

  const filteredLogs = frozenIncidents.filter(inc => {
    if (logFilters.minSev > 0 && (inc.weight || 0) < logFilters.minSev) return false;
    if (logFilters.hideScreenLocks && inc.indicator_type === 'SCREEN_LOCK_ISSUED') return false;
    if (logFilters.search) {
      const q = logFilters.search.toLowerCase();
      const target = (inc.target || inc.contestant_id || '').toLowerCase();
      const type = (inc.indicator_type || '').toLowerCase();
      if (!target.includes(q) && !type.includes(q)) return false;
    }
    return true;
  });

  const { data: competitionsData } = useQuery({
    queryKey: ['competitions'],
    queryFn: () => competitionsAPI.list().then(r => r.data),
  });

  const { data: liveAgents, refetch } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsAPI.list().then(r => r.data),
    refetchInterval: 10000,
  });

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ handle: '', team: '' });

  React.useEffect(() => {
    if (editTarget) {
      setEditForm({ handle: editTarget.handle || '', team: editTarget.team || '' });
    }
  }, [editTarget]);

  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  const handleDelete = async (id) => {
    setConfirmDialog({
      open: true,
      title: "Delete Node",
      message: "Are you sure you want to permanently delete this node?",
      onConfirm: async () => {
        try {
          await contestantsAPI.delete(id);
          queryClient.invalidateQueries({ queryKey: ['agents'] });
          refetch();
          toast.success("Node deleted successfully.");
        } catch (err) {
          console.error(err);
          toast.error("Failed to delete node.");
        }
      }
    });
  };

  const handleEditSave = async () => {
    try {
      await contestantsAPI.update(editTarget.id, editForm);
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      refetch();
      toast.success("Node updated successfully.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update node.");
    }
  };

  const agents = (liveAgents || [])
    .filter(a => selectedComp === 'ALL' || a.competition_id === selectedComp)
    .map(a => ({
      ...a, lastSeen: a.last_seen ? new Date(a.last_seen).getTime() : Date.now() - 999999,
    }))
    .filter(a => {
      // Status Filter
      if (statusFilter === 'ONLINE' && a.status !== 'ONLINE') return false;
      if (statusFilter === 'OFFLINE' && a.status !== 'OFFLINE') return false;
      if (statusFilter === 'WARNING') {
        const isWarn = (a.latest_level === 'YELLOW' || a.latest_level === 'ELEVATED') && a.status !== 'OFFLINE';
        if (!isWarn) return false;
      }
      if (statusFilter === 'COMPROMISED') {
        const isComp = (a.latest_level === 'RED' || a.latest_level === 'CRITICAL' || a.screen_lock_count > 0) && a.status !== 'OFFLINE';
        if (!isComp) return false;
      }
      
      // Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          (a.handle && a.handle.toLowerCase().includes(query)) ||
          (a.team && a.team.toLowerCase().includes(query)) ||
          (a.ip && a.ip.includes(query)) ||
          (a.id && a.id.toLowerCase().includes(query))
        );
      }
      return true;
    });

  // Apply Sorting
  agents.sort((a, b) => {
    let valA = a[sortConfig.key] || '';
    let valB = b[sortConfig.key] || '';
    
    // Custom sort values
    if (sortConfig.key === 'id') { valA = a.handle || a.id; valB = b.handle || b.id; }
    if (sortConfig.key === 'status') { valA = a.status === 'ONLINE' ? (a.latest_level === 'RED' ? 1 : 2) : 3; valB = b.status === 'ONLINE' ? (b.latest_level === 'RED' ? 1 : 2) : 3; }

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedNodes(agents.map(a => a.id));
    else setSelectedNodes([]);
  };

  const handleSelectOne = (id) => {
    setSelectedNodes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Calculate Summary Stats (from all agents in selected competition, ignoring search/filter)
  const baseAgents = (liveAgents || []).filter(a => selectedComp === 'ALL' || a.competition_id === selectedComp);
  const totalNodes = baseAgents.length;
  const onlineNodes = baseAgents.filter(a => a.status === 'ONLINE').length;
  const compromisedNodes = baseAgents.filter(a => (a.latest_level === 'RED' || a.latest_level === 'CRITICAL' || a.screen_lock_count > 0) && a.status !== 'OFFLINE').length;
  const warningNodes = baseAgents.filter(a => (a.latest_level === 'YELLOW' || a.latest_level === 'ELEVATED') && a.status !== 'OFFLINE').length;
  const avgCpu = onlineNodes > 0 ? Math.round(baseAgents.filter(a => a.status === 'ONLINE').reduce((acc, a) => acc + (a.cpu || 0), 0) / onlineNodes) : 0;

  const handleSendWarning = async () => {
    if (!warningTarget) return;
    setConfirmDialog({
      open: true,
      title: "Send Warning",
      message: `Are you sure you want to deploy a Screen-Lock Warning to ${warningTarget.name}?`,
      onConfirm: async () => {
        try {
          await contestantsAPI.sendWarning(warningTarget.id);
          toast.success("Warning payload queued successfully. It will execute on the next heartbeat.");
          setWarningTarget(null);
        } catch (err) {
          console.error(err);
          toast.error("Failed to queue warning payload.");
        }
      }
    });
  };

  const handleBulkWarning = async () => {
    setConfirmDialog({
      open: true,
      title: "Mass Warning Deployment",
      message: `Deploy Screen-Lock Warning Payload to ${selectedNodes.length} selected nodes?`,
      onConfirm: async () => {
        try {
          await Promise.all(selectedNodes.map(id => contestantsAPI.sendWarning(id)));
          toast.success(`Warning payloads queued for ${selectedNodes.length} nodes.`);
          setSelectedNodes([]);
        } catch (err) {
          console.error(err);
          toast.error("Failed to queue some mass warning payloads.");
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    setConfirmDialog({
      open: true,
      title: "Mass Node Deletion",
      message: `Permanently delete ${selectedNodes.length} selected nodes? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await Promise.all(selectedNodes.map(id => contestantsAPI.delete(id)));
          queryClient.invalidateQueries({ queryKey: ['agents'] });
          refetch();
          toast.success(`${selectedNodes.length} nodes deleted successfully.`);
          setSelectedNodes([]);
        } catch (err) {
          console.error(err);
          toast.error("Failed to delete some nodes.");
        }
      }
    });
  };

  return (
    <Box className="fade-in" sx={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Server size={28} color={COLORS.accent} />
            FLEET COMMAND
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textMuted, mt: 1, fontFamily: 'monospace' }}>
            GLOBAL AGENT TOPOLOGY & SYSTEM HEALTH
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {selectedComp !== 'ALL' && (
            <Button
              variant="contained"
              onClick={() => navigate(`/competitions/${selectedComp}`)}
              startIcon={<Terminal size={16} />}
              sx={{ bgcolor: COLORS.accent, color: '#000', borderRadius: 0, fontFamily: 'monospace', fontWeight: 800, '&:hover': { bgcolor: '#fff' } }}
            >
              MONITOR ARENA
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', lg: 'row' }, flex: 1, minHeight: 0 }}>
        {/* Main Content Area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, overflowY: 'auto', pr: 1,
            '&::-webkit-scrollbar': { width: '4px' },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': { background: alpha(COLORS.border, 0.8) }
        }}>
          {/* System Health Summary */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 3 }}>
        <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.borderLight}`, borderRadius: 0 }}>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="caption" sx={{ color: COLORS.textMuted, fontFamily: 'monospace', fontWeight: 800 }}>TOTAL NODES</Typography>
              <Typography variant="h4" sx={{ color: COLORS.textPrimary, fontFamily: 'monospace', fontWeight: 800 }}>{totalNodes}</Typography>
            </Box>
            <Server size={32} color={COLORS.textMuted} />
          </Box>
        </Card>
        <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.green}`, borderRadius: 0, position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, bgcolor: COLORS.green }} />
          <Box sx={{ p: 2, pl: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="caption" sx={{ color: COLORS.green, fontFamily: 'monospace', fontWeight: 800 }}>ONLINE</Typography>
              <Typography variant="h4" sx={{ color: COLORS.textPrimary, fontFamily: 'monospace', fontWeight: 800 }}>{onlineNodes}</Typography>
            </Box>
            <Wifi size={32} color={COLORS.green} />
          </Box>
        </Card>
        <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${compromisedNodes > 0 ? COLORS.red : warningNodes > 0 ? COLORS.yellow : COLORS.borderLight}`, borderRadius: 0, position: 'relative', overflow: 'hidden' }}>
            <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, bgcolor: compromisedNodes > 0 ? COLORS.red : warningNodes > 0 ? COLORS.yellow : 'transparent' }} />
          <Box sx={{ p: 2, pl: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="caption" sx={{ color: compromisedNodes > 0 ? COLORS.red : warningNodes > 0 ? COLORS.yellow : COLORS.textMuted, fontFamily: 'monospace', fontWeight: 800 }}>ALERTS (COMP / WARN)</Typography>
              <Typography variant="h4" sx={{ color: COLORS.textPrimary, fontFamily: 'monospace', fontWeight: 800 }}>
                <span style={{ color: compromisedNodes > 0 ? COLORS.red : 'inherit' }}>{compromisedNodes}</span>
                <span style={{ color: COLORS.textMuted, fontSize: '1rem', margin: '0 4px' }}>/</span>
                <span style={{ color: warningNodes > 0 ? COLORS.yellow : 'inherit' }}>{warningNodes}</span>
              </Typography>
            </Box>
            {compromisedNodes > 0 ? <ShieldAlert size={32} color={COLORS.red} /> : warningNodes > 0 ? <AlertOctagon size={32} color={COLORS.yellow} /> : <Shield size={32} color={COLORS.textMuted} />}
          </Box>
        </Card>
        <Card sx={{ bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.borderLight}`, borderRadius: 0 }}>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="caption" sx={{ color: COLORS.textMuted, fontFamily: 'monospace', fontWeight: 800 }}>AVG CPU LOAD</Typography>
              <Typography variant="h4" sx={{ color: avgCpu > 80 ? COLORS.red : COLORS.textPrimary, fontFamily: 'monospace', fontWeight: 800 }}>{avgCpu}%</Typography>
            </Box>
            <Activity size={32} color={avgCpu > 80 ? COLORS.red : COLORS.textMuted} />
          </Box>
        </Card>
      </Box>

      {/* Toolbar: Tabs + Search/Filter */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pb: 1, gap: 2, flexWrap: 'wrap' }}>
        <Tabs
          value={selectedComp}
          onChange={(e, val) => setSelectedComp(val)}
          textColor="inherit"
          indicatorColor="primary"
          sx={{
            minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, fontFamily: 'monospace', fontWeight: 600, px: 3, color: COLORS.textMuted },
            '& .Mui-selected': { color: `${COLORS.accent} !important` },
            '& .MuiTabs-indicator': { backgroundColor: COLORS.accent }
          }}
        >
          <Tab value="ALL" label="ALL NODES" />
          {competitionsData?.map((comp) => (
            <Tab key={comp.id} value={comp.id} label={comp.name.toUpperCase()} />
          ))}
        </Tabs>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            placeholder="Search Handle, IP, or Node ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{ width: 300 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} color={COLORS.textMuted} />
                </InputAdornment>
              ),
              sx: { fontFamily: 'monospace', borderRadius: 0, bgcolor: COLORS.bgDeep }
            }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              displayEmpty
              startAdornment={
                <InputAdornment position="start" sx={{ ml: 1 }}>
                  <Filter size={16} color={COLORS.textMuted} />
                </InputAdornment>
              }
              sx={{ fontFamily: 'monospace', borderRadius: 0, bgcolor: COLORS.bgDeep, '& .MuiSelect-select': { py: 1 } }}
            >
              <MenuItem value="ALL" sx={{ fontFamily: 'monospace' }}>ALL STATUS</MenuItem>
              <MenuItem value="ONLINE" sx={{ fontFamily: 'monospace', color: COLORS.green }}>ONLINE</MenuItem>
              <MenuItem value="WARNING" sx={{ fontFamily: 'monospace', color: COLORS.yellow }}>WARNING</MenuItem>
              <MenuItem value="COMPROMISED" sx={{ fontFamily: 'monospace', color: COLORS.red }}>COMPROMISED</MenuItem>
              <MenuItem value="OFFLINE" sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>OFFLINE</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* Bulk Action Toolbar */}
      {selectedNodes.length > 0 && (
        <Paper sx={{ p: 2, bgcolor: alpha(COLORS.accent, 0.1), border: `1px solid ${COLORS.accent}`, borderRadius: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontFamily: 'monospace', fontWeight: 800, color: COLORS.accent }}>
            {selectedNodes.length} NODES SELECTED
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button 
              variant="contained" 
              onClick={handleBulkWarning} 
              startIcon={<AlertOctagon size={16} />}
              sx={{ bgcolor: COLORS.red, color: '#000', fontWeight: 800, fontFamily: 'monospace', borderRadius: 0, '&:hover': { bgcolor: '#fff', color: COLORS.red } }}
            >
              MASS WARNING
            </Button>
            <Button 
              variant="outlined" 
              onClick={handleBulkDelete} 
              startIcon={<Trash2 size={16} />}
              sx={{ borderColor: COLORS.red, color: COLORS.red, fontWeight: 800, fontFamily: 'monospace', borderRadius: 0, '&:hover': { bgcolor: alpha(COLORS.red, 0.1) } }}
            >
              DELETE SELECTED
            </Button>
          </Box>
        </Paper>
      )}

      {/* Agents Table */}
      <TableContainer component={Paper} sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        {agents.length > 0 ? (
          <Table>
            <TableHead sx={{ bgcolor: COLORS.bgDeep }}>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox 
                    checked={agents.length > 0 && selectedNodes.length === agents.length}
                    indeterminate={selectedNodes.length > 0 && selectedNodes.length < agents.length}
                    onChange={handleSelectAll}
                    sx={{ color: COLORS.borderLight, '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: COLORS.accent } }}
                  />
                </TableCell>
                <TableCell sx={{ width: 40 }} />
                {[
                  { id: 'id', label: 'NODE_ID' },
                  { id: 'ip', label: 'IP_ADDRESS' },
                  { id: 'os', label: 'OS' },
                  { id: 'cpu', label: 'RESOURCES' },
                  { id: 'status', label: 'STATUS' },
                  { id: 'lastSeen', label: 'LAST_SEEN' },
                ].map((headCell) => (
                  <TableCell key={headCell.id}>
                    <TableSortLabel
                      active={sortConfig.key === headCell.id}
                      direction={sortConfig.key === headCell.id ? sortConfig.direction : 'asc'}
                      onClick={() => handleSort(headCell.id)}
                      sx={{ 
                        fontFamily: 'monospace', color: COLORS.textMuted,
                        '&.Mui-active': { color: COLORS.accent },
                        '& .MuiTableSortLabel-icon': { color: `${COLORS.accent} !important` }
                      }}
                    >
                      {headCell.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>ACTION</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {agents.map((agent) => (
                <AgentRow 
                  key={agent.id} 
                  agent={agent} 
                  selected={selectedNodes.includes(agent.id)}
                  onSelect={handleSelectOne}
                  setWarningTarget={setWarningTarget} 
                  setEditTarget={setEditTarget} 
                  onDelete={handleDelete} 
                />
              ))}
            </TableBody>
          </Table>
        ) : (
          <Box sx={{ flex: 1, py: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <Server size={64} color={alpha(COLORS.textMuted, 0.3)} />
            <Typography variant="h6" sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>NO AGENTS FOUND</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', color: alpha(COLORS.textMuted, 0.7) }}>
              Adjust your search/filters or deploy new nodes to this arena.
            </Typography>
          </Box>
        )}
      </TableContainer>
        </Box>

        {/* Live Event Stream Sidebar */}
        <Box sx={{ width: { xs: '100%', lg: 350 }, display: 'flex', flexDirection: 'column', flexShrink: 0, gap: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${COLORS.borderLight}`, pb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontWeight: 800, color: COLORS.accent, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Activity size={16} /> TACTICAL EVENT LOG
            </Typography>
            <Tooltip title={logFilters.paused ? "Resume Stream" : "Pause Stream"}>
              <IconButton 
                size="small" 
                onClick={() => setLogFilters(p => ({...p, paused: !p.paused}))}
                sx={{ 
                  color: logFilters.paused ? COLORS.red : COLORS.textMuted,
                  border: `1px solid ${logFilters.paused ? COLORS.red : 'transparent'}`,
                  borderRadius: 0,
                  p: 0.5
                }}
              >
                {logFilters.paused ? <Play size={16} /> : <Pause size={16} />}
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
             <TextField 
                size="small" 
                placeholder="Filter Target or Event..." 
                value={logFilters.search}
                onChange={e => setLogFilters(p => ({...p, search: e.target.value}))}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><Search size={14} color={COLORS.textMuted}/></InputAdornment>,
                  sx: { fontFamily: 'monospace', fontSize: '0.8rem', bgcolor: COLORS.bgDeep, borderRadius: 0, '& fieldset': { borderColor: COLORS.borderLight } }
                }}
             />
             <Box sx={{ display: 'flex', gap: 1 }}>
                <FormControl size="small" sx={{ flex: 1 }}>
                  <Select 
                     value={logFilters.minSev}
                     onChange={e => setLogFilters(p => ({...p, minSev: e.target.value}))}
                     displayEmpty
                     sx={{ fontFamily: 'monospace', fontSize: '0.75rem', borderRadius: 0, bgcolor: COLORS.bgDeep, '& fieldset': { borderColor: COLORS.borderLight } }}
                  >
                     <MenuItem value={0} sx={{fontFamily: 'monospace', fontSize:'0.75rem'}}>ALL SEVERITIES</MenuItem>
                     <MenuItem value={30} sx={{fontFamily: 'monospace', fontSize:'0.75rem', color: COLORS.yellow}}>WARNING+ (SEV-30+)</MenuItem>
                     <MenuItem value={80} sx={{fontFamily: 'monospace', fontSize:'0.75rem', color: COLORS.red}}>CRITICAL (SEV-80+)</MenuItem>
                  </Select>
                </FormControl>
                <Tooltip title={logFilters.hideScreenLocks ? "Show Screen Locks" : "Hide Screen Locks"}>
                  <Button 
                    variant={logFilters.hideScreenLocks ? "contained" : "outlined"}
                    onClick={() => setLogFilters(p => ({...p, hideScreenLocks: !p.hideScreenLocks}))}
                    sx={{ 
                      minWidth: 0, p: 1, borderRadius: 0,
                      bgcolor: logFilters.hideScreenLocks ? alpha(COLORS.accent, 0.2) : 'transparent',
                      borderColor: logFilters.hideScreenLocks ? COLORS.accent : COLORS.borderLight, 
                      color: logFilters.hideScreenLocks ? COLORS.accent : COLORS.textMuted,
                      '&:hover': { bgcolor: alpha(COLORS.accent, 0.3) }
                    }}
                  >
                    <Filter size={16} />
                  </Button>
                </Tooltip>
             </Box>
          </Box>

          <Paper sx={{ flex: 1, bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 400, maxHeight: { xs: 400, lg: 'none' } }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', flex: 1,
              '&::-webkit-scrollbar': { width: '4px' },
              '&::-webkit-scrollbar-track': { background: 'transparent' },
              '&::-webkit-scrollbar-thumb': { background: alpha(COLORS.accent, 0.3) }
            }}>
              {filteredLogs.length === 0 ? (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, opacity: 0.5 }}>
                  <Activity size={32} color={COLORS.textMuted} />
                  <Typography variant="caption" sx={{ color: COLORS.textMuted, fontFamily: 'monospace', letterSpacing: '0.05em' }}>NO RECENT EVENTS</Typography>
                </Box>
              ) : filteredLogs.map(inc => {
                const isCrit = inc.weight >= 80;
                const isWarn = inc.weight >= 30 && inc.weight < 80;
                const eColor = isCrit ? COLORS.red : isWarn ? COLORS.yellow : COLORS.borderLight;
                const eBg = isCrit ? alpha(COLORS.red, 0.05) : isWarn ? alpha(COLORS.yellow, 0.05) : 'transparent';
                
                return (
                  <Box key={inc.id} sx={{ 
                    display: 'flex', flexDirection: 'column', gap: 1, 
                    p: 2,
                    bgcolor: eBg,
                    borderLeft: `3px solid ${eColor}`,
                    borderBottom: `1px solid ${alpha(COLORS.borderLight, 0.2)}`,
                    transition: 'all 0.2s',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: isCrit ? alpha(COLORS.red, 0.1) : isWarn ? alpha(COLORS.yellow, 0.1) : alpha(COLORS.borderLight, 0.1) }
                  }} onClick={() => navigate('/incidents')}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" sx={{ color: COLORS.textMuted, fontFamily: 'monospace' }}>
                        [{new Date(inc.detected_at).toLocaleTimeString()}]
                      </Typography>
                      <Box sx={{ px: 1, py: 0.2, bgcolor: alpha(eColor, 0.15), color: eColor, border: `1px solid ${alpha(eColor, 0.3)}` }}>
                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 800, fontFamily: 'monospace' }}>
                          SEV-{inc.weight.toFixed(1)}
                        </Typography>
                      </Box>
                    </Box>
                    
                    <Typography sx={{ color: isCrit ? COLORS.red : COLORS.textPrimary, fontFamily: 'monospace', fontWeight: 800, fontSize: '0.85rem' }}>
                      {inc.indicator_type || 'UNKNOWN EVENT'}
                    </Typography>
                    
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Typography variant="caption" sx={{ color: COLORS.textMuted, fontFamily: 'monospace' }}>
                        TARGET_NODE: <strong style={{ color: COLORS.accent }}>{inc.target || `NODE_${(inc.contestant_id || 'SYS').substring(0,8).toUpperCase()}`}</strong>
                      </Typography>
                      {inc.evidence && (
                        <Typography variant="caption" sx={{ color: COLORS.textSecondary, fontFamily: 'monospace', borderLeft: `2px solid ${alpha(COLORS.textMuted, 0.3)}`, pl: 1, ml: 1, mt: 0.5 }}>
                          {inc.evidence}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Paper>
        </Box>
      </Box>

      {/* Warning Deployment Dialog */}
      <Dialog 
        open={Boolean(warningTarget)} 
        onClose={() => setWarningTarget(null)}
        PaperProps={{ sx: { bgcolor: COLORS.bgDeep, border: `2px solid ${COLORS.red}`, borderRadius: 0 } }}
      >
        <DialogTitle sx={{ color: COLORS.red, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 2, fontFamily: 'monospace' }}>
          <AlertOctagon size={24} /> DEPLOY WARNING PAYLOAD
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: COLORS.textPrimary, mb: 2 }}>
            You are about to deploy the <strong>Screen-Lock Warning Payload</strong> to <span style={{ color: COLORS.accent, fontFamily: 'monospace' }}>{warningTarget?.id} ({warningTarget?.ip})</span>.
          </DialogContentText>
          <DialogContentText sx={{ color: COLORS.textSecondary, fontSize: '0.9rem' }}>
            Since network isolation is not enforced, this action will freeze the contestant's screen with a massive AI Policy Violation notice. They must acknowledge the warning to dismiss the lock.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setWarningTarget(null)} sx={{ color: COLORS.textMuted, fontFamily: 'monospace' }}>ABORT</Button>
          <Button 
            variant="contained" 
            onClick={handleSendWarning} 
            startIcon={<Send size={16} />}
            sx={{ bgcolor: COLORS.red, color: '#000', fontWeight: 900, borderRadius: 0, fontFamily: 'monospace', '&:hover': { bgcolor: '#fff', color: COLORS.red } }}
          >
            EXECUTE PAYLOAD
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Node Dialog */}
      <Dialog open={Boolean(editTarget)} onClose={() => setEditTarget(null)} PaperProps={{ sx: { bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.borderLight}`, borderRadius: 0, minWidth: 400 } }}>
        <DialogTitle sx={{ color: COLORS.textPrimary, fontFamily: 'monospace', fontWeight: 800 }}>EDIT NODE DETAILS</DialogTitle>
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

      {/* Confirmation Dialog */}
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
