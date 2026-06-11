import { Outlet } from 'react-router-dom';
import { Box, Typography } from '@mui/material';

import { Sidebar } from './sidebar';

export function Layout() {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flexGrow: 1, p: 3 }}>
          <Outlet />
        </Box>
        <Box
          component="footer"
          sx={{
            px: 3,
            py: 1.5,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'text.secondary',
          }}
        >
          <Typography variant="caption">
            &copy; 2024 ADMIN DASHBOARD &mdash; SYSTEM VERSION: V2.4.12-STABLE
          </Typography>
          <Typography variant="caption">
            <Box component="span" sx={{ color: 'success.main', mr: 0.5 }}>
              &#9679;
            </Box>
            K8S CLUSTER: ACTIVE &mdash; UPTIME: 99.998%
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
