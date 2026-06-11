import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Chip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SyncIcon from '@mui/icons-material/Sync';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { useJobs, useJobDetail } from '../hooks/useJobs';
import type { JobEntry } from '../types/dtos';
import { StatusBadge } from '../components/StatusBadge';
import { StatsCard } from '../components/StatsCard';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { DrawerPanel } from '../components/DrawerPanel';

export function Jobs() {
  const { data, loading, refetch } = useJobs();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const { data: jobDetail } = useJobDetail(selectedJobId);

  const columns: Column<JobEntry>[] = [
    { id: 'id', label: 'Job ID', render: r => r.id },
    { id: 'type', label: 'Type', render: r => r.type },
    {
      id: 'priority',
      label: 'Priority',
      render: r => (
        <Chip
          size="small"
          label={r.priority}
          color={
            r.priority === 'CRITICAL' ? 'error' : r.priority === 'HIGH' ? 'warning' : 'default'
          }
          variant="outlined"
        />
      ),
    },
    {
      id: 'status',
      label: 'Status',
      render: r => <StatusBadge status={r.status} />,
    },
    { id: 'worker', label: 'Worker', render: r => r.worker ?? 'Unassigned' },
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
            Job Management
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Real-time monitoring of the distributed job queue.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refetch}>
          Refresh
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <StatsCard
            icon={<ScheduleIcon />}
            value={String(data?.stats.pending ?? 0)}
            label="PENDING"
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <StatsCard
            icon={<SyncIcon />}
            value={String(data?.stats.inProgress ?? 0)}
            label="IN PROGRESS"
          />
        </Box>
        <Box sx={{ flex: 1 }}>
          <StatsCard
            icon={<ErrorOutlineIcon />}
            value={String(data?.stats.failed ?? 0)}
            label="FAILED (1H)"
            deltaColor="error.main"
          />
        </Box>
      </Box>

      <DataTable
        columns={columns}
        rows={data?.jobs ?? []}
        getId={r => r.id}
        onSelectOne={id => setSelectedJobId(id)}
        selectedIds={selectedJobId ? new Set([selectedJobId]) : new Set()}
        selectable
      />

      <DrawerPanel
        open={!!selectedJobId}
        title={`Job Details - ${selectedJobId ?? ''}`}
        subtitle={`ID: ${selectedJobId ?? ''}`}
        onClose={() => setSelectedJobId(null)}
        tabs={
          jobDetail
            ? [
                {
                  label: 'Timeline',
                  content: (
                    <Box>
                      {jobDetail.timeline.map((entry, i) => (
                        <Box key={i} sx={{ display: 'flex', gap: 2, pb: i < jobDetail.timeline.length - 1 ? 2 : 0 }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Box
                              sx={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                bgcolor: entry.active ? 'primary.main' : 'grey.400',
                                flexShrink: 0,
                              }}
                            />
                            {i < jobDetail.timeline.length - 1 && (
                              <Box sx={{ width: 2, flexGrow: 1, bgcolor: 'divider', minHeight: 20 }} />
                            )}
                          </Box>
                          <Box>
                            <Typography variant="subtitle2">{entry.event}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {entry.timestamp}
                            </Typography>
                            <Typography variant="body2">{entry.description}</Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  ),
                },
                {
                  label: 'Payload',
                  content: (
                    <Typography
                      variant="body2"
                      component="pre"
                      sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                    >
                      {JSON.stringify(jobDetail.payload, null, 2)}
                    </Typography>
                  ),
                },
                {
                  label: 'Logs',
                  content: jobDetail.logs.map((log, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      display="block"
                      sx={{ fontFamily: 'monospace' }}
                    >
                      {log}
                    </Typography>
                  )),
                },
              ]
            : []
        }
        actions={
          <>
            <Button variant="contained" color="primary">
              Restart Job
            </Button>
            <Button variant="contained" color="error">
              Cancel Job
            </Button>
          </>
        }
      />
    </Box>
  );
}
