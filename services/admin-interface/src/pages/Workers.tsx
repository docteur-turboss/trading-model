import { Box, Typography, Button, LinearProgress, CircularProgress, Grid } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import MemoryIcon from '@mui/icons-material/Memory';
import BoltIcon from '@mui/icons-material/Bolt';
import DnsIcon from '@mui/icons-material/Dns';
import StorageIcon from '@mui/icons-material/Storage';
import { useApi } from '../hooks/useApi';
import { api } from '../api/api-client';
import type { WorkerEntry } from '../types/dtos';
import { StatusBadge } from '../components/StatusBadge';
import { StatsCard } from '../components/StatsCard';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { InfoBox } from '../components/InfoBox';

function LoadBar({ value, color }: { value: number; color?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ flexGrow: 1 }}>
        <LinearProgress
          variant="determinate"
          value={Math.min(value, 100)}
          sx={{
            height: 8,
            borderRadius: 1,
            bgcolor: '#e0e0e0',
            '& .MuiLinearProgress-bar': {
              bgcolor: color ?? (value > 80 ? '#d32f2f' : value > 60 ? '#ed6c02' : '#1976d2'),
            },
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ minWidth: 36 }}>
        {value}%
      </Typography>
    </Box>
  );
}

export function Workers() {
  const { data, loading, refetch } = useApi(() => api.getWorkers());

  const columns: Column<WorkerEntry>[] = [
    { id: 'id', label: 'Worker ID', render: r => r.id },
    {
      id: 'ip',
      label: 'Address',
      render: r => (
        <Box>
          <Typography variant="body2">{r.ip}</Typography>
          <Typography variant="caption" color="text.secondary">
            {r.region}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'cpu',
      label: 'CPU / RAM',
      render: r => (
        <Box>
          <LoadBar value={r.cpu} />
          <LoadBar value={r.ram} />
        </Box>
      ),
    },
    {
      id: 'status',
      label: 'Status',
      render: r => <StatusBadge status={r.status} />,
    },
    { id: 'heartbeat', label: 'Heartbeat', render: r => r.heartbeat },
    { id: 'jobs', label: 'Jobs', render: r => String(r.activeJobs) },
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
            Workers
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Distributed compute node lifecycle management.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refetch}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />}>
            New Node
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={3}>
          <StatsCard
            icon={<MemoryIcon />}
            value={`${data?.stats.activeWorkers ?? 0} / ${data?.stats.totalWorkers ?? 0}`}
            label="WORKERS ACTIFS"
            delta="+2 instances provisioned"
            deltaColor="success.main"
          />
        </Grid>
        <Grid item xs={3}>
          <StatsCard
            icon={<BoltIcon />}
            value={`${data?.stats.avgCpu ?? 0}%`}
            label="CHARGE MOYENNE CPU"
            delta="12% stable over 4h"
          />
        </Grid>
        <Grid item xs={3}>
          <StatsCard
            icon={<DnsIcon />}
            value={`${data?.stats.totalJobsPerMin ?? 0}`}
            label="TOTAL JOBS/MIN"
            delta="Capacity: 2,500/min"
          />
        </Grid>
        <Grid item xs={3}>
          <StatsCard
            icon={<StorageIcon />}
            value={`${data?.stats.clusterMemory ?? 0} GB`}
            label="MÉMOIRE CLUSTER"
            delta="64% pool utilization"
          />
        </Grid>
      </Grid>

      <DataTable
        columns={columns}
        rows={data?.workers ?? []}
        getId={r => r.id}
        total={data?.workers.length ?? 0}
      />

      <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
        <InfoBox
          icon={<RefreshIcon />}
          title="What is 'Drain' mode?"
          description="Draining prepares a node for software update by letting running jobs finish gracefully."
          color="info.main"
        />
        <InfoBox
          icon={<BoltIcon />}
          title="Auto-scaling"
          description="The system added 3 additional nodes 22 minutes ago due to a traffic spike on API Gateway."
          color="info.main"
        />
      </Box>
    </Box>
  );
}
