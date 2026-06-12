import { Box, TextField, Button, Link } from '@mui/material';
import type { ReactNode } from 'react';

interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: ReactNode;
  onApply?: () => void;
  onReset?: () => void;
}

/** Search bar with optional filter controls and apply/reset actions. */
export function FilterBar({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  filters,
  onApply,
  onReset,
}: FilterBarProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        py: 1.5,
        flexWrap: 'wrap',
      }}
    >
      <TextField
        size="small"
        placeholder={searchPlaceholder}
        value={searchValue ?? ''}
        onChange={e => onSearchChange?.(e.target.value)}
        sx={{ minWidth: 240 }}
      />
      {filters}
      {onApply && (
        <Button variant="contained" size="small" onClick={onApply}>
          Apply
        </Button>
      )}
      {onReset && (
        <Link component="button" variant="body2" onClick={onReset} sx={{ cursor: 'pointer' }}>
          Reset
        </Link>
      )}
    </Box>
  );
}
