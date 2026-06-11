import { useState } from 'react';
import { Box, Typography, Button, CircularProgress, Grid } from '@mui/material';
import GetAppIcon from '@mui/icons-material/GetApp';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RefreshIcon from '@mui/icons-material/Refresh';
import StorageIcon from '@mui/icons-material/Storage';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { useApi } from '../hooks/use-api';
import { api } from '../api/api-client';
import type { DlqMessage } from '../types/dtos';
import { StatsCard } from '../components/stats-card';
import { StatusBadge } from '../components/status-badge';
import { DataTable } from '../components/data-table';
import type { Column } from '../components/data-table';
import { InfoBox } from '../components/info-box';

export function Dlq() {
  const { data, loading } = useApi(() => api.getDlqMessages());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const columns: Column<DlqMessage>[] = [
    { id: 'timestamp', label: 'Timestamp', render: r => r.timestamp },
    { id: 'topic', label: 'Topic', render: r => r.topic },
    { id: 'msgId', label: 'Message ID', render: r => r.messageId },
    {
      id: 'reason',
      label: 'Failure Reason',
      render: r => (
        <Typography variant="body2" color="error.main">
          {r.failureReason}
        </Typography>
      ),
    },
    {
      id: 'attempts',
      label: 'Attempts',
      render: r => (
        <StatusBadge status={r.attempts >= 5 ? 'error' : 'info'} label={String(r.attempts)} />
      ),
    },
    {
      id: 'payload',
      label: 'Payload',
      render: r => (
        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
          {r.payloadPreview}
        </Typography>
      ),
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
            Broker DLQ
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Failed message management on the Message Broker.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<GetAppIcon />}>
            Export CSV
          </Button>
          <Button variant="contained" color="error" startIcon={<DeleteSweepIcon />}>
            Purge DLQ
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<WarningAmberIcon />}
            value={String(data?.stats.pending ?? 0)}
            label="MESSAGES EN ATTENTE"
          />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<RefreshIcon />}
            value={`${data?.stats.retryRate ?? 0}%`}
            label="TAUX DE RETRY"
          />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<StorageIcon />}
            value={`${data?.stats.totalSize ?? 0} MB`}
            label="TAILLE TOTALE"
          />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<AccessTimeIcon />}
            value={data?.stats.lastIncident ?? '-'}
            label="DERNIER INCIDENT"
          />
        </Grid>
      </Grid>

      <DataTable
        columns={columns}
        rows={data?.messages ?? []}
        getId={r => r.messageId}
        total={data?.messages.length ?? 0}
        selectable
        selectedIds={selectedIds}
        onSelectAll={checked => {
          if (checked) {
            setSelectedIds(new Set((data?.messages ?? []).map(r => r.messageId)));
          } else {
            setSelectedIds(new Set());
          }
        }}
        onSelectOne={id => {
          const next = new Set(selectedIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setSelectedIds(next);
        }}
      />

      <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
        <InfoBox
          icon={<RefreshIcon />}
          title="Retry Policy"
          description="The system attempts 5 retries with exponential backoff. After the 5th failure, the message is redirected to this DLQ for manual intervention."
          color="success.main"
        />
        <InfoBox
          icon={<DeleteSweepIcon />}
          title="Fatal Errors"
          description="'Invalid JSON Schema' errors are never replayed automatically as they indicate a structural problem in the emitter."
          color="error.main"
        />
        <InfoBox
          icon={<StorageIcon />}
          title="Retention"
          description="DLQ messages are kept for 14 days before being automatically archived to cold storage (S3 Glacier)."
        />
      </Box>
    </Box>
  );
}
