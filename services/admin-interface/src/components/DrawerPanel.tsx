import { Drawer, Box, Typography, IconButton, Tabs, Tab, Button } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { ReactNode } from 'react';

interface DrawerPanelProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  tabs?: { label: string; content: ReactNode }[];
  activeTab?: number;
  onTabChange?: (tab: number) => void;
  actions?: ReactNode;
}

export function DrawerPanel({
  open,
  title,
  subtitle,
  onClose,
  tabs,
  activeTab = 0,
  onTabChange,
  actions,
}: DrawerPanelProps) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: '40%', minWidth: 400, maxWidth: 600 } }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>
              {title}
            </Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {tabs && tabs.length > 0 && (
          <Tabs
            value={activeTab}
            onChange={(_, v) => onTabChange?.(v)}
            sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
          >
            {tabs.map((t, i) => (
              <Tab key={i} label={t.label} />
            ))}
          </Tabs>
        )}
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
          {tabs ? tabs[activeTab]?.content : null}
        </Box>
        {actions && (
          <Box
            sx={{
              p: 2,
              borderTop: 1,
              borderColor: 'divider',
              display: 'flex',
              gap: 1,
            }}
          >
            {actions}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
