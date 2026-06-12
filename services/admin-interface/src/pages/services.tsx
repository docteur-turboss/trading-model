import AddIcon from '@mui/icons-material/Add';
import BoltIcon from '@mui/icons-material/Bolt';
import DnsIcon from '@mui/icons-material/Dns';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShieldIcon from '@mui/icons-material/Shield';
import ActivityIcon from '@mui/icons-material/Timeline';
import {
  Box,
  Typography,
  Button,
  Card,
  Grid,
  TextField,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '../components/data-table';
import type { Column } from '../components/data-table';
import { StatsCard } from '../components/stats-card';
import { StatusBadge } from '../components/status-badge';
import { useServices } from '../hooks/use-services';

export function Services() {
  const { t } = useTranslation('services');
  const { data, loading, refetch } = useServices();
  const [filter, setFilter] = useState('');

  const columns: Column<{
    serviceName: string;
    instances: number;
    ipPort: string;
    version: string;
    heartbeat: string;
    status: string;
  }>[] = [
    { id: 'name', label: t('serviceName'), render: r => r.serviceName },
    { id: 'instances', label: t('instances'), render: r => String(r.instances) },
    { id: 'ip', label: t('ipPort'), render: r => r.ipPort },
    { id: 'version', label: t('version'), render: r => r.version },
    { id: 'heartbeat', label: t('heartbeat'), render: r => r.heartbeat },
    {
      id: 'status',
      label: t('status'),
      render: r => <StatusBadge status={r.status} />,
    },
  ];

  const flatServices =
    data?.services.map(s => {
      const primary = s.instances[0];
      return {
        serviceName: s.serviceName,
        instances: s.instances.length,
        ipPort: primary ? `${primary.host}:${primary.port}` : '-',
        version: primary?.version ?? '-',
        heartbeat: primary?.heartbeat ?? '-',
        status: primary?.status ?? 'down',
      };
    }) ?? [];

  const filtered = filter
    ? flatServices.filter(s => s.serviceName.toLowerCase().includes(filter.toLowerCase()))
    : flatServices;

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
            {t('title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('subtitle')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refetch}>
            {t('refresh')}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />}>
            {t('newService')}
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<DnsIcon />}
            value={`${data?.services.length ?? 0} / ${data?.services.length ?? 0}`}
            label={t('activeServices')}
            delta="+2.5% vs last hour"
            deltaColor="success.main"
          />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<ActivityIcon />}
            value={`${flatServices.reduce((a, s) => a + s.instances, 0)}`}
            label={t('totalInstances')}
            delta="+12 vs last hour"
            deltaColor="success.main"
          />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<ShieldIcon />}
            value="0.04%"
            label={t('errors5xx')}
            delta="-0.01% vs last hour"
            deltaColor="success.main"
          />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<BoltIcon />}
            value="42ms"
            label={t('avgLatency')}
            delta="-4ms vs last hour"
            deltaColor="success.main"
          />
        </Grid>
      </Grid>

      <Typography variant="h6" sx={{ mb: 1 }}>
        {t('networkTopology')}
      </Typography>
      <Card variant="outlined" sx={{ mb: 3, p: 2, minHeight: 100 }}>
        <Typography variant="body2" color="text.secondary">
          {t('topologyPlaceholder')}
        </Typography>
      </Card>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder={t('filterPlaceholder')}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          sx={{ minWidth: 240 }}
        />
        <TextField size="small" select defaultValue="" sx={{ minWidth: 140 }}>
          <MenuItem value="">{t('allStatuses')}</MenuItem>
          <MenuItem value="healthy">{t('healthy')}</MenuItem>
          <MenuItem value="degraded">{t('degraded')}</MenuItem>
          <MenuItem value="down">{t('down')}</MenuItem>
        </TextField>
      </Box>

      <DataTable
        columns={columns}
        rows={filtered}
        getId={r => r.serviceName}
        total={filtered.length}
      />
    </Box>
  );
}
