/**
 * Main Dashboard Layout — Sidebar + Top bar + Content area.
 */

import { useState } from 'react';
import { Outlet, useNavigate, useLocation, matchPath } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton, Button,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Avatar, Divider, Chip, Tooltip, alpha,
} from '@mui/material';
import {
  Shield, Trophy, Users, AlertTriangle, Activity,
  LogOut, Menu, ChevronLeft, Eye, Settings, Server, Bell, X
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { COLORS } from '../theme/theme';
import { incidentsAPI, competitionsAPI } from '../services/api';
import { useWebSocket } from '../services/websocket';
import { useEffect } from 'react';

const NOTIF_STYLES = {
  ESCALATION: { color: COLORS.red, label: 'ESCALATION' },
  AGENT_OFFLINE: { color: COLORS.yellow, label: 'OFFLINE' },
  NEW_INCIDENT: { color: COLORS.accent, label: 'INCIDENT' },
};

const DRAWER_WIDTH = 260;

const NAV_ITEMS = [
  { type: 'header', label: 'OVERSIGHT' },
  { path: '/', label: 'Dashboard', icon: Activity, description: 'Overview', color: COLORS.accent },
  { path: '/fleet', label: 'Fleet Command', icon: Server, description: 'Agent Nodes', color: '#3b82f6' },
  { path: '/competitions', label: 'Competitions', icon: Trophy, description: 'Manage events', color: COLORS.yellow },
  { path: '/incidents', label: 'Incidents', icon: AlertTriangle, description: 'IoA Alerts', badgeKey: 'incidents', color: COLORS.red },
  { type: 'header', label: 'SYSTEM' },
  { path: '/policy', label: 'Detection Policy', icon: Shield, description: 'AI Detection Rules', color: COLORS.green },
  { path: '/users', label: 'User Management', icon: Users, description: 'Account Administration', color: '#a855f7' },
  { path: '/settings', label: 'Settings', icon: Settings, description: 'System Configuration', color: COLORS.textMuted },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const queryClient = useQueryClient();

  // Fetch real unresolved incident count for sidebar badge
  const { data: openIncidents } = useQuery({
    queryKey: ['incidents-open-count'],
    queryFn: () => incidentsAPI.list(null, 'OPEN', 500).then(r => r.data),
  });

  // Fetch active competition to show mission timer
  const { data: activeCompetitions } = useQuery({
    queryKey: ['active-competitions-layout'],
    queryFn: () => competitionsAPI.list('active').then(r => r.data),
    refetchInterval: 30000,
  });
  const activeComp = activeCompetitions?.[0];

  const { incidentAlerts, isConnected } = useWebSocket('global');
  
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const formatTime = (date) => date.toISOString().substring(11, 19) + ' Z';

  // Mission Timer
  let missionTimer = null;
  if (activeComp?.start_time) {
    const diff = Math.max(0, Math.floor((time.getTime() - new Date(activeComp.start_time).getTime()) / 1000));
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    missionTimer = `T+ ${h}:${m}:${s}`;
  }

  useEffect(() => {
    if (incidentAlerts.length > 0) {
      const newNotifs = incidentAlerts.map(inc => ({
        id: inc.id,
        type: 'NEW_INCIDENT',
        message: `Incident detected: ${inc.indicator_type} on ${inc.contestant_id.substring(0,8)}`,
        time: 'Just now',
        read: false
      }));
      
      setNotifications(prev => {
        // Prevent duplicates
        const existingIds = new Set(prev.map(n => n.id));
        const filteredNew = newNotifs.filter(n => !existingIds.has(n.id));
        return [...filteredNew, ...prev].slice(0, 20);
      });
      
      // Invalidate open incidents count to refresh the badge
      queryClient.invalidateQueries({ queryKey: ['incidents-open-count'] });
    }
  }, [incidentAlerts, queryClient]);

  const incidentBadge = openIncidents?.length ?? 0;

  const unreadCount = notifications.filter(n => !n.read).length;
  const markRead = (id) => setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllRead = () => setNotifications(notifications.map(n => ({ ...n, read: true })));

  const getBreadcrumb = () => {
    const path = location.pathname;
    let label = 'DASHBOARD';
    let subLabel = null;

    const compMatch = matchPath({ path: '/competitions/:id' }, path);
    const contMatch = matchPath({ path: '/contestants/:id' }, path);

    if (compMatch) {
      label = 'COMPETITIONS';
      const compId = compMatch.params.id;
      const compCache = queryClient.getQueryData(['competitions']);
      const comp = compCache?.find?.(c => c.id === compId);
      subLabel = comp ? comp.name.toUpperCase() : 'DETAIL';
    } else if (path.startsWith('/competitions')) {
      label = 'COMPETITIONS';
    } else if (contMatch) {
      const fromFleet = location.state?.fromFleet;
      if (fromFleet) {
        label = 'FLEET COMMAND';
      } else {
        label = 'COMPETITIONS';
      }
      const contId = contMatch.params.id;
      const contCache = queryClient.getQueryData(['agents']);
      const cont = contCache?.find?.(c => c.id === contId);
      
      if (cont) {
        if (fromFleet) {
          subLabel = cont.handle ? cont.handle.toUpperCase() : cont.id.split('-')[0];
        } else {
          // Find competition name if available
          const compCache = queryClient.getQueryData(['competitions']);
          const comp = compCache?.find?.(c => c.id === cont.competition_id);
          const compName = comp ? comp.name.toUpperCase() : 'UNKNOWN COMP';
          subLabel = `${compName} / ${cont.team ? cont.team.toUpperCase() + ' - ' : ''}${cont.handle ? cont.handle.toUpperCase() : cont.id.split('-')[0]}`;
        }
      } else {
        subLabel = 'CONTESTANT';
      }
    } else if (path.startsWith('/fleet')) {
      label = 'FLEET COMMAND';
    } else if (path.startsWith('/incidents')) {
      label = 'INCIDENTS';
    } else if (path.startsWith('/policy')) {
      label = 'DETECTION POLICY';
    } else if (path.startsWith('/users')) {
      label = 'USER MANAGEMENT';
    } else if (path.startsWith('/settings')) {
      label = 'SETTINGS';
    }

    return (
      <>
        OVERSIGHT / <span style={{ color: COLORS.textPrimary, fontWeight: 700 }}>{label}</span>
        {subLabel && (
          <> / <span style={{ color: COLORS.textPrimary, fontWeight: 700 }}>{subLabel}</span></>
        )}
      </>
    );
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ──── Sidebar ──── */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            overflowX: 'hidden',
            bgcolor: COLORS.bgDeep,
            borderRight: `1px solid ${COLORS.border}`,
          },
        }}
      >
        {/* Brand */}
        <Box sx={{ p: 2, pt: 4, pb: 3, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: 120 }}>
          <img src="/Logo.svg" alt="LOCKON VOIGHT" style={{ width: '85%', maxWidth: 220, objectFit: 'contain', marginBottom: '16px' }} />
        </Box>

        <Divider sx={{ mx: 1 }} />

        {/* Navigation */}
        <List sx={{ px: 0, py: 1.5, flex: 1 }}>
          {NAV_ITEMS.map((item, index) => {
            if (item.type === 'header') {
              return (
                <Typography key={`header-${index}`} sx={{ 
                  fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 800, 
                  color: alpha(COLORS.textMuted, 0.5), letterSpacing: '0.15em', 
                  px: 3, pt: 2, pb: 1, mt: index > 0 ? 1 : 0 
                }}>
                  // {item.label}
                </Typography>
              );
            }

            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            const Icon = item.icon;
            const tabColor = item.color || COLORS.accent;

            return (
              <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                <Tooltip title={item.label} placement="right" disableHoverListener>
                  <ListItemButton
                    onClick={() => navigate(item.path)}
                    sx={{
                      borderRadius: 0,
                      minHeight: 44,
                      px: 3,
                      bgcolor: isActive ? alpha(tabColor, 0.05) : 'transparent',
                      borderLeft: isActive ? `3px solid ${tabColor}` : `3px solid transparent`,
                      transition: 'all 0.2s',
                      '&:hover': { bgcolor: alpha(tabColor, 0.05), borderLeft: `3px solid ${alpha(tabColor, 0.5)}` },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36, color: isActive ? tabColor : COLORS.textMuted }}>
                      <Icon size={20} />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      slotProps={{
                        primary: {
                          fontSize: '0.85rem',
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? '#fff' : COLORS.textSecondary,
                        }
                      }}
                    />
                    {item.badgeKey === 'incidents' && incidentBadge > 0 && (
                      <Chip
                        label={incidentBadge}
                        size="small"
                        sx={{
                          height: 20, minWidth: 20, borderRadius: 0,
                          bgcolor: COLORS.red, color: '#000',
                          fontWeight: 900, fontSize: '0.65rem',
                          '& .MuiChip-label': { px: 0.6 },
                          animation: 'pulse 2s infinite',
                          '@keyframes pulse': {
                            '0%, 100%': { opacity: 1 },
                            '50%': { opacity: 0.6 },
                          },
                        }}
                      />
                    )}
                  </ListItemButton>
                </Tooltip>
              </ListItem>
            );
          })}
        </List>

        <Divider sx={{ mx: 1 }} />

        {/* User section */}
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: COLORS.bgDeep }}>
          <Avatar sx={{ width: 32, height: 32, borderRadius: 0, bgcolor: 'transparent', color: COLORS.textPrimary, fontSize: '0.9rem', fontWeight: 800, border: 'none' }}>
            {(user?.username || 'P')[0].toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: COLORS.green, animation: 'pulse 2s infinite' }} />
            <Typography variant="body2" sx={{ fontWeight: 700, color: COLORS.textPrimary, fontSize: '0.8rem', textTransform: 'uppercase' }} noWrap>
              {user?.username || 'Proctor'}
            </Typography>
          </Box>
          <Tooltip title="Logout">
            <IconButton size="small" onClick={logout} sx={{ color: COLORS.textSecondary, '&:hover': { color: COLORS.accent } }}>
              <LogOut size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      </Drawer>

      {/* ──── Main Content ──── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: COLORS.bgDeep }}>
        {/* Top Bar with Notifications */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 4, py: 1.5, borderBottom: `1px solid ${COLORS.border}`, position: 'relative' }}>
          
          {/* LEFT: Breadcrumb & Title */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography sx={{ color: COLORS.textMuted, fontFamily: 'monospace', fontSize: '0.75rem', letterSpacing: '0.1em' }}>
              {getBreadcrumb()}
            </Typography>
          </Box>

          {/* RIGHT: Clock, Status, Bell */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            
            {/* System Status */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: isConnected ? COLORS.green : COLORS.red, boxShadow: `0 0 8px ${isConnected ? COLORS.green : COLORS.red}` }} />
              <Typography sx={{ color: isConnected ? COLORS.green : COLORS.red, fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em' }}>
                {isConnected ? 'SYS.ONLINE' : 'SYS.OFFLINE'}
              </Typography>
            </Box>

            <Divider orientation="vertical" flexItem sx={{ borderColor: COLORS.borderLight, height: 20, my: 'auto' }} />

            {/* Mission Timer (if active) */}
            {missionTimer && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Activity size={14} color={COLORS.accent} />
                <Typography sx={{ color: COLORS.accent, fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.05em', animation: 'pulse 2s infinite' }}>
                  {activeComp?.name?.toUpperCase()} : {missionTimer}
                </Typography>
              </Box>
            )}

            <Divider orientation="vertical" flexItem sx={{ borderColor: COLORS.borderLight, height: 20, my: 'auto' }} />

            {/* Bell */}
            <Tooltip title="Notifications">
              <IconButton onClick={() => setNotifOpen(!notifOpen)} sx={{ color: COLORS.textSecondary, '&:hover': { color: COLORS.accent }, position: 'relative' }}>
                <Bell size={20} />
                {unreadCount > 0 && (
                  <Box sx={{
                    position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 0,
                    bgcolor: COLORS.red, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Typography sx={{ color: '#000', fontSize: '0.55rem', fontWeight: 900 }}>{unreadCount}</Typography>
                  </Box>
                )}
              </IconButton>
            </Tooltip>
          </Box>

          {/* Notification Dropdown */}
          {notifOpen && (
            <Box sx={{
              position: 'absolute', top: '100%', right: 16, width: 400, zIndex: 100,
              bgcolor: COLORS.bgCard, border: `1px solid ${COLORS.border}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
              <Box sx={{ p: 2, borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', fontFamily: 'monospace', letterSpacing: '0.05em' }}>NOTIFICATIONS</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button size="small" onClick={markAllRead} sx={{ color: COLORS.accent, fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, minWidth: 0 }}>MARK ALL READ</Button>
                  <IconButton size="small" onClick={() => setNotifOpen(false)} sx={{ color: COLORS.textMuted }}>
                    <X size={14} />
                  </IconButton>
                </Box>
              </Box>
              <Box sx={{ maxHeight: 320, overflow: 'auto' }}>
                {notifications.map(n => {
                  const style = NOTIF_STYLES[n.type] || NOTIF_STYLES.NEW_INCIDENT;
                  return (
                    <Box key={n.id} onClick={() => markRead(n.id)} sx={{
                      p: 2, borderBottom: `1px solid ${COLORS.border}`, cursor: 'pointer',
                      bgcolor: n.read ? 'transparent' : alpha(style.color, 0.03),
                      '&:hover': { bgcolor: alpha(COLORS.accent, 0.05) },
                      transition: 'background 0.15s',
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                        {!n.read && <Box sx={{ width: 6, height: 6, bgcolor: style.color, flexShrink: 0 }} />}
                        <Chip label={style.label} size="small" sx={{
                          bgcolor: alpha(style.color, 0.12), color: style.color,
                          fontWeight: 800, fontSize: '0.55rem', borderRadius: 0, height: 18,
                        }} />
                        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: COLORS.textMuted, ml: 'auto' }}>{n.time}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: '0.78rem', color: n.read ? COLORS.textMuted : COLORS.textPrimary, ml: n.read ? 0 : 2.5 }}>
                        {n.message}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
        </Box>

        {/* Page Content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 4 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
