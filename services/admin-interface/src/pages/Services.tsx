import { useState } from 'react';
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
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import DnsIcon from '@mui/icons-material/Dns';
import ActivityIcon from '@mui/icons-material/Timeline';
import ShieldIcon from '@mui/icons-material/Shield';
import BoltIcon from '@mui/icons-material/Bolt';
import { useServices } from '../hooks/useServices';
import { StatusBadge } from '../components/StatusBadge';
import { StatsCard } from '../components/StatsCard';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

export function Services() {
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
    { id: 'name', label: 'Service Name', render: r => r.serviceName },
    { id: 'instances', label: 'Instances', render: r => String(r.instances) },
    { id: 'ip', label: 'IP:Port', render: r => r.ipPort },
    { id: 'version', label: 'Version', render: r => r.version },
    { id: 'heartbeat', label: 'Heartbeat', render: r => r.heartbeat },
    {
      id: 'status',
      label: 'Status',
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
            Services Registry
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage and monitor real-time microservice health and instance lifecycle.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refetch}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />}>
            New Service
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<DnsIcon />}
            value={`${data?.services.length ?? 0} / ${data?.services.length ?? 0}`}
            label="SERVICES ACTIFS"
            delta="+2.5% vs last hour"
            deltaColor="success.main"
          />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<ActivityIcon />}
            value={`${flatServices.reduce((a, s) => a + s.instances, 0)}`}
            label="INSTANCES TOTALES"
            delta="+12 vs last hour"
            deltaColor="success.main"
          />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<ShieldIcon />}
            value="0.04%"
            label="ERREURS (5XX)"
            delta="-0.01% vs last hour"
            deltaColor="success.main"
          />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<BoltIcon />}
            value="42ms"
            label="LATENCE MOY."
            delta="-4ms vs last hour"
            deltaColor="success.main"
          />
        </Grid>
      </Grid>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Network Topology
      </Typography>
      <Card variant="outlined" sx={{ mb: 3, p: 2, minHeight: 100 }}>
        <Typography variant="body2" color="text.secondary">
          Topology diagram visualization (nodes and connections)
        </Typography>
      </Card>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder="Filter by service name..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          sx={{ minWidth: 240 }}
        />
        <TextField size="small" select defaultValue="" sx={{ minWidth: 140 }}>
          <MenuItem value="">All Statuses</MenuItem>
          <MenuItem value="healthy">Healthy</MenuItem>
          <MenuItem value="degraded">Degraded</MenuItem>
          <MenuItem value="down">Down</MenuItem>
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
