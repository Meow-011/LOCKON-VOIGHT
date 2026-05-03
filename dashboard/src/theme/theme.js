/**
 * LOCKON VOIGHT — Dark Tactical Theme
 * MUI theme configuration for the Proctor Dashboard.
 * Aesthetic: Soft Tech — dark, clean, data-focused with accent colors for alert levels.
 */

import { createTheme, alpha } from '@mui/material/styles';

const COLORS = {
  // Base palette
  bgDeep: '#000000',
  bgCard: '#0d0d0d',
  bgSurface: '#141414',
  bgHover: '#1f1f1f',
  border: '#222222',
  borderLight: '#333333',

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#888888',
  textMuted: '#555555',

  // Brand accent (Tactical Orange)
  accent: '#ea580c',
  accentDark: '#c2410c',

  // Integrity levels
  green: '#22c55e',
  greenBg: 'rgba(34, 197, 94, 0.12)',
  yellow: '#eab308',
  yellowBg: 'rgba(234, 179, 8, 0.12)',
  red: '#ef4444',
  redBg: 'rgba(239, 68, 68, 0.12)',

  // Severity
  critical: '#f43f5e',
  high: '#f97316',
  medium: '#eab308',
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: COLORS.accent,
      dark: COLORS.accentDark,
    },
    secondary: {
      main: '#a78bfa',
    },
    background: {
      default: COLORS.bgDeep,
      paper: COLORS.bgCard,
    },
    text: {
      primary: COLORS.textPrimary,
      secondary: COLORS.textSecondary,
    },
    success: { main: COLORS.green },
    warning: { main: COLORS.yellow },
    error: { main: COLORS.red },
    divider: COLORS.border,
    // Custom colors exposed via theme
    integrity: {
      green: COLORS.green,
      greenBg: COLORS.greenBg,
      yellow: COLORS.yellow,
      yellowBg: COLORS.yellowBg,
      red: COLORS.red,
      redBg: COLORS.redBg,
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { color: COLORS.textSecondary, fontSize: '0.875rem' },
    subtitle2: { color: COLORS.textMuted, fontSize: '0.8rem' },
    body2: { color: COLORS.textSecondary },
    overline: {
      letterSpacing: '0.12em',
      fontWeight: 600,
      fontSize: '0.7rem',
      color: COLORS.textMuted,
    },
  },
  shape: {
    borderRadius: 0,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: COLORS.bgDeep,
          scrollbarWidth: 'thin',
          scrollbarColor: `${COLORS.border} transparent`,
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            background: COLORS.border,
            borderRadius: '3px',
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${COLORS.border}`,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: COLORS.bgCard,
          border: `1px solid ${COLORS.border}`,
          transition: 'border-color 0.2s',
          '&:hover': {
            borderColor: COLORS.borderLight,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 0,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: '6px',
          fontSize: '0.75rem',
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            background: COLORS.bgSurface,
            '& fieldset': { borderColor: COLORS.border },
            '&:hover fieldset': { borderColor: COLORS.borderLight },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: COLORS.border,
          padding: '12px 16px',
        },
        head: {
          fontWeight: 600,
          color: COLORS.textSecondary,
          textTransform: 'uppercase',
          fontSize: '0.7rem',
          letterSpacing: '0.08em',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: COLORS.bgCard,
          borderBottom: `1px solid ${COLORS.border}`,
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: COLORS.bgCard,
          borderRight: `1px solid ${COLORS.border}`,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: COLORS.bgSurface,
          border: `1px solid ${COLORS.border}`,
          fontSize: '0.75rem',
        },
      },
    },
  },
});

export { COLORS };
export default theme;
