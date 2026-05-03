/**
 * User Management Page — Proctor account administration.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Card, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, alpha, Button, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, MenuItem, InputAdornment, DialogContentText
} from '@mui/material';
import { Users, UserPlus, Edit3, UserX, Shield, Eye, Clock, Search, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { COLORS } from '../theme/theme';
import { usersAPI } from '../services/api';

const ROLES = {
  ADMIN: { label: 'ADMIN', color: COLORS.red, desc: 'Full system access' },
  PROCTOR: { label: 'PROCTOR', color: COLORS.accent, desc: 'Monitor & respond' },
  OBSERVER: { label: 'OBSERVER', color: COLORS.textMuted, desc: 'Read-only access' },
};


export default function UserManagementPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['proctors'],
    queryFn: () => usersAPI.list().then(r => r.data),
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ username: '', role: 'PROCTOR', password: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, user: null });

  const openCreate = () => {
    setEditUser(null);
    setForm({ username: '', role: 'PROCTOR', password: '' });
    setDialogOpen(true);
  };

  const openEdit = (user) => {
    setEditUser(user);
    setForm({ username: user.username, role: user.role, password: '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editUser) {
        await usersAPI.update(editUser.id, { role: form.role });
      } else {
        await usersAPI.create({ username: form.username, password: form.password, role: form.role });
      }
      queryClient.invalidateQueries({ queryKey: ['proctors'] });
      setDialogOpen(false);
      toast.success(editUser ? "User updated successfully" : "User created successfully");
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Operation failed');
    }
  };

  const toggleStatus = async (id, currentlyActive) => {
    try {
      await usersAPI.update(id, { is_active: !currentlyActive });
      queryClient.invalidateQueries({ queryKey: ['proctors'] });
      toast.success(`User ${!currentlyActive ? 'activated' : 'deactivated'} successfully`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update status');
    }
  };

  const handleDelete = async () => {
    try {
      await usersAPI.delete(deleteConfirm.user.id);
      queryClient.invalidateQueries({ queryKey: ['proctors'] });
      toast.success("User deleted successfully");
      setDeleteConfirm({ open: false, user: null });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete user');
    }
  };

  const activeCount = users.filter(u => u.is_active).length;
  
  const filteredUsers = users.filter(u => {
    const qMatch = u.username.toLowerCase().includes(searchQuery.toLowerCase());
    if (!qMatch) return false;
    if (roleFilter === 'ACTIVE') return u.is_active;
    if (roleFilter !== 'ALL' && u.role?.toUpperCase() !== roleFilter) return false;
    return true;
  });

  return (
    <Box className="fade-in" sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Users size={28} color={COLORS.accent} />
            USER MANAGEMENT
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textMuted, mt: 1, fontFamily: 'monospace' }}>
            PROCTOR ACCOUNTS & ACCESS CONTROL
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {/* Stats Box */}
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', bgcolor: 'rgba(255, 255, 255, 0.03)', px: 3, py: 1.5, border: `1px solid ${COLORS.borderLight}` }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 800, color: COLORS.green, lineHeight: 1 }}>{activeCount}</Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: COLORS.textMuted, letterSpacing: '0.1em', mt: 0.5 }}>ACTIVE</Typography>
            </Box>
            <Box sx={{ width: '1px', height: 32, bgcolor: COLORS.borderLight }} />
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 800, color: COLORS.textPrimary, lineHeight: 1 }}>{users.length}</Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: COLORS.textMuted, letterSpacing: '0.1em', mt: 0.5 }}>TOTAL</Typography>
            </Box>
          </Box>
          
          <Button variant="contained" startIcon={<UserPlus size={16} />} onClick={openCreate}
            sx={{ bgcolor: COLORS.accent, color: '#000', borderRadius: 0, fontWeight: 800, ml: 1, '&:hover': { bgcolor: '#fff' } }}>
            ADD USER
          </Button>
        </Box>
      </Box>

      {/* Role Legend & Filters */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {Object.entries(ROLES).map(([key, r]) => (
            <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, border: `1px solid ${alpha(r.color, 0.3)}`, bgcolor: alpha(r.color, 0.05) }}>
              <Box sx={{ width: 8, height: 8, bgcolor: r.color }} />
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, color: r.color }}>{r.label}</Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: COLORS.textMuted }}>— {r.desc}</Typography>
            </Box>
          ))}
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            size="small"
            placeholder="Search username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{
              width: 250,
              '& .MuiOutlinedInput-root': {
                bgcolor: COLORS.bgDeep, color: '#fff', borderRadius: 0, fontFamily: 'monospace', fontSize: '0.8rem',
                '& fieldset': { borderColor: COLORS.borderLight },
              }
            }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search size={16} color={COLORS.textMuted} /></InputAdornment>,
            }}
          />
          <Select
            size="small"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            sx={{ bgcolor: COLORS.bgDeep, color: '#fff', borderRadius: 0, fontFamily: 'monospace', fontSize: '0.8rem', '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.borderLight } }}
          >
            <MenuItem value="ALL" sx={{ fontFamily: 'monospace' }}>ALL ROLES</MenuItem>
            <MenuItem value="ACTIVE" sx={{ fontFamily: 'monospace' }}>ACTIVE ONLY</MenuItem>
            {Object.keys(ROLES).map(r => <MenuItem key={r} value={r} sx={{ fontFamily: 'monospace' }}>{r}</MenuItem>)}
          </Select>
        </Box>
      </Box>

      {/* Users Table */}
      <TableContainer component={Paper} sx={{ bgcolor: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 0 }}>
        <Table>
          <TableHead sx={{ bgcolor: COLORS.bgDeep }}>
            <TableRow>
              <TableCell sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>USERNAME</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>ROLE</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>STATUS</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>LAST LOGIN</TableCell>
              <TableCell sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>CREATED</TableCell>
              <TableCell align="right" sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 10, borderBottom: 'none' }}>
                  <Search size={48} color={alpha(COLORS.textMuted, 0.5)} style={{ marginBottom: 16 }} />
                  <Typography variant="h6" sx={{ color: COLORS.textSecondary, fontFamily: 'monospace', fontWeight: 700, textTransform: 'uppercase' }}>
                    {searchQuery ? `NO USERS MATCHING "${searchQuery}"` : "NO USERS FOUND"}
                  </Typography>
                  <Typography variant="body2" sx={{ color: COLORS.textMuted, fontFamily: 'monospace', mt: 1 }}>
                    Try adjusting your filters or search term.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => {
                const role = ROLES[user.role?.toUpperCase()] || ROLES.PROCTOR;
              const isActive = user.is_active;
              const isMe = currentUser?.username === user.username;
              return (
                <TableRow key={user.id} hover sx={{ 
                  '&:hover': { bgcolor: alpha(COLORS.accent, 0.05), '& .action-btns': { opacity: 1 } }, 
                  opacity: isActive ? 1 : 0.5,
                  borderLeft: `3px solid ${role.color}`
                }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ 
                        width: 32, height: 32, 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        bgcolor: alpha(role.color, 0.1), color: role.color, 
                        fontWeight: 900, fontFamily: 'monospace', border: `1px solid ${alpha(role.color, 0.3)}`
                      }}>
                        {user.username.charAt(0).toUpperCase()}
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontWeight: 800, fontFamily: 'monospace', color: COLORS.textPrimary }}>
                          {user.username}
                        </Typography>
                        {isMe && <Chip label="(YOU)" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: alpha(COLORS.accent, 0.2), color: COLORS.accent, fontWeight: 900, borderRadius: 0, border: `1px solid ${alpha(COLORS.accent, 0.5)}` }} />}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={role.label} size="small" sx={{
                      bgcolor: alpha(role.color, 0.12), color: role.color,
                      fontWeight: 800, fontSize: '0.65rem', borderRadius: 0, fontFamily: 'monospace',
                    }} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, bgcolor: isActive ? COLORS.green : COLORS.textMuted }} />
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: isActive ? COLORS.green : COLORS.textMuted }}>
                        {isActive ? 'ACTIVE' : 'INACTIVE'}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Clock size={12} color={COLORS.textMuted} />
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', color: COLORS.textSecondary }}>{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: COLORS.textMuted }}>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box className="action-btns" sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', opacity: 0, transition: 'opacity 0.2s' }}>
                      <Tooltip title="Edit User">
                        <IconButton size="small" onClick={() => openEdit(user)}
                          sx={{ borderRadius: 0, color: COLORS.textMuted, border: `1px solid ${COLORS.borderLight}`, '&:hover': { color: COLORS.accent, borderColor: COLORS.accent } }}>
                          <Edit3 size={14} />
                        </IconButton>
                      </Tooltip>
                      {!isMe && (
                        <Tooltip title={isActive ? 'Deactivate' : 'Reactivate'}>
                          <IconButton size="small" onClick={() => toggleStatus(user.id, isActive)}
                            sx={{ borderRadius: 0, color: isActive ? COLORS.red : COLORS.green, border: `1px solid ${alpha(isActive ? COLORS.red : COLORS.green, 0.3)}`, '&:hover': { bgcolor: alpha(isActive ? COLORS.red : COLORS.green, 0.1) } }}>
                            {isActive ? <UserX size={14} /> : <Shield size={14} />}
                          </IconButton>
                        </Tooltip>
                      )}
                      {!isMe && (
                        <Tooltip title="Delete User">
                          <IconButton size="small" onClick={() => setDeleteConfirm({ open: true, user })}
                            sx={{ borderRadius: 0, color: COLORS.red, border: `1px solid ${alpha(COLORS.red, 0.3)}`, '&:hover': { bgcolor: alpha(COLORS.red, 0.1) } }}>
                            <Trash2 size={14} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.border}`, borderRadius: 0 } }}>
        <DialogTitle sx={{ fontFamily: 'monospace', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 2 }}>
          {editUser ? <><Edit3 size={20} /> EDIT USER</> : <><UserPlus size={20} /> ADD USER</>}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: '16px !important' }}>
          <TextField label="Username" fullWidth value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, bgcolor: '#000', fontFamily: 'monospace', '& fieldset': { borderColor: COLORS.borderLight } } }} />
          {!editUser && (
            <TextField label="Password" type="password" fullWidth value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0, bgcolor: '#000', fontFamily: 'monospace', '& fieldset': { borderColor: COLORS.borderLight } } }} />
          )}
          <Box>
            <Typography variant="caption" sx={{ color: COLORS.textMuted, fontFamily: 'monospace', mb: 1, display: 'block' }}>ROLE</Typography>
            <Select fullWidth value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              sx={{ borderRadius: 0, bgcolor: '#000', fontFamily: 'monospace', '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.borderLight } }}>
              {Object.entries(ROLES).map(([key, r]) => (
                <MenuItem key={key} value={key} sx={{ fontFamily: 'monospace', fontWeight: 700, color: r.color }}>{r.label} — {r.desc}</MenuItem>
              ))}
            </Select>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ color: COLORS.textMuted, fontFamily: 'monospace' }}>CANCEL</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.username}
            sx={{ bgcolor: COLORS.accent, color: '#000', fontWeight: 900, borderRadius: 0, fontFamily: 'monospace', '&:hover': { bgcolor: '#fff' } }}>
            {editUser ? 'UPDATE' : 'CREATE'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm.open} onClose={() => setDeleteConfirm({ open: false, user: null })} maxWidth="xs" fullWidth
        PaperProps={{ sx: { bgcolor: COLORS.bgDeep, border: `1px solid ${COLORS.red}`, borderRadius: 0 } }}>
        <DialogTitle sx={{ fontFamily: 'monospace', fontWeight: 800, color: COLORS.red, display: 'flex', alignItems: 'center', gap: 2 }}>
          <AlertTriangle size={20} /> DELETE USER
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <DialogContentText sx={{ color: '#fff', fontFamily: 'monospace' }}>
            Are you sure you want to permanently delete user <strong style={{ color: COLORS.accent }}>{deleteConfirm.user?.username}</strong>? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setDeleteConfirm({ open: false, user: null })} sx={{ color: COLORS.textMuted, fontFamily: 'monospace' }}>CANCEL</Button>
          <Button variant="contained" onClick={handleDelete}
            sx={{ bgcolor: COLORS.red, color: '#fff', fontWeight: 900, borderRadius: 0, fontFamily: 'monospace', '&:hover': { bgcolor: '#fff', color: COLORS.red } }}>
            DELETE
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
