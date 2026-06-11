import { useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import HistoryIcon from '@mui/icons-material/History';
import StorageIcon from '@mui/icons-material/Storage';
import { useApi } from '../hooks/useApi';
import { api } from '../api/api-client';
import type { CacheEntry } from '../types/dtos';
import { StatsCard } from '../components/StatsCard';
import { StatusBadge } from '../components/StatusBadge';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { ModalConfirm } from '../components/ModalConfirm';

export function Cache() {
  const { data, loading, refetch } = useApi(() => api.getCacheEntries());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const columns: Column<CacheEntry>[] = [
    { id: 'key', label: 'Cache Key', render: r => r.key },
    { id: 'service', label: 'Service', render: r => r.service },
    { id: 'expiration', label: 'Expiration', render: r => r.expiration },
    { id: 'size', label: 'Size', render: r => r.size },
    { id: 'lastAccess', label: 'Last Access', render: r => r.lastAccess },
    {
      id: 'status',
      label: 'Status',
      render: r => (r.status ? <StatusBadge status={r.status} /> : null),
    },
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
            API Gateway Cache
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage and monitor the distributed cache layer.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<HistoryIcon />}>
            Invalidation History
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteSweepIcon />}
            onClick={() => setConfirmOpen(true)}
          >
            Invalidate All
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <StatsCard
            icon={<RefreshIcon />}
            value={`${data?.stats.hitRate ?? 0}%`}
            label="TAUX DE RÉUSSITE"
            delta="Based on last 5 minutes"
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <StatsCard
            icon={<StorageIcon />}
            value={(data?.stats.activeEntries ?? 0).toLocaleString()}
            label="ENTRÉES ACTIVES"
            delta="5% increase today"
            deltaColor="warning.main"
          />
        </Box>
      </Box>

      <DataTable
        columns={columns}
        rows={data?.entries ?? []}
        getId={r => r.key}
        total={data?.entries.length ?? 0}
      />

      <ModalConfirm
        open={confirmOpen}
        title="Critical Action: Global Invalidation"
        description="You are about to purge the entire API Gateway cache. This action may cause immediate backend overload during the cache warm-up phase."
        confirmLabel="Confirm Global Purge"
        confirmColor="error"
        impactItems={[
          `${data?.stats.activeEntries?.toLocaleString() ?? 'N/A'} entries will be permanently deleted.`,
          'Expected 300% p99 latency increase for approximately 2 minutes.',
          'All cache instances (12 clusters) will be affected.',
        ]}
        onConfirm={() => {
          api.invalidateCache().then(() => {
            setConfirmOpen(false);
            refetch();
          });
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </Box>
  );
}
