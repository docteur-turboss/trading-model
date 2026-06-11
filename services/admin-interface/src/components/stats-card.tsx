import { Card, CardContent, Typography, Box } from '@mui/material';
import type { ReactNode } from 'react';

interface StatsCardProps {
  icon: ReactNode;
  value: string;
  label: string;
  delta?: string;
  deltaColor?: string;
}

export function StatsCard({ icon, value, label, delta, deltaColor }: StatsCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, p: 2 }}>
        <Box sx={{ color: 'primary.main', mt: 0.5 }}>{icon}</Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {value}
          </Typography>
          <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {label}
          </Typography>
          {delta && (
            <Typography
              variant="caption"
              sx={{ color: deltaColor ?? 'text.secondary', display: 'block', mt: 0.5 }}
            >
              {delta}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
