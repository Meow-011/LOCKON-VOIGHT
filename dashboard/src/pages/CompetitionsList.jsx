import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Card, Typography, Grid, Chip, Button, Skeleton, Divider, Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText, TextField, Tooltip, IconButton, alpha } from '@mui/material';
import { Trophy, Plus, Users, ArrowRight, Activity, AlertTriangle, Play, Square, Archive, Trash2, UploadCloud, X, Edit3, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { competitionsAPI } from '../services/api';
import { COLORS } from '../theme/theme';

const STATUS_COLORS = {
  draft: { color: COLORS.textMuted },
  active: { color: COLORS.green },
  completed: { color: COLORS.accent },
  archived: { color: COLORS.textMuted },
};

const PREDEFINED_BANNERS = [
  { label: 'Global Operation', url: '/banner-global.png' },
  { label: 'Regional Sector', url: '/banner-regional.png' },
  { label: 'Minimal Mode', url: '' },
];

function TimerDisplay({ startTime, status }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== 'active' || !startTime) return;
    const update = () => {
      setElapsed(Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime, status]);

  if (status !== 'active') return null;

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  
  return (
    <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
      <Activity size={18} color={COLORS.green} className="pulse-animation" />
      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: COLORS.green, fontWeight: 800, letterSpacing: '0.1em' }}>
        T+ {h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
      </Typography>
    </Box>
  );
}

