/**
 * Setup Page — Initial Admin Account Creation
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, TextField, Button, Typography, Alert,
  CircularProgress, alpha, InputAdornment, IconButton,
} from '@mui/material';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { authAPI } from '../services/api';
import { COLORS } from '../theme/theme';

export default function SetupPage() {
  const [username, setUsername] = useState('admin');
  const [displayName, setDisplayName] = useState('Administrator');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.setup(username, password, displayName);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.detail || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      bgcolor: COLORS.bgDeep,
    }}>
      <Card sx={{
        width: 440, p: 5,
        bgcolor: COLORS.bgCard,
        borderRadius: 0,
        border: `1px solid ${COLORS.border}`,
      }}
      className="fade-in"
      >
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: 0, mx: 'auto', mb: 2,
            bgcolor: COLORS.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ShieldAlert size={32} color="#000" />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            INITIAL SETUP
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem' }}>
            Create the primary administrator account
          </Typography>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          {error && (
            <Alert severity="error" sx={{ mb: 2, bgcolor: 'transparent', border: `1px solid ${COLORS.red}`, color: COLORS.red, borderRadius: 0 }}>
              {error}
            </Alert>
          )}

          <TextField
            id="setup-username"
            fullWidth
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            sx={{ mb: 2 }}
            required
          />

          <TextField
            id="setup-display"
            fullWidth
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            sx={{ mb: 2 }}
            required
          />

          <TextField
            id="setup-password"
            fullWidth
            label="Strong Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mb: 3 }}
            required
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPassword(!showPassword)} sx={{ color: COLORS.textMuted }}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </IconButton>
                  </InputAdornment>
                ),
              }
            }}
          />

          <Button
            id="setup-submit"
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={loading || !username || !password}
            sx={{
              py: 1.5,
              bgcolor: COLORS.accent,
              color: '#000',
              fontWeight: 800,
              borderRadius: 0,
              '&:hover': {
                bgcolor: COLORS.accentDark,
              },
            }}
          >
            {loading ? <CircularProgress size={22} color="inherit" /> : 'INITIALIZE SYSTEM'}
          </Button>
        </Box>
      </Card>
    </Box>
  );
}
