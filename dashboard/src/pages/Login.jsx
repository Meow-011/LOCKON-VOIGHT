/**
 * Login Page — Proctor authentication with Dark Tactical aesthetic.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Alert,
  CircularProgress, alpha, InputAdornment, IconButton,
} from '@mui/material';
import { Eye, EyeOff, Shield, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authAPI } from '../services/api';
import { COLORS } from '../theme/theme';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const checkSetup = async () => {
      try {
        const res = await authAPI.needsSetup();
        if (!cancelled && res.data.needs_setup) {
          navigate('/setup');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error checking setup status', err);
        }
      }
    };
    checkSetup();
    return () => { cancelled = true; };
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const fieldSx = {
    mb: 3,
    '& .MuiOutlinedInput-root': {
      borderRadius: 0, bgcolor: alpha('#000', 0.6),
      backdropFilter: 'blur(4px)',
      '& fieldset': { borderColor: alpha('#fff', 0.25) },
      '&:hover fieldset': { borderColor: alpha('#fff', 0.4) },
      '&.Mui-focused fieldset': { borderColor: COLORS.accent },
    },
    '& .MuiInputLabel-root': { color: alpha('#fff', 0.5), fontSize: '1rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: COLORS.accent },
  };

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Background Video */}
      <video
        autoPlay muted loop playsInline
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          objectFit: 'cover', zIndex: 0,
        }}
      >
        <source src="/Background/background.mp4" type="video/mp4" />
      </video>

      {/* Dark Overlay */}
      <Box sx={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: `
          radial-gradient(ellipse at 50% 30%, ${alpha('#000', 0.5)} 0%, ${alpha('#000', 0.85)} 70%),
          rgba(0,0,0,0.6)
        `,
      }} />

      <Box className="fade-in" sx={{ width: '100%', maxWidth: 520, px: 3, textAlign: 'center', position: 'relative', zIndex: 2 }}>

        {/* Logo — larger */}
        <Box sx={{ mb: 0.5 }}>
          <img
            src="/Logo.svg"
            alt="LOCKON VOIGHT"
            style={{ height: 210, objectFit: 'contain' }}
          />
        </Box>

        {/* Subtitle — bigger text */}
        <Typography sx={{
          color: COLORS.accent, fontFamily: 'monospace', fontSize: '1rem',
          letterSpacing: '0.35em', fontWeight: 600, mb: 2,
        }}>
          WELCOME BACK
        </Typography>
        <Typography sx={{ fontWeight: 800, color: COLORS.textPrimary, fontSize: '2.5rem', mb: 0.5 }}>
          Sign in to <span style={{ color: COLORS.accent }}>LOCKON.</span>
        </Typography>
        <Typography sx={{ color: alpha('#fff', 0.5), fontSize: '1.05rem', mb: 6 }}>
          Time to see who's been naughty on the contest
        </Typography>

        {/* Form */}
        <Box component="form" onSubmit={handleSubmit} sx={{ textAlign: 'left' }}>
          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 3, borderRadius: 0, fontSize: '0.9rem',
                bgcolor: alpha(COLORS.red, 0.08),
                border: `1px solid ${alpha(COLORS.red, 0.3)}`,
                color: COLORS.red,
                '& .MuiAlert-icon': { color: COLORS.red },
              }}
            >
              {error}
            </Alert>
          )}

          <TextField
            id="login-username"
            fullWidth label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('login-password').focus();
              }
            }}
            autoFocus required
            sx={fieldSx}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Shield size={20} color={COLORS.textMuted} />
                  </InputAdornment>
                ),
              }
            }}
          />

          <TextField
            id="login-password"
            fullWidth label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            sx={{ ...fieldSx, mb: 4 }}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowPassword(!showPassword)}
                      sx={{ color: COLORS.textMuted, '&:hover': { color: COLORS.accent } }}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </IconButton>
                  </InputAdornment>
                ),
              }
            }}
          />

          <Button
            id="login-submit"
            type="submit"
            fullWidth variant="contained" size="large"
            disabled={loading || !username || !password}
            endIcon={!loading && <ArrowRight size={20} />}
            sx={{
              py: 2, borderRadius: 0, fontWeight: 800, fontSize: '1rem',
              letterSpacing: '0.1em', fontFamily: 'monospace',
              backgroundColor: `${COLORS.accent} !important`,
              color: '#fff !important',
              opacity: 1,
              boxShadow: `0 4px 14px 0 rgba(234, 88, 12, 0.39)`,
              '&:hover': {
                backgroundColor: `${COLORS.accentDark} !important`,
                boxShadow: `0 6px 20px rgba(234, 88, 12, 0.5)`
              },
              '&.Mui-disabled': {
                backgroundColor: `${COLORS.accent} !important`,
                color: `rgba(255, 255, 255, 0.7) !important`,
                opacity: 0.8,
                boxShadow: `0 4px 14px 0 rgba(234, 88, 12, 0.2)`
              },
              transition: 'all 0.2s',
            }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'AUTHENTICATE'}
          </Button>
        </Box>

        {/* Footer */}
        <Box sx={{ mt: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Lock size={14} color={alpha('#fff', 0.45)} />
            <Typography sx={{ color: alpha('#fff', 0.45), fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              Encrypted connection • Secure authentication
            </Typography>
          </Box>
          <Typography sx={{ color: alpha('#fff', 0.25), fontSize: '0.7rem', letterSpacing: '0.05em' }}>
            © 2026 LOCKON Security — Authorized personnel only
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
