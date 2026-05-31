/**
 * ScreenViewer — Live screenshot grid for contestant monitoring.
 * Displays periodically-captured screenshots from Agent screen broadcasts.
 * Used as an alternative view mode inside CompetitionView.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, IconButton, Tooltip, alpha, Chip, Skeleton,
  Dialog, DialogContent, Switch, FormControlLabel, ButtonGroup, Button, keyframes
} from '@mui/material';
import {
  Monitor, MonitorOff, Maximize2, X, RefreshCw, Wifi, WifiOff, ShieldAlert, PowerOff, Shield, ZoomIn, ZoomOut, Maximize
} from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import IntegrityBadge from './IntegrityBadge';
import { COLORS } from '../theme/theme';

const API_BASE = import.meta.env.VITE_API_URL || '';

const sweepAnimation = keyframes`
  0% { width: 0%; opacity: 1; }
  90% { width: 100%; opacity: 1; }
  100% { width: 100%; opacity: 0; }
`;

/**
 * ScreenViewer component — renders a grid of live contestant screenshots.
 * 
 * @param {Object[]} contestants - Array of contestant objects (merged with WS updates)
 * @param {number} refreshInterval - Screenshot polling interval in seconds (default: 5)
 */
export default function ScreenViewer({ contestants = [], refreshInterval = 5, singleMode = false, showOnlyActive = false, gridColumns = 4, resourceData = null, incidents = [], onSendWarning, onDisconnect }) {
  const navigate = useNavigate();
  const [screenshots, setScreenshots] = useState({});
  const [fullscreenId, setFullscreenId] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Sorting and Filtering
  const displayContestants = contestants
    .filter(c => !showOnlyActive || c.is_online)
    .sort((a, b) => (b.latest_score || 0) - (a.latest_score || 0));

  // Polling timer for screenshot refresh
  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshTick(t => t + 1);
    }, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [refreshInterval]);

  // Fetch screenshots for all online contestants
  useEffect(() => {
    const fetchScreenshots = async () => {
      const onlineContestants = contestants.filter(c => c.is_online && c.is_enrolled);
      
      for (const c of onlineContestants) {
        try {
          const res = await fetch(`${API_BASE}/api/screen/${c.id}?t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('voight_access_token')}` }
          });
          if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            setScreenshots(prev => {
              // Revoke old URL to prevent memory leak
              if (prev[c.id]?.url) URL.revokeObjectURL(prev[c.id].url);
              return {
                ...prev,
                [c.id]: {
                  url,
                  timestamp: Date.now(),
                  available: true,
                }
              };
            });
          } else {
            setScreenshots(prev => ({
              ...prev,
              [c.id]: { ...prev[c.id], available: false }
            }));
          }
        } catch {
          // Silently skip — agent might not have screen broadcast enabled
        }
      }
    };

    if (contestants.length > 0) {
      fetchScreenshots();
    }
  }, [contestants, refreshTick]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(screenshots).forEach(s => {
        if (s?.url) URL.revokeObjectURL(s.url);
      });
    };
  }, []);

  const fullscreenContestant = fullscreenId ? contestants.find(c => c.id === fullscreenId) : null;

  if (displayContestants.length === 0) {
    return (
      <Card sx={{ textAlign: 'center', py: 10, bgcolor: 'transparent', border: `1px dashed ${COLORS.border}`, borderRadius: 0 }}>
        <MonitorOff size={48} color={COLORS.borderLight} style={{ marginBottom: 16 }} />
        <Typography variant="h6" sx={{ color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          NO ACTIVE FEEDS
        </Typography>
        <Typography variant="body2" sx={{ color: COLORS.textMuted, mt: 1 }}>
          {showOnlyActive 
            ? "No active contestants meet the current filter criteria."
            : "No contestants are currently streaming their screen."}
        </Typography>
      </Card>
    );
  }

  return (
    <>
      {/* Global Refresh Progress Bar */}
      {!singleMode && (
        <Box sx={{ width: '100%', height: 2, bgcolor: alpha(COLORS.border, 0.5), mb: 2, position: 'relative' }}>
          <Box
            key={refreshTick}
            sx={{
              position: 'absolute', top: 0, left: 0, height: '100%',
              bgcolor: COLORS.accent,
              animation: `${sweepAnimation} ${refreshInterval}s linear forwards`
            }}
          />
        </Box>
      )}

      {/* Screenshot Grid */}
      <Box sx={{
        display: 'grid',
        ...(singleMode ? { height: '100%', width: '100%' } : {}),
        gridTemplateColumns: singleMode ? '1fr' : { 
          xs: '1fr', 
          sm: `repeat(${Math.min(gridColumns, 2)}, 1fr)`, 
          lg: `repeat(${Math.min(gridColumns, 3)}, 1fr)`, 
          xl: `repeat(${gridColumns}, 1fr)` 
        },
        gap: 2,
      }}>
        {displayContestants.map(c => {
          const ss = screenshots[c.id];
          const hasScreenshot = ss?.available && ss?.url;

          return (
            <Card
              key={c.id}
              sx={{
                bgcolor: COLORS.bgDeep,
                border: `1px solid ${c.latest_level === 'RED' ? COLORS.red : c.latest_level === 'YELLOW' ? COLORS.yellow : COLORS.border}`,
                borderRadius: 0,
                overflow: 'hidden',
                ...(singleMode ? { height: '100%', width: '100%', display: 'flex', flexDirection: 'column' } : {}),
                transition: 'all 0.15s ease-out',
                ...(singleMode ? {} : {
                  '&:hover': {
                    borderColor: COLORS.textPrimary,
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                  }
                }),
                ...(singleMode && c.latest_level === 'RED' ? { boxShadow: `0 0 40px ${alpha(COLORS.red, 0.4)}`, borderColor: COLORS.red } : {}),
                ...(singleMode && c.latest_level === 'YELLOW' ? { boxShadow: `0 0 30px ${alpha(COLORS.yellow, 0.3)}`, borderColor: COLORS.yellow } : {})
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative', overflow: 'hidden' }}>
              {/* Screenshot Area */}
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  ...(singleMode 
                    ? { flex: 1, minHeight: 0 } 
                    : { paddingTop: '56.25%' }), // 16:9 aspect ratio
                  bgcolor: '#000',
                  cursor: (hasScreenshot && !singleMode) ? 'pointer' : 'default',
                  overflow: 'hidden',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                onClick={() => (hasScreenshot && !singleMode) && setFullscreenId(c.id)}
              >
                {hasScreenshot ? (
                  <TransformWrapper
                    initialScale={1}
                    minScale={0.5}
                    maxScale={4}
                    centerOnInit={true}
                    disabled={!singleMode}
                    wheel={{ step: 0.1 }}
                  >
                    {({ zoomIn, zoomOut, resetTransform }) => (
                      <React.Fragment>
                        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
                          <Box
                            component="img"
                            src={ss.url}
                            alt={`Screen: ${c.handle}`}
                            sx={{
                              position: singleMode ? 'relative' : 'absolute',
                              top: 0, left: 0,
                              width: '100%', height: '100%',
                              objectFit: singleMode ? 'contain' : 'cover',
                            }}
                          />
                        </TransformComponent>
                        {singleMode && (
                          <Box sx={{
                            position: 'absolute', bottom: 48, right: 16,
                            display: 'flex', gap: 0.5, zIndex: 10,
                            bgcolor: alpha(COLORS.bgDeep, 0.6), backdropFilter: 'blur(8px)',
                            border: `1px solid ${COLORS.border}`, p: 0.5, borderRadius: 1
                          }}>
                            <Tooltip title="Zoom In">
                              <IconButton size="small" onClick={() => zoomIn()} sx={{ color: '#fff', '&:hover': { bgcolor: COLORS.accent, color: '#000' } }}><ZoomIn size={16} /></IconButton>
                            </Tooltip>
                            <Tooltip title="Zoom Out">
                              <IconButton size="small" onClick={() => zoomOut()} sx={{ color: '#fff', '&:hover': { bgcolor: COLORS.accent, color: '#000' } }}><ZoomOut size={16} /></IconButton>
                            </Tooltip>
                            <Tooltip title="Reset Zoom">
                              <IconButton size="small" onClick={() => resetTransform()} sx={{ color: '#fff', '&:hover': { bgcolor: COLORS.accent, color: '#000' } }}><Maximize size={16} /></IconButton>
                            </Tooltip>
                          </Box>
                        )}
                      </React.Fragment>
                    )}
                  </TransformWrapper>
                ) : (
                  <Box sx={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    bgcolor: alpha(COLORS.bgDeep, 0.9),
                    backgroundImage: `
                      linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
                    `,
                    backgroundSize: '24px 24px',
                  }}>
                    {c.is_online ? (
                      <>
                        <Monitor size={32} color={COLORS.borderLight} />
                        <Typography variant="caption" sx={{ color: COLORS.textMuted, mt: 1, fontFamily: 'monospace' }}>
                          AWAITING FEED...
                        </Typography>
                      </>
                    ) : (
                      <>
                        <MonitorOff size={32} color={COLORS.borderLight} />
                        <Typography variant="caption" sx={{ color: COLORS.textMuted, mt: 1, fontFamily: 'monospace' }}>
                          OFFLINE
                        </Typography>
                      </>
                    )}
                  </Box>
                )}

                {/* Live indicator overlay */}
                {hasScreenshot && (
                  <Box sx={{
                    position: 'absolute', top: 8, left: 8,
                    display: 'flex', alignItems: 'center', gap: 0.5,
                    bgcolor: 'rgba(0,0,0,0.7)', px: 1, py: 0.3,
                  }}>
                    <Box sx={{ width: 6, height: 6, bgcolor: COLORS.red, animation: 'pulse 1.5s infinite' }} />
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#fff', fontWeight: 800 }}>
                      LIVE
                    </Typography>
                  </Box>
                )}

                {/* Ticker Overlay (singleMode) */}
                {singleMode && incidents?.length > 0 && (
                  <Box sx={{ 
                    position: 'absolute', bottom: 36, left: 16,
                    width: 320, maxHeight: 300,
                    bgcolor: alpha(COLORS.bgDeep, 0.65),
                    backdropFilter: 'blur(10px)',
                    border: `1px solid ${alpha(COLORS.border, 0.5)}`,
                    borderRadius: 1,
                    display: 'flex', flexDirection: 'column',
                    overflowY: 'auto',
                    zIndex: 10
                  }}>
                    <Box sx={{ p: 1.5, borderBottom: `1px solid ${alpha(COLORS.border, 0.3)}`, position: 'sticky', top: 0, zIndex: 1, bgcolor: alpha(COLORS.bgDeep, 0.4) }}>
                      <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontWeight: 800, color: COLORS.textPrimary, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Shield size={14} color={COLORS.red} /> LIVE INCIDENT FEED
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', p: 1, gap: 1 }}>
                      {incidents.slice(0, 50).map(inc => (
                        <Box key={inc.id} sx={{ 
                          p: 1.5, border: `1px solid ${alpha(inc.weight >= 80 ? COLORS.red : COLORS.accent, 0.3)}`,
                          bgcolor: alpha(inc.weight >= 80 ? COLORS.red : COLORS.accent, 0.1),
                          borderLeft: `3px solid ${inc.weight >= 80 ? COLORS.red : COLORS.accent}`
                        }}>
                          <Typography variant="caption" sx={{ color: COLORS.textMuted, fontFamily: 'monospace', display: 'block', mb: 0.5 }}>
                            {new Date(inc.detected_at).toLocaleTimeString()}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600, fontSize: '0.75rem' }}>
                            {inc.indicator_type.replace(/_/g, ' ')}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Active Window Overlay */}
                {hasScreenshot && (
                  <Box sx={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    bgcolor: 'rgba(0,0,0,0.85)', px: 1.5, py: 0.75,
                    borderTop: `1px solid ${COLORS.border}`,
                    display: 'flex', alignItems: 'center', gap: 1
                  }}>
                    <Typography variant="caption" sx={{ 
                      color: COLORS.accent, fontWeight: 900, fontFamily: 'monospace', fontSize: '0.65rem',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                      {'>'} ACTIVE WINDOW: <span style={{ color: '#fff', fontWeight: 500, marginLeft: 4 }}>{c.active_window || "Fetching telemetry..."}</span>
                    </Typography>
                  </Box>
                )}

                {/* Command Bar (singleMode) */}
                {singleMode && (
                  <Box sx={{
                    position: 'absolute', top: 16, right: 16,
                    display: 'flex', gap: 1, zIndex: 10,
                    bgcolor: alpha(COLORS.bgDeep, 0.75),
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${alpha(COLORS.border, 0.5)}`,
                    p: 1, borderRadius: 1
                  }}>
                    <Button 
                      variant="outlined" 
                      color="warning" 
                      size="small" 
                      startIcon={<ShieldAlert size={16} />}
                      onClick={onSendWarning}
                      sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}
                    >
                      SEND WARNING
                    </Button>
                    <Button 
                      variant="contained" 
                      color="error" 
                      size="small" 
                      startIcon={<PowerOff size={16} />}
                      onClick={onDisconnect}
                      sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}
                    >
                      DISCONNECT
                    </Button>
                  </Box>
                )}

                {/* HUD Overlay for Single Mode */}
                {singleMode && (
                  <Box sx={{
                    position: 'absolute', top: 80, right: 16,
                    display: 'flex', flexDirection: 'column', gap: 1,
                    width: 220, zIndex: 10
                  }}>
                    <Box sx={{ bgcolor: 'rgba(0,0,0,0.6)', border: `1px solid ${(resourceData?.length > 0) ? COLORS.accent : COLORS.border}`, p: 1.5, backdropFilter: 'blur(4px)' }}>
                      <Typography variant="caption" sx={{ color: (resourceData?.length > 0) ? COLORS.accent : COLORS.textMuted, fontFamily: 'monospace', fontWeight: 800, mb: 0.5, display: 'block' }}>CPU_USAGE</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" sx={{ color: (resourceData?.length > 0) ? '#fff' : COLORS.textMuted, fontFamily: 'monospace', fontWeight: 900, flexShrink: 0, width: 40 }}>
                          {(resourceData?.length > 0) ? `${Math.round(resourceData[resourceData.length - 1].cpu)}%` : '--%'}
                        </Typography>
                        <Box sx={{ flex: 1, height: 6, bgcolor: 'rgba(255,255,255,0.1)' }}>
                          {(resourceData?.length > 0) && <Box sx={{ width: `${Math.round(resourceData[resourceData.length - 1].cpu)}%`, height: '100%', bgcolor: COLORS.accent }} />}
                        </Box>
                      </Box>
                    </Box>
                    <Box sx={{ bgcolor: 'rgba(0,0,0,0.6)', border: `1px solid ${(resourceData?.length > 0) ? '#a78bfa' : COLORS.border}`, p: 1.5, backdropFilter: 'blur(4px)' }}>
                      <Typography variant="caption" sx={{ color: (resourceData?.length > 0) ? '#a78bfa' : COLORS.textMuted, fontFamily: 'monospace', fontWeight: 800, mb: 0.5, display: 'block' }}>MEM_ALLOC</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" sx={{ color: (resourceData?.length > 0) ? '#fff' : COLORS.textMuted, fontFamily: 'monospace', fontWeight: 900, flexShrink: 0, width: 40 }}>
                          {(resourceData?.length > 0) ? `${Math.round(resourceData[resourceData.length - 1].ram)}%` : '--%'}
                        </Typography>
                        <Box sx={{ flex: 1, height: 6, bgcolor: 'rgba(255,255,255,0.1)' }}>
                          {(resourceData?.length > 0) && <Box sx={{ width: `${Math.round(resourceData[resourceData.length - 1].ram)}%`, height: '100%', bgcolor: '#a78bfa' }} />}
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                )}

                {/* Expand button */}
                {(hasScreenshot && !singleMode) && (
                  <Tooltip title="Fullscreen">
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); setFullscreenId(c.id); }}
                      sx={{
                        position: 'absolute', top: 8, right: 8,
                        bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 0,
                        '&:hover': { bgcolor: COLORS.accent, color: '#000' }
                      }}
                    >
                      <Maximize2 size={16} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              </Box>

              </Box>

              {/* Contestant Info Bar */}
              {!singleMode && (
                <Box
                  sx={{
                    p: 1.5,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderTop: `1px solid ${COLORS.border}`,
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`/contestants/${c.id}`)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
                    <Box sx={{
                      width: 8, height: 8, borderRadius: 0, flexShrink: 0,
                      bgcolor: c.is_online ? COLORS.green : COLORS.textMuted,
                    }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" sx={{
                        fontWeight: 900, fontFamily: 'monospace', fontSize: '0.75rem',
                        color: '#FFFFFF', letterSpacing: '0.05em',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {c.handle?.toUpperCase()}
                      </Typography>
                      <Typography variant="caption" sx={{ color: alpha(COLORS.textPrimary, 0.7), fontFamily: 'monospace', fontSize: '0.6rem' }}>
                        {c.team?.toUpperCase() || 'UNASSIGNED'} • {c.ip || 'NO IP'}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    {c.screen_lock_count > 0 && (
                      <Chip label={`🔒 x${c.screen_lock_count}`} size="small" sx={{
                        height: 18, fontSize: '0.55rem', bgcolor: alpha('#a855f7', 0.1), color: '#a855f7',
                        fontWeight: 800, borderRadius: 0
                      }} />
                    )}
                    <IntegrityBadge score={c.latest_score ?? 0} level={c.latest_level || 'GREEN'} size="small" />
                  </Box>
                </Box>
              )}
            </Card>
          );
        })}
      </Box>

      {/* Fullscreen Dialog */}
      <Dialog
        open={Boolean(fullscreenId)}
        onClose={() => setFullscreenId(null)}
        maxWidth={false}
        PaperProps={{
          sx: {
            bgcolor: '#000', border: 'none', borderRadius: 0,
            width: '95vw', height: '90vh', maxWidth: '95vw',
          }
        }}
      >
        <DialogContent sx={{ p: 0, position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header bar */}
          <Box sx={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            p: 1.5, bgcolor: COLORS.bgDeep, borderBottom: `1px solid ${COLORS.border}`,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'rgba(239,68,68,0.15)', px: 1, py: 0.3 }}>
                <Box sx={{ width: 6, height: 6, bgcolor: COLORS.red, animation: 'pulse 1.5s infinite' }} />
                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: COLORS.red, fontWeight: 800 }}>
                  LIVE
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 900, fontFamily: 'monospace', color: COLORS.textPrimary, letterSpacing: '0.1em' }}>
                {fullscreenContestant?.handle?.toUpperCase()} — {fullscreenContestant?.team?.toUpperCase() || 'UNASSIGNED'}
              </Typography>
              {fullscreenContestant && (
                <IntegrityBadge score={fullscreenContestant.latest_score ?? 0} level={fullscreenContestant.latest_level || 'GREEN'} size="small" />
              )}
            </Box>
            <IconButton onClick={() => setFullscreenId(null)} sx={{ color: COLORS.textMuted, '&:hover': { color: '#fff' } }}>
              <X size={20} />
            </IconButton>
          </Box>

          {/* Screenshot */}
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
            {screenshots[fullscreenId]?.url ? (
              <Box
                component="img"
                src={screenshots[fullscreenId].url}
                alt="Fullscreen screenshot"
                sx={{
                  maxWidth: '100%', maxHeight: '100%',
                  objectFit: 'contain',
                  border: `1px solid ${COLORS.border}`,
                }}
              />
            ) : (
              <Box sx={{ textAlign: 'center' }}>
                <MonitorOff size={64} color={COLORS.borderLight} />
                <Typography variant="h6" sx={{ color: COLORS.textMuted, mt: 2, fontFamily: 'monospace' }}>
                  NO FEED AVAILABLE
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
      </Dialog>

      {/* Pulse animation style */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </>
  );
}
