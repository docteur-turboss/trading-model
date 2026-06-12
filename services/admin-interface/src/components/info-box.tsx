import { Paper, Typography, Box } from '@mui/material';
import type { ReactNode } from 'react';

interface InfoBoxProps {
  icon: ReactNode;
  title: string;
  description: string;
  color?: string;
}

/** Informational card displaying an icon, title, and description. */
export function InfoBox({ icon, title, description, color = 'primary.main' }: InfoBoxProps) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Box sx={{ color, mt: 0.25 }}>{icon}</Box>
      <Box>
        <Typography variant="subtitle2" fontWeight={600} sx={{ color }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </Box>
    </Paper>
  );
}
