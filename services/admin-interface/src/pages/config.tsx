import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockIcon from '@mui/icons-material/Lock';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import {
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
} from '@mui/material';

import { api } from '../api/api-client';
import { DataTable } from '../components/data-table';
import type { Column } from '../components/data-table';
import { InfoBox } from '../components/info-box';
import { useApi } from '../hooks/use-api';
import type { ConfigEntry } from '../types/dtos';

const SOURCE_COLORS: Record<string, 'secondary' | 'default' | 'info' | 'warning'> = {
  Vault: 'secondary',
  ConfigMap: 'default',
  EnvVar: 'info',
  Local: 'warning',
};

export function Config() {
  const { data, loading, refetch } = useApi(() => api.getConfig());

  const columns: Column<ConfigEntry>[] = [
    {
      id: 'key',
      label: 'Config Key',
      render: r => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {r.masked && <LockIcon fontSize="small" color="action" sx={{ fontSize: 14 }} />}
          {r.key}
        </Box>
      ),
    },
    {
      id: 'value',
      label: 'Value',
      render: r =>
        r.masked ? (
          <Typography variant="body2" color="text.disabled">
            {'•'.repeat(20)}
          </Typography>
        ) : (
          r.value
        ),
    },
    {
      id: 'source',
      label: 'Source',
      render: r => (
        <Chip
          size="small"
          label={r.source}
          color={SOURCE_COLORS[r.source] ?? 'default'}
          variant="outlined"
        />
      ),
    },
    { id: 'service', label: 'Service', render: r => r.service },
    { id: 'updated', label: 'Updated', render: r => r.updatedAt },
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Configuration Variables
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage secrets and environment variables for your microservices.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refetch}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />}>
            New Variable
          </Button>
        </Box>
      </Box>

      <DataTable
        columns={columns}
        rows={data ?? []}
        getId={r => `${r.service}-${r.key}`}
        total={data?.length ?? 0}
      />

      <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
        <InfoBox
          icon={<LockIcon />}
          title="Secret Security"
          description="Vault-sourced secrets are injected at startup and never stored in plaintext on the pod filesystem."
          color="info.main"
        />
        <InfoBox
          icon={<CheckCircleIcon color="success" />}
          title="ConfigMap Propagation"
          description="ConfigMap changes may take up to 60 seconds to propagate to all active instances."
          color="success.main"
        />
        <InfoBox
          icon={<SyncIcon />}
          title="Audit Log"
          description="All secret reveal actions are logged in the audit registry with user ID and timestamp."
        />
      </Box>
    </Box>
  );
}
