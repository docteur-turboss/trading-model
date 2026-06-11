import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Tabs,
  Tab,
  Chip,
  CircularProgress,
  Grid,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import InfoIcon from '@mui/icons-material/Info';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import StorageIcon from '@mui/icons-material/Storage';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useApi } from '../hooks/use-api';
import { api } from '../api/api-client';
import type { Candle } from '../types/dtos';
import { StatsCard } from '../components/stats-card';
import { DataTable } from '../components/data-table';
import type { Column } from '../components/data-table';

export function MarketData() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [tab, setTab] = useState(0);
  const { data: candles, loading } = useApi(
    () => api.getCandles(symbol, interval),
    [symbol, interval]
  );

  const chartData = candles?.map(c => ({
    time: c.timestamp,
    price: c.close,
  }));

  const lastPrice = candles?.[candles.length - 1]?.close;
  const prevPrice = candles?.[0]?.close;
  const change = lastPrice && prevPrice ? ((lastPrice - prevPrice) / prevPrice) * 100 : 0;

  const candleColumns: Column<Candle>[] = [
    { id: 'time', label: 'Timestamp', render: r => r.timestamp },
    { id: 'open', label: 'Open', render: r => `$${r.open.toLocaleString()}` },
    { id: 'high', label: 'High', render: r => `$${r.high.toLocaleString()}` },
    { id: 'low', label: 'Low', render: r => `$${r.low.toLocaleString()}` },
    { id: 'close', label: 'Close', render: r => `$${r.close.toLocaleString()}` },
    { id: 'volume', label: 'Volume', render: r => r.volume.toFixed(3) },
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h4" fontWeight={700}>
              Market Data
            </Typography>
            <Chip label="LIVE" size="small" color="success" />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Real-time financial data streams and multi-source aggregation.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            size="small"
            select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="BTCUSDT">BTC / USD</MenuItem>
            <MenuItem value="ETHUSDT">ETH / USD</MenuItem>
            <MenuItem value="SOLUSDT">SOL / USD</MenuItem>
          </TextField>
          <TextField
            size="small"
            select
            value={interval}
            onChange={e => setInterval(e.target.value)}
            sx={{ minWidth: 100 }}
          >
            <MenuItem value="1m">1 Minute</MenuItem>
            <MenuItem value="5m">5 Minutes</MenuItem>
            <MenuItem value="15m">15 Minutes</MenuItem>
            <MenuItem value="1h">1 Hour</MenuItem>
            <MenuItem value="4h">4 Hours</MenuItem>
            <MenuItem value="1d">1 Day</MenuItem>
          </TextField>
          <TextField size="small" select defaultValue="aggregated" sx={{ minWidth: 140 }}>
            <MenuItem value="aggregated">Aggregated</MenuItem>
          </TextField>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 3 }}>
          <StatsCard
            icon={
              change >= 0 ? <TrendingUpIcon color="success" /> : <TrendingDownIcon color="error" />
            }
            value={lastPrice ? `$${lastPrice.toLocaleString()}` : '-'}
            label="DERNIER PRIX"
            delta={`${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
            deltaColor={change >= 0 ? 'success.main' : 'error.main'}
          />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard icon={<InfoIcon />} value={'-'} label="HAUT 24H" />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard icon={<WarningAmberIcon color="error" />} value={'-'} label="BAS 24H" />
        </Grid>
        <Grid size={{ xs: 3 }}>
          <StatsCard icon={<StorageIcon />} value={'-'} label="VOLUME 24H" />
        </Grid>
      </Grid>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Candles" />
        <Tab label="Transactions" />
        <Tab label="Order Book" />
        <Tab label="Tickers 24h" />
      </Tabs>

      <Box sx={{ height: 300, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Price Chart
        </Typography>
        <Box sx={{ height: 260 }}>
          {chartData && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1976d2" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1976d2" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" />
                <YAxis domain={['auto', 'auto']} />
                <Tooltip />
                <Area type="monotone" dataKey="price" stroke="#1976d2" fill="url(#colorPrice)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No data available
            </Typography>
          )}
        </Box>
      </Box>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Historical Candle Data
      </Typography>
      <DataTable
        columns={candleColumns}
        rows={candles ?? []}
        getId={r => r.timestamp}
        total={candles?.length ?? 0}
      />
    </Box>
  );
}
