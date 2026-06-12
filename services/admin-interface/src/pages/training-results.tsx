import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import StopIcon from '@mui/icons-material/Stop';
import TrackChangesIcon from '@mui/icons-material/TrackChanges';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { Box, Typography, Button, CircularProgress, Chip, Grid } from '@mui/material';
import { useState } from 'react';

import { api } from '../api/api-client';
import { DataTable } from '../components/data-table';
import type { Column } from '../components/data-table';
import { DrawerPanel } from '../components/drawer-panel';
import { StatsCard } from '../components/stats-card';
import { useApi } from '../hooks/use-api';
import type { TrainingResult } from '../types/dtos';

export function TrainingResults() {
  const { data, loading, refetch } = useApi(() => api.getTrainingResults());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data?.results.find(r => r.id === selectedId) ?? null;

  const columns: Column<TrainingResult>[] = [
    { id: 'id', label: 'ID', render: r => r.id },
    { id: 'symbol', label: 'Symbol', render: r => r.symbol },
    { id: 'gen', label: 'Gen.', render: r => `#${r.generation}` },
    { id: 'fitness', label: 'Fitness', render: r => r.fitness.toFixed(3) },
    {
      id: 'sharpe',
      label: 'Sharpe',
      render: r => (
        <Chip
          size="small"
          label={r.sharpe.toFixed(2)}
          color={r.sharpe >= 1.5 ? 'success' : r.sharpe >= 1 ? 'warning' : 'error'}
          variant="outlined"
        />
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
            Training Results
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Monitor and analyze genetic algorithm performance.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refetch}>
            Refresh
          </Button>
          <Button variant="contained" color="success" startIcon={<PlayArrowIcon />}>
            Start Training
          </Button>
          <Button variant="contained" color="error" startIcon={<StopIcon />}>
            Stop
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<TrackChangesIcon />}
            value="0.824"
            label="FITNESS MOYEN"
            delta="+4.2% vs yesterday"
            deltaColor="success.main"
          />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={<TrendingUpIcon />}
            value="2.14"
            label="SHARPE MAX"
            delta="Generation #142"
          />
        </Grid>
      </Grid>

      <DataTable
        columns={columns}
        rows={data?.results ?? []}
        getId={r => r.id}
        total={data?.total ?? 0}
        onSelectOne={id => setSelectedId(id)}
        selectedIds={selectedId ? new Set([selectedId]) : new Set()}
        selectable
      />

      <DrawerPanel
        open={!!selectedId}
        title={`Genome Inspection - ${selected?.id ?? ''}`}
        subtitle={`Symbol: ${selected?.symbol ?? ''} | Generation: #${selected?.generation ?? ''}`}
        onClose={() => setSelectedId(null)}
        tabs={
          selected
            ? [
                {
                  label: 'Genome (JSON)',
                  content: selected.genome ? (
                    <Typography
                      variant="body2"
                      component="pre"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        bgcolor: '#1e1e1e',
                        color: '#d4d4d4',
                        p: 2,
                        borderRadius: 1,
                        overflow: 'auto',
                      }}
                    >
                      {JSON.stringify(selected.genome, null, 2)}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No genome data available.
                    </Typography>
                  ),
                },
              ]
            : []
        }
      />
    </Box>
  );
}