export default function CompetitionsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newComp, setNewComp] = useState({ name: '', description: '', banner: '/banner-global.png', start_time: null, end_time: null });
  const [hoveredId, setHoveredId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  const formatForInput = (dateString) => {
    if (!dateString) return '';
    try {
      const d = new Date(dateString);
      return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    } catch { return ''; }
  };

  const parseFromInput = (val) => {
    if (!val) return null;
    return new Date(val).toISOString();
  };

  const { data: competitions, isLoading, refetch } = useQuery({
    queryKey: ['competitions'],
    queryFn: () => competitionsAPI.list().then((r) => r.data),
  });

  const activeComp = competitions?.find(c => c.id === hoveredId) || (competitions && competitions.length > 0 ? competitions[0] : null);

  const handleSave = async () => {
    try {
      if (editingId) {
        await competitionsAPI.update(editingId, newComp);
      } else {
        await competitionsAPI.create(newComp);
      }
      setCreateOpen(false);
      setEditingId(null);
      setNewComp({ name: '', description: '', banner: '/banner-global.png', start_time: null, end_time: null });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['active-competitions-layout'] });
      toast.success(editingId ? "Competition updated successfully" : "Competition created successfully");
    } catch (err) {
      console.error('Save failed:', err);
      toast.error(err.response?.data?.detail || "Save failed");
    }
  };

  const openEditModal = (comp) => {
    setEditingId(comp.id);
    setNewComp({ 
      name: comp.name, 
      description: comp.description || '', 
      banner: comp.banner || '/banner-global.png',
      start_time: comp.start_time,
      end_time: comp.end_time
    });
    setCreateOpen(true);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await competitionsAPI.uploadBanner(file);
      setNewComp({ ...newComp, banner: res.data.url });
      toast.success("Banner uploaded successfully");
    } catch (err) {
      console.error("Upload failed", err);
      toast.error("Upload failed");
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await competitionsAPI.update(id, { status });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['active-competitions-layout'] });
      toast.success(`Competition status updated to ${status}`);
    } catch (err) {
      console.error('Failed to update status:', err);
      toast.error("Failed to update status");
    }
  };

  const handleResetTimer = async (id) => {
    try {
      await competitionsAPI.update(id, { start_time: new Date().toISOString() });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['active-competitions-layout'] });
      toast.success("Timer reset successfully");
    } catch (err) {
      console.error('Failed to reset timer:', err);
      toast.error("Failed to reset timer");
    }
  };

  const handleDelete = async (id) => {
    setConfirmDialog({
      open: true,
      title: "Delete Competition",
      message: "Are you sure you want to delete this competition?",
      onConfirm: async () => {
        try {
          await competitionsAPI.delete(id);
          if (hoveredId === id) setHoveredId(null);
          refetch();
          toast.success("Competition deleted successfully");
        } catch (err) {
          console.error('Failed to delete competition:', err);
          toast.error("Failed to delete competition");
        }
      }
    });
  };

  return (
    <Box className="fade-in" sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Trophy size={28} color={COLORS.accent} />
            COMPETITIONS
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textMuted, mt: 1, fontFamily: 'monospace' }}>
            SELECT A COMPETITION TO VIEW NETWORK TOPOLOGY
          </Typography>
        </Box>
        <Button
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

      {isLoading ? (
        <Skeleton variant="rectangular" height={400} sx={{ bgcolor: COLORS.bgSurface }} />
      ) : (!competitions || competitions.length === 0) ? (
        <Card sx={{ flex: 1, minHeight: '60vh', textAlign: 'center', py: 10, borderRadius: 0, bgcolor: alpha(COLORS.accent, 0.02), border: `1px dashed ${alpha(COLORS.accent, 0.4)}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ 
            mb: 3, 
            animation: 'pulse-dot 2.5s infinite',
            '@keyframes pulse-dot': {
              '0%, 100%': { opacity: 1, transform: 'scale(1)' },
              '50%': { opacity: 0.4, transform: 'scale(0.95)' },
            }
          }}>
            <Trophy size={64} color={COLORS.accent} />
          </Box>
          <Typography variant="h6" sx={{ color: COLORS.accent, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>
            System Standby
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textMuted, mb: 4, fontFamily: 'monospace' }}>
            No arenas online. Initialize a new competition framework to begin deployment.
          </Typography>
          <Button 
            variant="contained" 
            startIcon={<Plus size={18} />} 
            onClick={() => setCreateOpen(true)} 
            sx={{ bgcolor: COLORS.accent, color: '#000', borderRadius: 0, px: 4, py: 1, fontWeight: 800, fontFamily: 'monospace', '&:hover': { bgcolor: '#fff', color: '#000' } }}
          >
            INITIALIZE FRAMEWORK
          </Button>
        </Card>
      ) : (
        <Box sx={{ display: 'flex', gap: 4, minHeight: '60vh', mt: 2, alignItems: 'flex-start' }}>
          <Box sx={{
            flex: 1, display: 'flex', flexDirection: 'column', gap: 1,
            position: 'sticky', top: 24, pr: 2,
            maxHeight: 'calc(100vh - 100px)', overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: '#f714ff44 transparent',
            '&::-webkit-scrollbar': { width: '4px' },
            '&::-webkit-scrollbar-thumb': { backgroundColor: '#FF1493', borderRadius: '4px' }
          }}>
            {competitions.map((comp) => {
              const isHovered = activeComp?.id === comp.id;
              const statusCfg = STATUS_COLORS[comp.status] || STATUS_COLORS.draft;
              return (
                <Box
                  key={comp.id}
                  onMouseEnter={() => setHoveredId(comp.id)}
                  onClick={() => navigate(`/competitions/${comp.id}`)}
                  sx={{
                    p: 3,
                    cursor: 'pointer',
                    borderLeft: `4px solid ${isHovered ? statusCfg.color : 'transparent'}`,
                    bgcolor: isHovered ? 'rgba(255,255,255,0.03)' : 'transparent',
                    transition: 'all 0.2s ease-out',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="h5" sx={{
                      fontWeight: 900,
                      color: isHovered ? COLORS.textPrimary : COLORS.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      transition: 'color 0.2s'
                    }}>
                      {comp.name}
                    </Typography>
                    {comp.ai_flags > 0 && (
                      <Box sx={{ width: 8, height: 8, bgcolor: COLORS.red, borderRadius: 0, boxShadow: `0 0 10px ${COLORS.red}` }} />
                    )}
                  </Box>
                </Box>
              )
            })}
          </Box>

          <Box sx={{
            flex: 1.5,
            bgcolor: COLORS.bgDeep,
            border: `1px solid ${COLORS.border}`,
            position: 'relative',
            display: 'flex',
            flexDirection: 'row',
            overflow: 'hidden'
          }}>
            {activeComp && (
              <>
                <Box
                  key={activeComp.id}
                  className="fade-in"
                  sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}
                >
                  <Box sx={{
                    width: '100%',
                    height: 200,
                    flexShrink: 0,
                    backgroundImage: `url(${activeComp.banner || '/banner-global.png'})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderBottom: `1px solid ${COLORS.border}`,
                    position: 'relative',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      top: 0, left: 0, right: 0, bottom: 0,
                      background: 'linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(10,10,10,1) 100%)'
                    }
                  }} />

                  <Box sx={{ p: 5, pt: 4, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                      <Chip
                        label={activeComp.status.toUpperCase()}
                        size="small"
                        sx={{
                          bgcolor: 'transparent',
                          border: `1px solid ${STATUS_COLORS[activeComp.status]?.color || COLORS.textMuted}`,
                          color: STATUS_COLORS[activeComp.status]?.color || COLORS.textMuted,
                          fontWeight: 800,
                          borderRadius: 0
                        }}
                      />
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', color: COLORS.textMuted, letterSpacing: '0.1em' }}>
                        SYS.ID: {activeComp.id.toUpperCase()}
                      </Typography>
                      <TimerDisplay startTime={activeComp.start_time} status={activeComp.status} />
                    </Box>

                    <Typography variant="h3" sx={{ fontWeight: 900, mb: 3, textTransform: 'uppercase', lineHeight: 1.1 }}>
                      {activeComp.name}
                    </Typography>

                    <Typography variant="body1" sx={{ color: COLORS.textSecondary, mb: 6, fontSize: '1.1rem', lineHeight: 1.6, maxWidth: '90%' }}>
                      {activeComp.description || 'No description available. Get hacking!'}
                    </Typography>

                    <Divider sx={{ borderColor: COLORS.borderLight, mb: 4 }} />

                    <Box sx={{ display: 'flex', gap: 6, mb: 'auto' }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: COLORS.textMuted, fontFamily: 'monospace', mb: 1, display: 'block' }}>TOTAL ENROLLMENT</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Users size={24} color={COLORS.textPrimary} />
                          <Typography variant="h4" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>{activeComp.contestant_count || 0}</Typography>
                        </Box>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: COLORS.textMuted, fontFamily: 'monospace', mb: 1, display: 'block' }}>SUSPICIOUS AI ACTIVITY</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <AlertTriangle size={24} color={activeComp.ai_flags > 0 ? COLORS.red : COLORS.textMuted} />
                          <Typography variant="h4" sx={{ fontWeight: 800, fontFamily: 'monospace', color: activeComp.ai_flags > 0 ? COLORS.red : COLORS.textPrimary }}>
                            {activeComp.ai_flags || 0} FLAGS
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    <Box sx={{ mt: 4, display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Typography variant="overline" sx={{ color: COLORS.textMuted, mr: 2 }}>OPERATIONS:</Typography>

                      <Tooltip title="Edit Competition">
                        <Button onClick={() => openEditModal(activeComp)} variant="outlined" size="small" sx={{ borderColor: COLORS.textSecondary, color: COLORS.textSecondary, minWidth: 0, p: 1, borderRadius: 0, '&:hover': { bgcolor: alpha(COLORS.textSecondary, 0.1) } }}>
                          <Edit3 size={18} />
                        </Button>
                      </Tooltip>

                      <Tooltip title="Start Operation">
                        <Button onClick={() => handleUpdateStatus(activeComp.id, 'active')} variant="outlined" size="small" sx={{ borderColor: COLORS.green, color: COLORS.green, minWidth: 0, p: 1, borderRadius: 0, '&:hover': { bgcolor: alpha(COLORS.green, 0.1) } }}>
                          <Play size={18} />
                        </Button>
                      </Tooltip>

                      <Tooltip title="Reset Timer">
                        <Button onClick={() => handleResetTimer(activeComp.id)} variant="outlined" size="small" sx={{ borderColor: COLORS.yellow, color: COLORS.yellow, minWidth: 0, p: 1, borderRadius: 0, '&:hover': { bgcolor: alpha(COLORS.yellow, 0.1) } }}>
                          <RotateCcw size={18} />
                        </Button>
                      </Tooltip>

                      <Tooltip title="End Operation">
                        <Button onClick={() => handleUpdateStatus(activeComp.id, 'completed')} variant="outlined" size="small" sx={{ borderColor: COLORS.accent, color: COLORS.accent, minWidth: 0, p: 1, borderRadius: 0, '&:hover': { bgcolor: alpha(COLORS.accent, 0.1) } }}>
                          <Square size={18} />
                        </Button>
                      </Tooltip>

                      <Tooltip title="Archive">
                        <Button onClick={() => handleUpdateStatus(activeComp.id, 'archived')} variant="outlined" size="small" sx={{ borderColor: COLORS.textMuted, color: COLORS.textMuted, minWidth: 0, p: 1, borderRadius: 0, '&:hover': { bgcolor: alpha(COLORS.textMuted, 0.1) } }}>
                          <Archive size={18} />
                        </Button>
                      </Tooltip>

                      <Box sx={{ flex: 1 }} />

                      <Tooltip title="Delete Competition">
                        <Button onClick={() => handleDelete(activeComp.id)} variant="outlined" size="small" sx={{ borderColor: COLORS.red, color: COLORS.red, minWidth: 0, p: 1, borderRadius: 0, '&:hover': { bgcolor: alpha(COLORS.red, 0.1) } }}>
                          <Trash2 size={18} />
                        </Button>
                      </Tooltip>
                    </Box>
                  </Box>
                </Box>

                <Button
                  onClick={() => navigate(`/competitions/${activeComp.id}`)}
                  sx={{
                    width: 64,
                    flexShrink: 0,
                    bgcolor: COLORS.accent,
                    color: '#000',
                    borderRadius: 0,
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    transform: 'rotate(180deg)',
                    fontWeight: 900,
                    letterSpacing: '0.2em',
                    fontSize: '1.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 4,
                    transition: 'all 0.2s ease-in-out',
                    position: 'relative',
                    '&:hover': {
                      bgcolor: COLORS.green,
                      color: '#000',
                    },
                    '& .hover-text': {
                      display: 'none',
                    },
                    '&:hover .default-text': {
                      display: 'none',
                    },
                    '&:hover .hover-text': {
                      display: 'flex',
                    },
                    '&:hover .arrow-icon': {
                      transform: 'rotate(90deg) translateX(8px)',
                    }
                  }}
                >
                  <Box className="default-text" sx={{ display: 'flex', alignItems: 'center', fontWeight: 900 }}>
                    MONITOR ARENA
                  </Box>
                  <Box className="hover-text" sx={{ alignItems: 'center', fontWeight: 900, gap: 1 }}>
                    HUNT GHOSTS
                  </Box>
                  <ArrowRight className="arrow-icon" size={20} style={{ position: 'absolute', bottom: 24, transform: 'rotate(90deg)', transition: 'all 0.2s' }} />
                </Button>
              </>
            )}
          </Box>
        </Box>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? "Edit Competition" : "Create Competition"}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Competition Name" sx={{ mt: 1, mb: 2 }}
            value={newComp.name} onChange={(e) => setNewComp({ ...newComp, name: e.target.value })}
            placeholder="e.g. National CTF 2026"
          />
          <TextField
            fullWidth label="Description" multiline rows={3} sx={{ mb: 2 }}
            value={newComp.description} onChange={(e) => setNewComp({ ...newComp, description: e.target.value })}
            placeholder="Brief description of the competition..."
          />
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              fullWidth label="Start Time (Optional)"
              type={newComp.start_time ? "datetime-local" : "text"}
              onFocus={(e) => { e.target.type = 'datetime-local'; }}
              onBlur={(e) => { if (!e.target.value) e.target.type = 'text'; }}
              InputLabelProps={{ shrink: true }}
              value={formatForInput(newComp.start_time)}
              onChange={(e) => setNewComp({ ...newComp, start_time: parseFromInput(e.target.value) })}
            />
            <TextField
              fullWidth label="End Time (Optional)"
              type={newComp.end_time ? "datetime-local" : "text"}
              onFocus={(e) => { e.target.type = 'datetime-local'; }}
              onBlur={(e) => { if (!e.target.value) e.target.type = 'text'; }}
              InputLabelProps={{ shrink: true }}
              value={formatForInput(newComp.end_time)}
              onChange={(e) => setNewComp({ ...newComp, end_time: parseFromInput(e.target.value) })}
            />
          </Box>
          <Box sx={{ mt: 3 }}>
            <Typography variant="overline" sx={{ color: COLORS.textMuted }}>Select Banner Image</Typography>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              {PREDEFINED_BANNERS.map((banner, idx) => (
                <Grid item xs={3} key={idx}>
                  <Box
                    onClick={() => setNewComp({ ...newComp, banner: banner.url })}
                    sx={{
                      height: 80,
                      border: `2px solid ${newComp.banner === banner.url ? COLORS.accent : COLORS.border}`,
                      borderRadius: 1,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      position: 'relative',
                      bgcolor: COLORS.bgDeep,
                      transition: 'all 0.2s',
                      '&:hover': { borderColor: newComp.banner === banner.url ? COLORS.accent : COLORS.borderLight }
                    }}
                  >
                    {banner.url ? (
                      <img src={banner.url} alt={banner.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="caption" sx={{ color: COLORS.textMuted }}>NO IMAGE</Typography>
                      </Box>
                    )}
                  </Box>
                  <Typography variant="caption" sx={{ 
                    display: 'block', textAlign: 'center', mt: 1, 
                    color: newComp.banner === banner.url ? COLORS.textPrimary : COLORS.textSecondary,
                    fontWeight: newComp.banner === banner.url ? 700 : 400
                  }}>
                    {banner.label}
                  </Typography>
                </Grid>
              ))}
              
              <Grid item xs={3}>
                <Box
                  component="label"
                  sx={{
                    height: 80,
                    border: `2px dashed ${!PREDEFINED_BANNERS.find(b => b.url === newComp.banner) ? COLORS.accent : COLORS.border}`,
                    borderRadius: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    bgcolor: 'transparent',
                    transition: 'all 0.2s',
                    position: 'relative',
                    overflow: 'hidden',
                    '&:hover': { borderColor: COLORS.accent, bgcolor: alpha(COLORS.accent, 0.05) }
                  }}
                >
                  {!PREDEFINED_BANNERS.find(b => b.url === newComp.banner) && newComp.banner ? (
                    <>
                      <img src={newComp.banner} alt="Custom" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <Box sx={{ position: 'absolute', top: 0, right: 0, bgcolor: COLORS.accent, px: 1, py: 0.5, borderBottomLeftRadius: 4 }}>
                        <Typography variant="caption" sx={{ color: '#000', fontWeight: 900 }}>CUSTOM</Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setNewComp({ ...newComp, banner: '/banner-global.png' });
                        }}
                        sx={{
                          position: 'absolute',
                          top: 4,
                          left: 4,
                          bgcolor: 'rgba(0,0,0,0.6)',
                          color: '#fff',
                          p: 0.5,
                          '&:hover': { bgcolor: COLORS.red }
                        }}
                      >
                        <X size={14} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={24} color={COLORS.textMuted} style={{ marginBottom: 4 }} />
                    </>
                  )}
                  <input type="file" accept="image/*" hidden onChange={handleFileUpload} />
                </Box>
                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 1, color: COLORS.textSecondary }}>
                  Upload Custom
                </Typography>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setCreateOpen(false); setEditingId(null); setNewComp({ name: '', description: '', banner: '/banner-global.png', start_time: null, end_time: null }); }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!newComp.name}>
            {editingId ? "Save Changes" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog 
        open={confirmDialog.open} 
        onClose={() => setConfirmDialog({ ...confirmDialog, open: false })}
      >
        <DialogTitle>{confirmDialog.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirmDialog.message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}>Cancel</Button>
          <Button onClick={() => {
            confirmDialog.onConfirm();
            setConfirmDialog({ ...confirmDialog, open: false });
          }}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
