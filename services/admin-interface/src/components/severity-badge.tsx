import { Chip } from '@mui/material';

const SEVERITY_STYLES: Record<string, { color: string; bg: string }> = {
  INFO: { color: '#1565c0', bg: '#e3f2fd' },
  WARNING: { color: '#e65100', bg: '#fff3e0' },
  ERROR: { color: '#c62828', bg: '#ffebee' },
  CRITICAL: { color: '#b71c1c', bg: '#fce4ec' },
};

interface SeverityBadgeProps {
  severity: string;
}

/** Colored chip indicating a severity level (INFO, WARNING, ERROR, CRITICAL). */
export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const style = SEVERITY_STYLES[severity.toUpperCase()] ?? {
    color: '#757575',
    bg: '#f5f5f5',
  };
  return (
    <Chip
      size="small"
      label={severity}
      sx={{
        fontWeight: 600,
        fontSize: '0.7rem',
        color: style.color,
        backgroundColor: style.bg,
      }}
    />
  );
}
