/**
 * IntegrityBadge — Displays a contestant's integrity score with color and animation.
 */

import { Box, Typography, alpha } from '@mui/material';
import { COLORS } from '../theme/theme';

const LEVEL_CONFIG = {
  GREEN: { color: COLORS.green, bg: COLORS.greenBg, label: 'CLEAR', pulse: 'score-green' },
  YELLOW: { color: COLORS.yellow, bg: COLORS.yellowBg, label: 'REVIEW', pulse: 'score-yellow' },
  RED: { color: COLORS.red, bg: COLORS.redBg, label: 'ALERT', pulse: 'score-red' },
};

export default function IntegrityBadge({ score = 0, level = 'GREEN', size = 'medium' }) {
  const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.GREEN;
  const dimensions = size === 'large' ? 72 : size === 'medium' ? 52 : 36;
  const fontSize = size === 'large' ? '1.5rem' : size === 'medium' ? '1.1rem' : '0.8rem';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      <Box
        sx={{
          width: dimensions,
          height: dimensions,
          borderRadius: 0, // Brutalist square, no circles
          background: config.bg,
          border: `2px solid ${config.color}`, // Solid sharp border, no alpha
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography sx={{ fontWeight: 900, fontSize, color: config.color, lineHeight: 1, fontFamily: 'monospace' }}>
          {score}
        </Typography>
      </Box>
      {size !== 'small' && (
        <Typography
          variant="overline"
          sx={{ color: config.color, fontSize: '0.6rem', fontWeight: 700 }}
        >
          {config.label}
        </Typography>
      )}
    </Box>
  );
}
