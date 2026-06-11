import { useState } from 'react';
import { Box, Typography, Button, TextField, MenuItem, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuditEvents } from '../hooks/use-audit-events';
import type { AuditFilter, AuditEvent } from '../types/dtos';
import { StatsCard } from '../components/stats-card';
import { SeverityBadge } from '../components/severity-badge';
import { DataTable } from '../components/data-table';
import type { Column } from '../components/data-table';

export function AuditEvents() {
  const [filter, setFilter] = useState<AuditFilter>({});
  const { data, loading, refetch } = useAuditEvents(filter);

  const columns: Column<AuditEvent>[] = [
    { id: 'timestamp', label: 'Timestamp', render: r => r.timestamp },
    { id: 'topic', label: 'Topic', render: r => r.topic },
    { id: 'publisher', label: 'Publisher', render: r => r.publisher },
    { id: 'cid', label: 'Correlation ID', render: r => r.correlationId },
    { id: 'summary', label: 'Summary', render: r => r.summary },
    {
      id: 'severity',
      label: 'Severity',
      render: r => <SeverityBadge severity={r.severity} />,
    },
  ];

  const chartData = data?.volumeByTopic ?? [];

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
            Audit Events
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Distributed observability and real-time log streams.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refetch}>
          Refresh
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <StatsCard
            icon={<MonitorHeartIcon />}
            value={(data?.total ?? 0).toLocaleString()}
            label="TOTAL ÉVÉNEMENTS (24H)"
            delta="+12.4% vs yesterday"
            deltaColor="success.main"
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <StatsCard
            icon={<WarningAmberIcon />}
            value="0.04%"
            label="TAUX D'ERREURS"
            delta="Stabilité : Optimale"
            deltaColor="success.main"
          />
        </Box>
      </Box>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Volume by Topic
      </Typography>
      <Box sx={{ height: 200, mb: 3 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="topic" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#1976d2" />
          </BarChart>
        </ResponsiveContainer>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search by Correlation ID, Payload or Message..."
          value={filter.correlationId ?? ''}
          onChange={e => setFilter(f => ({ ...f, correlationId: e.target.value }))}
          sx={{ minWidth: 300 }}
        />
        <TextField
          size="small"
          select
          value={filter.topic ?? ''}
          onChange={e => setFilter(f => ({ ...f, topic: e.target.value || undefined }))}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All Topics</MenuItem>
          <MenuItem value="AUTH">AUTH</MenuItem>
          <MenuItem value="ORDER">ORDER</MenuItem>
          <MenuItem value="PAYMENT">PAYMENT</MenuItem>
          <MenuItem value="INVENTORY">INVENTORY</MenuItem>
          <MenuItem value="NOTIF">NOTIF</MenuItem>
        </TextField>
        <Button variant="contained" size="small" onClick={() => refetch()}>
          Apply
        </Button>
      </Box>

      <DataTable
        columns={columns}
        rows={data?.events ?? []}
        getId={r => `${r.timestamp}-${r.correlationId}`}
        total={data?.total ?? 0}
      />
    </Box>
  );
}
