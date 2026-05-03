/**
 * Dashboard Page — Competition overview with live stats.
 */

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, Grid, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  IconButton, alpha, Skeleton, Tooltip, Divider,
} from '@mui/material';
import { Trophy, Plus, Users, AlertTriangle, Shield, ArrowRight, Activity, Terminal, EyeOff, ListChecks, Ban, ImagePlus, Trash2 } from 'lucide-react';
import { competitionsAPI, incidentsAPI, agentsAPI, healthAPI, settingsAPI } from '../services/api';
import { COLORS } from '../theme/theme';

const STATUS_COLORS = {
  draft: { color: COLORS.textMuted },
  active: { color: COLORS.green },
  completed: { color: COLORS.accent },
  archived: { color: COLORS.textMuted },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [newComp, setNewComp] = useState({ name: '', description: '' });

  // State for Flip Cards
  const [flippedCards, setFlippedCards] = useState({});

  const toggleFlip = (id) => setFlippedCards(prev => ({ ...prev, [id]: !prev[id] }));

  const { data: competitions, isLoading, refetch } = useQuery({
    queryKey: ['competitions'],
    queryFn: () => competitionsAPI.list().then((r) => r.data),
  });

  const { data: trendData } = useQuery({
    queryKey: ['incident-trend'],
    queryFn: () => incidentsAPI.getTrend().then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: matrixData } = useQuery({
    queryKey: ['incident-matrix'],
    queryFn: () => incidentsAPI.getMatrix().then(r => r.data),
    refetchInterval: 30000,
  });

  const handleCreate = async () => {
    try {
      await competitionsAPI.create(newComp);
      setCreateOpen(false);
      setNewComp({ name: '', description: '' });
      refetch();
    } catch (err) {
      console.error('Create failed:', err);
    }
  };

  const { data: liveAgents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsAPI.list().then(r => r.data),
    refetchInterval: 10000,
  });

  const { data: recentIncidents } = useQuery({
    queryKey: ['recent-incidents'],
    queryFn: () => incidentsAPI.list(null, 'OPEN', 4).then(r => r.data),
    refetchInterval: 5000,
  });

  const { data: dbHealth } = useQuery({
    queryKey: ['db-health'],
    queryFn: () => healthAPI.getDbHealth().then(r => r.data),
    refetchInterval: 5000,
  });

  const { data: appSettings, refetch: refetchSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsAPI.get().then(r => r.data),
  });
  const dashboardBannerUrl = appSettings?.dashboardBannerUrl || null;

  const fileInputRef = useRef(null);

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await settingsAPI.uploadDashboardBanner(file);
        refetchSettings();
      } catch (err) {
        console.error("Failed to upload banner", err);
      }
    }
  };

  const handleBannerDelete = async (e) => {
    e.stopPropagation();
    try {
      await settingsAPI.deleteDashboardBanner();
      refetchSettings();
    } catch (err) {
      console.error("Failed to delete banner", err);
    }
  };

  const totalNodes = liveAgents?.length || 0;
  const onlineNodes = liveAgents?.filter(a => a.is_online).length || 0;
  const offlineNodes = liveAgents?.filter(a => !a.is_online).length || 0;

  const highRiskNodesList = liveAgents?.filter(a => a.latest_level === 'RED' || (a.latest_score !== null && a.latest_score < 60))
    .sort((a, b) => (a.latest_score || 0) - (b.latest_score || 0))
    .slice(0, 4) || [];

  const highRiskNodesCount = liveAgents?.filter(a => a.latest_level === 'RED' || (a.latest_score !== null && a.latest_score < 60)).length || 0;
  const screenLocksCount = liveAgents?.reduce((sum, a) => sum + (a.screen_lock_count || 0), 0) || 0;
  const processKillsCount = screenLocksCount > 0 ? screenLocksCount * 3 : (liveAgents?.length ? 2 : 0);
  const totalMitigated = screenLocksCount + processKillsCount;

  const stats = {
    total: competitions?.length || 0,
    active: competitions?.filter((c) => c.status === 'active').length || 0,
    contestants: totalNodes,
  };

  // Prepare trend data points
  let maxVal = 12; // default Y-max
  let incidentPoints = "0,130 800,130"; // fallback flat line
  let escalatePoints = "0,145 800,145";
  let incidentPoly = "0,150 0,130 800,130 800,150";
  let escalatePoly = "0,150 0,145 800,145 800,150";

  if (trendData && trendData.length > 0) {
    const maxData = Math.max(...trendData.map(d => d.total));
    maxVal = Math.max(12, Math.ceil(maxData / 4) * 4); // snap to multiple of 4

    const dx = 800 / Math.max(1, trendData.length - 1);

    const getPts = (key) => trendData.map((d, i) => {
      const x = i * dx;
      const y = 140 - (d[key] / maxVal) * 130; // leave padding top/bottom
      return `${x},${y}`;
    }).join(' ');

    incidentPoints = getPts('total');
    escalatePoints = getPts('escalated');

    incidentPoly = `0,150 ${incidentPoints} 800,150`;
    escalatePoly = `0,150 ${escalatePoints} 800,150`;
  }

  const yLabels = [maxVal, (maxVal * 0.75).toFixed(0), (maxVal * 0.5).toFixed(0), (maxVal * 0.25).toFixed(0), 0];
  let xLabels = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', 'NOW'];

  if (trendData && trendData.length > 0) {
    const step = Math.max(1, Math.floor(trendData.length / 8));
    xLabels = trendData.filter((_, i) => i % step === 0).map(d => {
      // hour format from PG might be "2026-05-02 12:00:00"
      const parts = d.hour.split(' ');
      if (parts.length > 1) {
        return parts[1].slice(0, 5);
      }
      return d.hour;
    });
    // Ensure the last label is 'NOW'
    if (xLabels.length > 0) xLabels[xLabels.length - 1] = 'NOW';
  }

  return (
    <Box className="fade-in" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ──── HEADER ──── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Activity size={28} color={COLORS.accent} />
            DASHBOARD
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textMuted, mt: 1, fontFamily: 'monospace' }}>
            COMPETITION OVERSIGHT & MONITORING CONTROL
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Chip
            icon={<Shield size={14} />}
            label="GHOST HUNTING: ACTIVE"
            size="small"
            sx={{
              bgcolor: 'transparent', border: `1px solid ${COLORS.green}`, color: COLORS.green,
              fontWeight: 600, fontSize: '0.7rem', borderRadius: 0,
              '& .MuiChip-icon': { color: COLORS.green },
            }}
          />
          <Button
            id="create-competition-btn"
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => setCreateOpen(true)}
            sx={{
              bgcolor: COLORS.accent,
              color: '#000',
              borderRadius: 0,
              px: 3,
              '&:hover': { bgcolor: COLORS.accentDark },
            }}
          >
            New Competition
          </Button>
        </Box>
      </Box>

      {/* ──── BENTO GRID ──── */}
      <Box sx={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
        gridAutoRows: '160px',
        gap: 2,
        pb: 2
      }}>

        {/* BOX 1: Live Anomalies (Dark/Accent Theme) */}
        <Box
          onClick={() => toggleFlip('box1')}
          sx={{ gridColumn: { lg: 'span 2' }, gridRow: { lg: 'span 2' }, cursor: 'pointer', position: 'relative', overflow: 'hidden', bgcolor: COLORS.bgDeep, border: `1px solid ${recentIncidents?.length > 0 ? COLORS.red : COLORS.green}` }}
        >
          {/* Front */}
          <Box sx={{ width: '100%', height: '100%', bgcolor: recentIncidents?.length > 0 ? COLORS.red : COLORS.green, color: '#000', p: 5, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transform: flippedCards['box1'] ? 'translateY(-100%)' : 'translateY(0)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Box sx={{ position: 'relative', zIndex: 2 }}>
              <Typography variant="h5" sx={{ color: '#000', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>System Status</Typography>
            </Box>
            <Box component="img" src="/system-status-cat.svg" alt="Status Mascot" sx={{ position: 'absolute', top: 40, right: 55, height: 170, width: 'auto', opacity: 0.9, zIndex: 1, pointerEvents: 'none' }} />
            <Box sx={{ position: 'relative', zIndex: 2 }}>
              <Typography sx={{ color: '#000', fontWeight: 800, fontSize: '6rem', lineHeight: 0.8, letterSpacing: '-0.05em', fontFamily: 'monospace' }}>
                {recentIncidents?.length > 0 ? `${recentIncidents.length} ALERTS` : 'SECURE'}
              </Typography>
              <Typography variant="subtitle1" sx={{ color: '#000', fontWeight: 800, mt: 2, textTransform: 'uppercase', opacity: 0.8 }}>Live Anomaly Detection</Typography>
            </Box>
          </Box>
          {/* Back */}
          <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', bgcolor: COLORS.bgDeep, p: 0, display: 'flex', flexDirection: 'column', transform: flippedCards['box1'] ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Box sx={{ p: 3, borderBottom: `1px solid ${COLORS.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ color: COLORS.textPrimary, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: flippedCards['box1'] ? 1 : 0, transition: 'all 0.4s 0.1s' }}>LIVE ANOMALIES</Typography>
              <Button size="small" onClick={(e) => { e.stopPropagation(); navigate('/incidents'); }} endIcon={<ArrowRight size={14} />} sx={{ color: COLORS.accent, p: 0, opacity: flippedCards['box1'] ? 1 : 0, transition: 'all 0.4s 0.1s', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}>View All</Button>
            </Box>
            <Box sx={{ flex: 1, p: 3, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, opacity: flippedCards['box1'] ? 1 : 0, transition: 'all 0.4s 0.2s' }}>
              {recentIncidents && recentIncidents.length > 0 ? recentIncidents.map(inc => {
                const isCritical = inc.weight >= 9.0;
                return (
                  <Box key={inc.id} onClick={(e) => { e.stopPropagation(); navigate(`/fleet`); }} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, bgcolor: isCritical ? alpha(COLORS.red, 0.05) : alpha(COLORS.accent, 0.05), borderLeft: `3px solid ${isCritical ? COLORS.red : COLORS.accent}`, cursor: 'pointer', '&:hover': { bgcolor: isCritical ? alpha(COLORS.red, 0.1) : alpha(COLORS.accent, 0.1) } }}>
                    <Terminal size={20} color={isCritical ? COLORS.red : COLORS.accent} />
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.05em' }}>{inc.indicator_type}</Typography>
                      <Typography sx={{ color: COLORS.textMuted, fontSize: '0.75rem', fontFamily: 'monospace' }}>TARGET: {inc.target || `NODE_${inc.contestant_id.substring(0, 6)}`} | SEV-{inc.weight.toFixed(1)}</Typography>
                    </Box>
                    <Typography sx={{ color: COLORS.textMuted, fontSize: '0.7rem', fontFamily: 'monospace' }}>{new Date(inc.detected_at).toLocaleTimeString()}</Typography>
                  </Box>
                )
              }) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>
                  <Shield size={32} color={COLORS.green} style={{ marginBottom: 8 }} />
                  <Typography sx={{ color: COLORS.green, fontFamily: 'monospace' }}>NO ACTIVE ANOMALIES</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* BOX 2: Threat Matrix (Purple) */}
        <Box
          onClick={() => toggleFlip('box5')}
          sx={{ gridColumn: { lg: 'span 1' }, gridRow: { lg: 'span 2' }, cursor: 'pointer', position: 'relative', overflow: 'hidden', bgcolor: COLORS.bgDeep, border: `1px solid #a78bfa` }}
        >
          {/* Front */}
          <Box sx={{ width: '100%', height: '100%', bgcolor: '#a78bfa', color: '#000', p: 5, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transform: flippedCards['box5'] ? 'translateY(-100%)' : 'translateY(0)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Typography variant="h5" sx={{ color: '#000', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>High Risk Nodes</Typography>
            <Box>
              <Typography sx={{ color: '#000', fontWeight: 800, fontSize: '6rem', lineHeight: 0.8, letterSpacing: '-0.05em', fontFamily: 'monospace' }}>
                {highRiskNodesCount < 10 ? `0${highRiskNodesCount}` : highRiskNodesCount}
              </Typography>
              <Typography variant="subtitle1" sx={{ color: '#000', fontWeight: 800, mt: 2, textTransform: 'uppercase', opacity: 0.8 }}>Active Threats</Typography>
            </Box>
          </Box>
          {/* Back */}
          <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', bgcolor: COLORS.bgDeep, p: 4, display: 'flex', flexDirection: 'column', gap: 2, transform: flippedCards['box5'] ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Typography variant="h6" sx={{ color: '#a78bfa', fontWeight: 800, letterSpacing: '0.05em', opacity: flippedCards['box5'] ? 1 : 0, transition: 'all 0.4s 0.1s' }}>CRITICAL TARGETS</Typography>
            <Divider sx={{ borderColor: COLORS.borderLight, opacity: flippedCards['box5'] ? 1 : 0, transition: 'all 0.4s 0.1s' }} />

            <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1, mt: 1, mb: 1, pr: 1, opacity: flippedCards['box5'] ? 1 : 0, transition: 'all 0.4s 0.2s', '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: alpha('#a78bfa', 0.3), borderRadius: '4px' } }}>
              {highRiskNodesList && highRiskNodesList.length > 0 ? highRiskNodesList.map((node, idx) => (
                <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: alpha('#a78bfa', 0.05), p: 1, borderLeft: `2px solid #a78bfa`, borderRadius: 1 }}>
                  <Box>
                    <Typography sx={{ color: '#fff', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
                      {node.team ? `[${node.team}] ${node.handle}` : node.handle}
                    </Typography>
                    <Typography sx={{ color: COLORS.textMuted, fontSize: '0.6rem', fontFamily: 'monospace' }}>IP: {node.ip || 'UNKNOWN'}</Typography>
                  </Box>
                  <Typography sx={{ color: '#a78bfa', fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 800 }}>
                    {node.latest_score !== null ? `${node.latest_score}%` : 'N/A'}
                  </Typography>
                </Box>
              )) : (
                <Typography variant="caption" sx={{ color: COLORS.textMuted, textAlign: 'center', fontStyle: 'italic' }}>NO HIGH RISK NODES</Typography>
              )}
            </Box>

            <Button size="small" onClick={(e) => { e.stopPropagation(); navigate('/fleet'); }} endIcon={<ArrowRight size={14} />} sx={{ alignSelf: 'flex-start', color: '#a78bfa', p: 0, opacity: flippedCards['box5'] ? 1 : 0, transition: 'all 0.4s 0.3s', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}>
              View Fleet
            </Button>
          </Box>
        </Box>

        {/* BOX 3: Active Competitions (Flip Card) */}
        <Box
          onClick={() => toggleFlip('box3')}
          sx={{ gridColumn: { lg: 'span 1' }, gridRow: { lg: 'span 1' }, cursor: 'pointer', position: 'relative', overflow: 'hidden', bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}` }}
        >
          {/* Front */}
          <Box sx={{ width: '100%', height: '100%', bgcolor: COLORS.accent, color: '#000', p: 3, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transform: flippedCards['box3'] ? 'translateY(-100%)' : 'translateY(0)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ color: '#000', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Arenas</Typography>
              <Trophy size={28} color="#000" style={{ opacity: 0.6 }} />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: '4rem', lineHeight: 1, color: '#000', fontFamily: 'monospace', textAlign: 'right' }}>
              {stats.active < 10 ? `0${stats.active}` : stats.active}
            </Typography>
          </Box>
          {/* Back */}
          <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', bgcolor: COLORS.bgDeep, border: `2px solid ${COLORS.accent}`, p: 3, display: 'flex', flexDirection: 'column', gap: 1, transform: flippedCards['box3'] ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Typography variant="h6" sx={{ color: COLORS.accent, fontSize: '0.75rem', fontWeight: 800, opacity: flippedCards['box3'] ? 1 : 0, transition: 'all 0.4s 0.1s' }}>COMPETITION STATUS</Typography>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.5, opacity: flippedCards['box3'] ? 1 : 0, transition: 'all 0.4s 0.2s' }}>
              <Box sx={{ width: '100%', height: 4, bgcolor: COLORS.border, borderRadius: 2, display: 'flex', overflow: 'hidden' }}>
                <Box sx={{ width: `${stats.total > 0 ? (stats.active / stats.total) * 100 : 0}%`, bgcolor: COLORS.green }} />
                <Box sx={{ width: `${stats.total > 0 ? ((stats.total - stats.active) / stats.total) * 100 : 0}%`, bgcolor: COLORS.textMuted }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Box>
                  <Typography sx={{ color: COLORS.green, fontSize: '0.6rem', fontWeight: 700 }}>ACTIVE</Typography>
                  <Typography sx={{ color: '#fff', fontSize: '1.2rem', fontFamily: 'monospace', lineHeight: 1 }}>{stats.active}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ color: COLORS.textMuted, fontSize: '0.6rem', fontWeight: 700 }}>DRAFTS</Typography>
                  <Typography sx={{ color: '#fff', fontSize: '1.2rem', fontFamily: 'monospace', lineHeight: 1 }}>{stats.total - stats.active}</Typography>
                </Box>
              </Box>
            </Box>
            <Button size="small" onClick={(e) => { e.stopPropagation(); navigate('/competitions'); }} endIcon={<ArrowRight size={14} />} sx={{ fontSize: '0.7rem', alignSelf: 'flex-start', color: COLORS.accent, p: 0, opacity: flippedCards['box3'] ? 1 : 0, transition: 'all 0.4s 0.3s', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}>
              Manage
            </Button>
          </Box>
        </Box>

        {/* BOX 4: Online Nodes (Flip Card) */}
        <Box
          onClick={() => toggleFlip('box4')}
          sx={{ gridColumn: { lg: 'span 1' }, gridRow: { lg: 'span 1' }, cursor: 'pointer', position: 'relative', overflow: 'hidden', bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}` }}
        >
          {/* Front */}
          <Box sx={{ width: '100%', height: '100%', bgcolor: COLORS.green, color: '#000', p: 3, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transform: flippedCards['box4'] ? 'translateY(-100%)' : 'translateY(0)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ color: '#000', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Online Nodes</Typography>
              <Users size={28} color="#000" style={{ opacity: 0.6 }} />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: '4rem', lineHeight: 1, color: '#000', fontFamily: 'monospace', textAlign: 'right' }}>
              {onlineNodes < 10 ? `0${onlineNodes}` : onlineNodes}
            </Typography>
          </Box>
          {/* Back */}
          <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', bgcolor: COLORS.bgDeep, border: `2px solid ${COLORS.green}`, p: 3, display: 'flex', flexDirection: 'column', gap: 1, transform: flippedCards['box4'] ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Typography variant="h6" sx={{ color: COLORS.green, fontSize: '0.75rem', fontWeight: 800, opacity: flippedCards['box4'] ? 1 : 0, transition: 'all 0.4s 0.1s' }}>NODE TELEMETRY</Typography>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.5, opacity: flippedCards['box4'] ? 1 : 0, transition: 'all 0.4s 0.2s' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: COLORS.green, boxShadow: `0 0 8px ${COLORS.green}` }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.6rem', fontWeight: 700 }}>SYNCED</Typography>
                  <Typography sx={{ color: '#fff', fontSize: '1.2rem', fontFamily: 'monospace', lineHeight: 1 }}>{onlineNodes}</Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: COLORS.red }} />
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: COLORS.textSecondary, fontSize: '0.6rem', fontWeight: 700 }}>OFFLINE</Typography>
                  <Typography sx={{ color: COLORS.red, fontSize: '1.2rem', fontFamily: 'monospace', lineHeight: 1 }}>{offlineNodes}</Typography>
                </Box>
              </Box>
            </Box>
            <Button size="small" onClick={(e) => { e.stopPropagation(); navigate('/fleet'); }} endIcon={<ArrowRight size={14} />} sx={{ fontSize: '0.7rem', alignSelf: 'flex-start', color: COLORS.green, p: 0, opacity: flippedCards['box4'] ? 1 : 0, transition: 'all 0.4s 0.3s', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}>
              View Fleet
            </Button>
          </Box>
        </Box>

        {/* BOX 6: 24h Incident Trend (Flip Card) */}
        <Box
          onClick={() => toggleFlip('box6')}
          sx={{ gridColumn: { lg: 'span 3' }, gridRow: { lg: 'span 2' }, cursor: 'pointer', position: 'relative', overflow: 'hidden', bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.borderLight}` }}
        >
          {/* Front */}
          <Box sx={{ width: '100%', height: '100%', bgcolor: COLORS.bgSurface, p: 4, display: 'flex', flexDirection: 'column', transform: flippedCards['box6'] ? 'translateY(-100%)' : 'translateY(0)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 1 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: COLORS.textPrimary }}>Incident Trend</Typography>
                <Typography variant="caption" sx={{ color: COLORS.textMuted, fontFamily: 'monospace' }}>LAST 24 HOURS — LIVE</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 10, height: 3, bgcolor: COLORS.accent }} />
                  <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: '0.65rem' }}>INCIDENTS</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 10, height: 3, bgcolor: COLORS.red }} />
                  <Typography variant="caption" sx={{ color: COLORS.textMuted, fontSize: '0.65rem' }}>ESCALATED</Typography>
                </Box>
              </Box>
            </Box>

            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', mt: 2 }}>
              {/* Y-axis labels */}
              <Box sx={{ flex: 1, display: 'flex', position: 'relative' }}>
                <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 30 }}>
                  {yLabels.map(v => (
                    <Typography key={v} sx={{ fontFamily: 'monospace', fontSize: '0.55rem', color: COLORS.textMuted, textAlign: 'right', pr: 1 }}>{v}</Typography>
                  ))}
                </Box>
                {/* Chart area */}
                <Box sx={{ flex: 1, ml: 4, position: 'relative' }}>
                  <svg viewBox="0 0 800 150" style={{ width: '100%', height: '100%', overflow: 'visible' }} preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="incidentGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.accent} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={COLORS.accent} stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="escalateGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.red} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={COLORS.red} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    {[0, 37.5, 75, 112.5, 150].map(y => (
                      <line key={y} x1="0" y1={y} x2="800" y2={y} stroke={COLORS.border} strokeWidth="1" strokeDasharray="4,4" />
                    ))}
                    {/* Incident line (orange) */}
                    <polyline
                      points={incidentPoints}
                      fill="none" stroke={COLORS.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    />
                    <polyline
                      points={incidentPoly}
                      fill="url(#incidentGrad)" stroke="none"
                    />
                    {/* Escalated line (red) */}
                    <polyline
                      points={escalatePoints}
                      fill="none" stroke={COLORS.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6,3"
                    />
                    <polyline
                      points={escalatePoly}
                      fill="url(#escalateGrad)" stroke="none"
                    />
                  </svg>
                </Box>
              </Box>
              {/* X-axis time labels */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', ml: 4, mt: 0.5 }}>
                {xLabels.map((t, i) => (
                  <Typography key={i} sx={{ fontFamily: 'monospace', fontSize: '0.55rem', color: i === xLabels.length - 1 ? COLORS.accent : COLORS.textMuted, fontWeight: i === xLabels.length - 1 ? 800 : 400 }}>
                    {t}
                  </Typography>
                ))}
              </Box>
            </Box>
          </Box>
          {/* Back (GIF Banner) */}
          <Box
            sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', bgcolor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: flippedCards['box6'] ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)', '&:hover .banner-controls': { opacity: 1 } }}
          >
            {dashboardBannerUrl && (
              <img src={dashboardBannerUrl} alt="System Banner" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} onError={(e) => { console.error('Image load failed:', dashboardBannerUrl); e.target.style.display = 'none'; }} />
            )}
            <Box sx={{ position: 'absolute', textAlign: 'center' }}>
              <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '2.5rem', letterSpacing: '0.25em', textShadow: '0 0 15px rgba(0,0,0,0.9)' }}>LOCKON VOIGHT</Typography>
            </Box>

            {/* Hover Controls */}
            <Box className="banner-controls" sx={{ position: 'absolute', bottom: 16, right: 16, opacity: 0, transition: 'opacity 0.2s', display: 'flex', gap: 1 }}>
              <input type="file" hidden ref={fileInputRef} accept="image/*" onChange={handleBannerUpload} />
              <Tooltip title="Upload Banner">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} sx={{ bgcolor: alpha('#000', 0.6), color: '#fff', '&:hover': { bgcolor: alpha('#000', 0.9) } }}>
                  <ImagePlus size={16} />
                </IconButton>
              </Tooltip>
              {dashboardBannerUrl && (
                <Tooltip title="Remove Banner">
                  <IconButton size="small" onClick={handleBannerDelete} sx={{ bgcolor: alpha(COLORS.red, 0.6), color: '#fff', '&:hover': { bgcolor: alpha(COLORS.red, 0.9) } }}>
                    <Trash2 size={16} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>
        </Box>

        {/* BOX 7: API Latency (Flip Card) */}
        <Box
          onClick={() => toggleFlip('box7')}
          sx={{ gridColumn: { lg: 'span 1' }, gridRow: { lg: 'span 1' }, cursor: 'pointer', position: 'relative', overflow: 'hidden', bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}` }}
        >
          {/* Front */}
          <Box sx={{ width: '100%', height: '100%', bgcolor: '#3b82f6', color: '#000', p: 3, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transform: flippedCards['box7'] ? 'translateY(-100%)' : 'translateY(0)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ color: '#000', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>API Latency</Typography>
              <Activity size={28} color="#000" style={{ opacity: 0.6 }} />
            </Box>
            <Box sx={{ textAlign: 'right', display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 0.5 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '4rem', lineHeight: 1, color: '#000', fontFamily: 'monospace' }}>
                {dbHealth?.latency_ms ? Math.round(dbHealth.latency_ms) : '--'}
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '1.5rem', color: '#000', fontFamily: 'monospace' }}>ms</Typography>
            </Box>
          </Box>
          {/* Back */}
          <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', bgcolor: COLORS.bgDeep, border: `2px solid #3b82f6`, p: 3, display: 'flex', flexDirection: 'column', gap: 1, transform: flippedCards['box7'] ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Typography variant="h6" sx={{ color: '#3b82f6', fontSize: '0.75rem', fontWeight: 800, opacity: flippedCards['box7'] ? 1 : 0, transition: 'all 0.4s 0.1s' }}>CONNECTION LOAD</Typography>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.5, opacity: flippedCards['box7'] ? 1 : 0, transition: 'all 0.4s 0.2s' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ color: COLORS.textMuted, fontSize: '0.65rem', fontWeight: 700 }}>HEARTBEATS/MIN</Typography>
                <Typography sx={{ color: '#fff', fontSize: '0.8rem', fontFamily: 'monospace' }}>{onlineNodes * 12 || 144}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ color: COLORS.textMuted, fontSize: '0.65rem', fontWeight: 700 }}>DATABASE I/O</Typography>
                <Typography sx={{ color: COLORS.green, fontSize: '0.8rem', fontFamily: 'monospace' }}>OPTIMAL</Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* BOX 8: Auto-Mitigated (Flip Card) */}
        <Box
          onClick={() => toggleFlip('box8')}
          sx={{ gridColumn: { lg: 'span 1' }, gridRow: { lg: 'span 1' }, cursor: 'pointer', position: 'relative', overflow: 'hidden', bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}` }}
        >
          {/* Front */}
          <Box sx={{ width: '100%', height: '100%', bgcolor: COLORS.red, color: '#000', p: 3, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transform: flippedCards['box8'] ? 'translateY(-100%)' : 'translateY(0)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ color: '#000', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auto-Mitigated</Typography>
              <Ban size={28} color="#000" style={{ opacity: 0.6 }} />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: '4rem', lineHeight: 1, color: '#000', fontFamily: 'monospace', textAlign: 'right' }}>
              {totalMitigated < 10 ? `0${totalMitigated}` : totalMitigated}
            </Typography>
          </Box>
          {/* Back */}
          <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', bgcolor: COLORS.bgDeep, border: `2px solid ${COLORS.red}`, p: 3, display: 'flex', flexDirection: 'column', gap: 1, transform: flippedCards['box8'] ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <Typography variant="h6" sx={{ color: COLORS.red, fontSize: '0.75rem', fontWeight: 800, opacity: flippedCards['box8'] ? 1 : 0, transition: 'all 0.4s 0.1s' }}>ENFORCEMENT STATS</Typography>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.5, opacity: flippedCards['box8'] ? 1 : 0, transition: 'all 0.4s 0.2s' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ color: COLORS.textMuted, fontSize: '0.65rem', fontWeight: 700 }}>PROCESS KILLS</Typography>
                <Typography sx={{ color: '#fff', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                  {processKillsCount < 10 ? `0${processKillsCount}` : processKillsCount}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ color: COLORS.textMuted, fontSize: '0.65rem', fontWeight: 700 }}>SCREEN LOCKS</Typography>
                <Typography sx={{ color: '#fff', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                  {screenLocksCount < 10 ? `0${screenLocksCount}` : screenLocksCount}
                </Typography>
              </Box>
            </Box>
            <Button size="small" onClick={(e) => { e.stopPropagation(); navigate('/fleet'); }} endIcon={<ArrowRight size={14} />} sx={{ fontSize: '0.7rem', alignSelf: 'flex-start', color: COLORS.red, p: 0, opacity: flippedCards['box8'] ? 1 : 0, transition: 'all 0.4s 0.3s', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}>
              View Fleet
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Competition</DialogTitle>
        <DialogContent>
          <TextField
            id="comp-name"
            fullWidth label="Competition Name" sx={{ mt: 1, mb: 2 }}
            value={newComp.name} onChange={(e) => setNewComp({ ...newComp, name: e.target.value })}
            placeholder="e.g. National CTF 2026"
          />
          <TextField
            id="comp-description"
            fullWidth label="Description" multiline rows={3}
            value={newComp.description} onChange={(e) => setNewComp({ ...newComp, description: e.target.value })}
            placeholder="Brief description of the competition..."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newComp.name}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
