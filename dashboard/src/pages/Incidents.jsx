/**
 * Incidents Page — Global incident monitoring with review/dismiss actions.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Box, Card, CardContent, Typography, Chip, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  ToggleButtonGroup, ToggleButton, alpha, Skeleton, Divider, InputAdornment
} from '@mui/material';
import { AlertTriangle, CheckCircle, XCircle, ShieldCheck, Terminal, Crosshair, ChevronRight, Search, CheckSquare, Globe, Cpu, FileText, HeartCrack, Activity } from 'lucide-react';
import { incidentsAPI } from '../services/api';
import { useWebSocket } from '../services/websocket';
import { COLORS } from '../theme/theme';

const TYPE_LABELS = {
  AI_EDITOR: { label: 'AI Editor', color: '#f97316' },
  LOCAL_LLM: { label: 'Local LLM', color: '#f43f5e' },
  AI_AGENT: { label: 'AI Agent', color: '#f43f5e' },
  NETWORK_AI_CRITICAL: { label: 'Network (Critical)', color: '#f43f5e' },
  NETWORK_AI_HIGH: { label: 'Network (High)', color: '#f97316' },
  GPU_SPIKE: { label: 'GPU Spike', color: '#eab308' },
  VRAM_SPIKE: { label: 'VRAM Spike', color: '#eab308' },
  MODEL_FILE: { label: 'Model File', color: '#f97316' },
  HEARTBEAT_TIMEOUT: { label: 'Heartbeat Lost', color: '#f43f5e' },
  AI_EXTENSION: { label: 'AI Extension', color: '#eab308' },
};

export default function IncidentsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [reviewDialog, setReviewDialog] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [evidenceDialog, setEvidenceDialog] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: realIncidents, isLoading } = useQuery({
    queryKey: ['incidents', statusFilter],
    queryFn: () => incidentsAPI.list(null, statusFilter, 200).then((r) => r.data),
    placeholderData: keepPreviousData, // Stale-While-Revalidate (Zero-Flash)
  });

  const { incidentAlerts } = useWebSocket('global');
  
  useEffect(() => {
    if (incidentAlerts.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    }
  }, [incidentAlerts, queryClient]);

  const incidents = (realIncidents || []).filter(inc => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const target = inc.contestant?.handle || '';
    const ip = inc.contestant?.ip || '';
    const typeLabel = TYPE_LABELS[inc.type]?.label || inc.type;
    return target.toLowerCase().includes(q) || ip.includes(q) || typeLabel.toLowerCase().includes(q);
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, note }) => incidentsAPI.review(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incidents-open-count'] });
      setReviewDialog(null);
      setReviewNote('');
    },
  });

  const handleReview = (status) => {
    if (reviewDialog) {
      reviewMutation.mutate({ id: reviewDialog.id, status, note: reviewNote });
    }
  };

  const handleReviewAll = async () => {
    try {
      const openIncidents = incidents.filter(i => i.status === 'OPEN');
      if (openIncidents.length === 0) return;
      await Promise.all(openIncidents.map(inc => incidentsAPI.review(inc.id, 'REVIEWED', 'Bulk acknowledged')));
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['incidents-open-count'] });
    } catch (err) {
      console.error('Failed to review all', err);
    }
  };

  return (
    <Box className="fade-in">
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
            <AlertTriangle size={28} color={COLORS.accent} />
            INCIDENTS
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textMuted, mt: 1, fontFamily: 'monospace' }}>
            {incidents?.length || 0} INCIDENTS {statusFilter ? `(${statusFilter})` : ''}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TextField
            size="small"
            placeholder="Search handle, IP, type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{
              width: 250,
              '& .MuiOutlinedInput-root': {
                bgcolor: COLORS.bgDeep, color: '#fff', borderRadius: 0, fontFamily: 'monospace', fontSize: '0.8rem',
                '& fieldset': { borderColor: COLORS.borderLight },
                '&:hover fieldset': { borderColor: COLORS.accent },
                '&.Mui-focused fieldset': { borderColor: COLORS.accent },
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} color={COLORS.textMuted} />
                </InputAdornment>
              ),
            }}
          />
          <ToggleButtonGroup
            value={statusFilter}
            exclusive
            onChange={(_, v) => v && setStatusFilter(v)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                borderRadius: 0,
                border: `1px solid ${COLORS.borderLight}`,
                color: COLORS.textMuted,
                fontFamily: 'monospace',
                fontWeight: 800,
                px: 3,
                '&.Mui-selected': {
                  bgcolor: alpha(COLORS.accent, 0.1),
                  color: COLORS.accent,
                  borderBottom: `2px solid ${COLORS.accent}`
                },
                '&:hover': {
                  bgcolor: alpha(COLORS.accent, 0.05)
                }
              }
            }}
          >
            <ToggleButton value="OPEN">OPEN</ToggleButton>
            <ToggleButton value="REVIEWED">REVIEWED</ToggleButton>
            <ToggleButton value="DISMISSED">DISMISSED</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* Live Alert Stream */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Quick Triage Bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, px: 2, py: 1.5, bgcolor: 'rgba(0,0,0,0.3)', border: `1px solid ${COLORS.borderLight}` }}>
          <Box sx={{ 
            width: 8, height: 8, borderRadius: '50%', bgcolor: COLORS.red, 
            boxShadow: `0 0 8px ${COLORS.red}`, 
            animation: 'pulse-dot 1.5s infinite' 
          }} />
          <style>{`
            @keyframes pulse-dot {
              0% { transform: scale(0.95); opacity: 0.5; }
              50% { transform: scale(1.2); opacity: 1; boxShadow: 0 0 12px ${COLORS.red}; }
              100% { transform: scale(0.95); opacity: 0.5; }
            }
          `}</style>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>LIVE TELEMETRY STREAM</Typography>
          <Box sx={{ flex: 1 }} />
          {statusFilter === 'OPEN' && incidents.length > 0 && (
            <Button 
              size="small" 
              variant="contained" 
              onClick={handleReviewAll}
              sx={{ 
                bgcolor: COLORS.red, color: '#fff', borderRadius: 0, 
                fontFamily: 'monospace', fontWeight: 800, 
                '&:hover': { bgcolor: '#fff', color: COLORS.red } 
              }}
            >
              <CheckSquare size={16} style={{ marginRight: 8 }} />
              MARK ALL AS REVIEWED
            </Button>
          )}
        </Box>

        {isLoading && incidents?.length === 0 ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} variant="rectangular" height={100} sx={{ bgcolor: COLORS.bgCard }} />)
        ) : incidents?.length === 0 ? (
          /* Tactical Empty State */
          <Box sx={{ 
            textAlign: 'center', py: 12, 
            bgcolor: COLORS.bgCard, 
            border: `1px dashed ${statusFilter === 'OPEN' && !searchQuery ? COLORS.green + '40' : COLORS.borderLight}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            boxShadow: `inset 0 0 50px ${statusFilter === 'OPEN' && !searchQuery ? COLORS.green + '05' : 'transparent'}`
          }}>
            {statusFilter === 'OPEN' && !searchQuery ? (
              <ShieldCheck size={64} style={{ marginBottom: 16, color: COLORS.green, filter: 'drop-shadow(0 0 10px rgba(34,197,94,0.4))' }} />
            ) : (
              <CheckCircle size={64} style={{ marginBottom: 16, color: COLORS.textMuted }} />
            )}
            <Typography variant="h5" sx={{ fontWeight: 800, color: statusFilter === 'OPEN' && !searchQuery ? COLORS.green : COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1 }}>
              {searchQuery ? 'NO MATCHES FOUND' : statusFilter === 'OPEN' ? 'System Secure' : 'No Records Found'}
            </Typography>
            <Typography variant="body1" sx={{ color: COLORS.textMuted, fontFamily: 'monospace' }}>
              {searchQuery ? `NO RESULTS FOR "${searchQuery.toUpperCase()}"` : `NO ${statusFilter.toUpperCase()} ANOMALIES DETECTED IN THE NETWORK`}
            </Typography>
          </Box>
        ) : (
          incidents?.map((incident, index) => {
            const isCritical = incident.weight >= 9.0;
            const isMaxSeverity = incident.weight === 10.0;
            const mainColor = incident.weight >= 9.5 ? COLORS.red : incident.weight >= 7 ? COLORS.yellow : COLORS.accent;
            
            const renderIcon = () => {
              const type = incident.type || incident.indicator_type || '';
              if (type.includes('NETWORK')) return <Globe size={24} color={mainColor} />;
              if (type.includes('GPU') || type.includes('VRAM')) return <Cpu size={24} color={mainColor} />;
              if (type.includes('FILE') || type.includes('MODEL')) return <FileText size={24} color={mainColor} />;
              if (type.includes('HEARTBEAT')) return <HeartCrack size={24} color={mainColor} />;
              if (type.includes('AI')) return <Activity size={24} color={mainColor} />;
              return <Terminal size={24} color={mainColor} />;
            };

            return (
              <Box 
                key={incident.id} 
                className="fade-in"
                sx={{ 
                  bgcolor: isMaxSeverity ? alpha(COLORS.red, 0.04) : COLORS.bgCard,
                  backgroundImage: isMaxSeverity ? `repeating-linear-gradient(-45deg, transparent, transparent 10px, ${alpha(COLORS.red, 0.03)} 10px, ${alpha(COLORS.red, 0.03)} 20px)` : 'none',
                  border: `1px solid ${isMaxSeverity ? alpha(COLORS.red, 0.3) : COLORS.border}`,
                  borderLeft: `4px solid ${mainColor}`,
                  p: 3,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 3,
                  animationDelay: `${index * 0.05}s`, // Staggered slide-in
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    bgcolor: alpha(mainColor, 0.03),
                    borderColor: mainColor,
                    transform: 'translateX(4px)' // Brutalist micro-interaction
                  }
                }}
              >
                <Box sx={{ pt: 0.5 }}>
                  {renderIcon()}
                </Box>
                
                <Box sx={{ flex: 1 }}>
                  {/* Alert Header Line */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontFamily: 'monospace', color: COLORS.textMuted, fontSize: '0.85rem' }}>
                      [ {new Date(incident.detected_at).toLocaleTimeString()} ]
                    </Typography>
                    <Chip 
                      label={`SEV-${incident.weight.toFixed(1)}`} 
                      size="small" 
                      sx={{ 
                        bgcolor: alpha(mainColor, 0.1), 
                        color: mainColor, 
                        fontWeight: 900, 
                        borderRadius: 0, 
                        fontFamily: 'monospace' 
                      }} 
                    />
                    <Typography sx={{ fontWeight: 800, color: '#fff', fontSize: '1.1rem', letterSpacing: '0.05em' }}>
                      {incident.indicator_type.replace(/_/g, ' ')} DETECTED
                    </Typography>
                  </Box>

                  {/* Target & Evidence */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>
                      TARGET_NODE:{' '}
                      <span 
                        onClick={() => navigate(`/dashboard/contestant/${incident.contestant_id || incident.target?.match(/C-(\d+)/)?.[1] || 'unknown'}`)} 
                        style={{ color: COLORS.accent, textDecoration: 'underline', textUnderlineOffset: '4px', cursor: 'pointer', fontWeight: 800 }}
                        onMouseOver={(e) => e.target.style.color = '#fff'}
                        onMouseOut={(e) => e.target.style.color = COLORS.accent}
                      >
                        {incident.target || `NODE_${incident.contestant_id}`}
                      </span>
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', color: COLORS.textSecondary, bgcolor: 'rgba(0,0,0,0.5)', p: 1.5, borderLeft: `2px solid ${isMaxSeverity ? COLORS.red : COLORS.borderLight}` }}>
                      {incident.evidence || 'No payload evidence provided.'}
                    </Typography>
                  </Box>
                </Box>

                {/* Actions */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 140 }}>
                  {incident.status === 'OPEN' && (
                    <>
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={() => setReviewDialog(incident)}
                        sx={{ 
                          bgcolor: mainColor, 
                          color: '#000', 
                          borderRadius: 0, 
                          fontWeight: 800,
                          '&:hover': { bgcolor: alpha(mainColor, 0.8) }
                        }}
                      >
                        TRIAGE
                      </Button>
                      <Button
                        variant="outlined"
                        fullWidth
                        onClick={() => setEvidenceDialog(incident)}
                        sx={{ 
                          borderColor: COLORS.borderLight, 
                          color: COLORS.textMuted, 
                          borderRadius: 0, 
                          fontSize: '0.75rem',
                          '&:hover': { borderColor: COLORS.textPrimary, color: COLORS.textPrimary }
                        }}
                      >
                        VIEW EVIDENCE
                      </Button>
                    </>
                  )}
                </Box>
              </Box>
            );
          })
        )}
      </Box>

      {/* Review Dialog */}
      <Dialog open={!!reviewDialog} onClose={() => setReviewDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Review Incident</DialogTitle>
        <DialogContent>
          {reviewDialog && (
            <Box sx={{ mb: 2, mt: 1 }}>
              <Chip label={reviewDialog.indicator_type} size="small"
                sx={{ bgcolor: alpha(COLORS.red, 0.1), color: COLORS.red, mb: 1 }}
              />
              <Typography variant="body2" sx={{ fontFamily: 'monospace', color: COLORS.textSecondary }}>
                {reviewDialog.evidence}
              </Typography>
            </Box>
          )}
          <TextField
            id="review-note"
            fullWidth
            label="Review Note (optional)"
            multiline rows={3}
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Add context or rationale for this decision..."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setReviewDialog(null)}>Cancel</Button>
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<XCircle size={16} />}
            onClick={() => handleReview('DISMISSED')}
          >
            Dismiss
          </Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={<CheckCircle size={16} />}
            onClick={() => handleReview('REVIEWED')}
          >
            Confirm & Review
          </Button>
        </DialogActions>
      </Dialog>

      {/* Evidence Viewer Dialog */}
      <Dialog open={!!evidenceDialog} onClose={() => setEvidenceDialog(null)} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: '#0a0a0a', border: `1px solid ${COLORS.border}`, borderRadius: 0 } }}>
        <DialogTitle sx={{ fontFamily: 'monospace', color: COLORS.accent, borderBottom: `1px solid ${COLORS.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#000' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Terminal size={20} />
            [ EVIDENCE RAW LOGS : {evidenceDialog?.indicator_type} ]
          </Box>
          <Button onClick={() => setEvidenceDialog(null)} sx={{ color: COLORS.textMuted, minWidth: 0, p: 0, '&:hover': { color: COLORS.red } }}>[ X ]</Button>
        </DialogTitle>
        <DialogContent sx={{ p: 0, '&::-webkit-scrollbar': { width: 8 }, '&::-webkit-scrollbar-thumb': { bgcolor: COLORS.borderLight } }}>
          {/* Dynamic Evidence Payload Viewer */}
          <Box sx={{ p: 3, fontFamily: 'monospace', color: '#fff', bgcolor: '#000', height: 400, overflowY: 'auto' }}>
            <Typography variant="body2" sx={{ color: COLORS.accent, mb: 2, fontWeight: 800 }}>[ INTERCEPTED PAYLOAD DATA: {evidenceDialog?.indicator_type || 'UNKNOWN'} ]</Typography>
            
            {/* Raw JSON Data Representation */}
            <Box sx={{ bgcolor: '#0a0a0a', p: 2, borderLeft: `2px solid ${evidenceDialog?.weight >= 9 ? COLORS.red : COLORS.yellow}`, mb: 3 }}>
              <Typography sx={{ color: COLORS.textMuted, fontSize: '0.85rem', mb: 1 }}>{`> TIMESTAMP: ${evidenceDialog?.detected_at ? new Date(evidenceDialog.detected_at).toISOString() : new Date().toISOString()}`}</Typography>
              <Typography sx={{ color: COLORS.textMuted, fontSize: '0.85rem', mb: 1 }}>{`> TARGET_ID: ${evidenceDialog?.contestant_id}`}</Typography>
              <Typography sx={{ color: COLORS.textMuted, fontSize: '0.85rem', mb: 1 }}>{`> INDICATOR: ${evidenceDialog?.indicator_type}`}</Typography>
              <Divider sx={{ my: 1.5, borderColor: '#333' }} />
              <Typography sx={{ color: COLORS.textPrimary, fontSize: '0.9rem', whiteSpace: 'pre-wrap', fontWeight: 600 }}>
                {evidenceDialog?.evidence || 'No additional evidence string provided in payload.'}
              </Typography>
            </Box>

            {/* Simulated Deep Packet Inspection / Binary Analysis Block */}
            <Typography variant="body2" sx={{ color: COLORS.textSecondary, mb: 1 }}>[ DEEP INSPECTION ANALYSIS ]</Typography>
            <Box sx={{ bgcolor: '#111', p: 2, border: `1px solid #333`, borderRadius: 1 }}>
              <Typography sx={{ color: COLORS.green, fontSize: '0.8rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {(() => {
                  try {
                    // Attempt to parse evidence as JSON to pretty-print it
                    const evidenceObj = evidenceDialog?.evidence ? JSON.parse(evidenceDialog.evidence) : {};
                    const payload = {
                      event_id: evidenceDialog?.id,
                      severity_score: evidenceDialog?.weight,
                      status: evidenceDialog?.status,
                      ...evidenceObj
                    };
                    return JSON.stringify(payload, null, 2);
                  } catch (e) {
                    // Fallback to raw string if it's not valid JSON
                    const payload = {
                      event_id: evidenceDialog?.id,
                      severity_score: evidenceDialog?.weight,
                      status: evidenceDialog?.status,
                      raw_evidence: evidenceDialog?.evidence || null
                    };
                    return JSON.stringify(payload, null, 2);
                  }
                })()}
              </Typography>
            </Box>

            {evidenceDialog?.indicator_type?.includes('CRITICAL') && (
              <Typography variant="body2" sx={{ color: COLORS.red, mt: 3, fontWeight: 800 }}>
                [!] ACTION REQUIRED: Immediate proctor intervention recommended.
              </Typography>
            )}
            <Typography variant="body2" sx={{ color: COLORS.textMuted, mt: 3 }}>// End of transmission</Typography>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
