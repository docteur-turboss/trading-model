import DescriptionIcon from '@mui/icons-material/Description';
import LanguageIcon from '@mui/icons-material/Language';
import LogoutIcon from '@mui/icons-material/Logout';
import MemoryIcon from '@mui/icons-material/Memory';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SettingsIcon from '@mui/icons-material/Settings';
import ShieldIcon from '@mui/icons-material/Shield';
import StorageIcon from '@mui/icons-material/Storage';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningIcon from '@mui/icons-material/Warning';
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Badge,
  TextField,
  Avatar,
  Chip,
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Services', path: '/services', icon: <MonitorHeartIcon /> },
  { label: 'Certificates', path: '/certificates', icon: <ShieldIcon /> },
  { label: 'Audit Events', path: '/audit/events', icon: <DescriptionIcon /> },
  { label: 'Jobs', path: '/jobs', icon: <ScheduleIcon />, badge: 3 },
  { label: 'Broker DLQ', path: '/broker/dlq', icon: <WarningIcon />, badge: 12 },
  { label: 'Training', path: '/training/results', icon: <TrendingUpIcon /> },
  { label: 'API Cache', path: '/cache', icon: <StorageIcon /> },
  { label: 'Workers', path: '/workers', icon: <MemoryIcon /> },
  { label: 'Market Data', path: '/market-data', icon: <LanguageIcon /> },
  { label: 'Config', path: '/config', icon: <SettingsIcon /> },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Box
      sx={{
        width: 240,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <MonitorHeartIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Admin Dashboard
          </Typography>
        </Box>
        <Chip
          label="PRODUCTION"
          size="small"
          color="success"
          variant="outlined"
          sx={{ fontWeight: 600, fontSize: '0.65rem' }}
        />
      </Box>

      <Box sx={{ px: 2, py: 1 }}>
        <TextField
          size="small"
          placeholder="Search resources..."
          fullWidth
          slotProps={{ input: { sx: { fontSize: '0.8rem' } } }}
        />
      </Box>

      <Box sx={{ px: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Badge badgeContent={3} color="error">
          <NotificationsNoneIcon color="action" />
        </Badge>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
          <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: '0.8rem' }}>
            AU
          </Avatar>
          <Box>
            <Typography variant="caption" fontWeight={600} display="block">
              Admin User
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Super Admin
            </Typography>
          </Box>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
        </Box>
      </Box>

      <List sx={{ flexGrow: 1, px: 1 }} dense>
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path;
          return (
            <ListItemButton
              key={item.path}
              selected={active}
              onClick={() => navigate(item.path)}
              sx={{ borderRadius: 1, mb: 0.25 }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: active ? 'primary.main' : undefined }}>
                {item.badge ? (
                  <Badge badgeContent={item.badge} color="error">
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  variant: 'body2',
                  fontWeight: active ? 600 : 400,
                }}
              />
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <ListItemButton sx={{ borderRadius: 1, color: 'error.main' }}>
          <ListItemIcon sx={{ minWidth: 36, color: 'error.main' }}>
            <LogoutIcon />
          </ListItemIcon>
          <ListItemText
            primary="Logout"
            primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
          />
        </ListItemButton>
      </Box>
    </Box>
  );
}
