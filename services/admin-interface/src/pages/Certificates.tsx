import { Box, Typography, Button, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import { useApi } from '../hooks/useApi';
import { api } from '../api/api-client';
import type { CertificateEntry } from '../types/dtos';
import { StatusBadge } from '../components/StatusBadge';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';

export function Certificates() {
  const { data, loading, refetch } = useApi<CertificateEntry[]>(() => api.getCertificates());

  const columns: Column<CertificateEntry>[] = [
    { id: 'cn', label: 'Common Name', render: r => r.commonName },
    { id: 'issuer', label: 'Issuer', render: r => r.issuer },
    { id: 'fingerprint', label: 'Fingerprint', render: r => r.fingerprint.slice(0, 20) },
    { id: 'expires', label: 'Expires At', render: r => r.expiresAt },
    {
      id: 'status',
      label: 'Status',
      render: r => <StatusBadge status={r.status} />,
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
            Certificates
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage X.509 certificate lifecycle and CRL.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refetch}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />}>
            Sign Certificate
          </Button>
        </Box>
      </Box>

      <DataTable columns={columns} rows={data ?? []} getId={r => r.id} total={data?.length ?? 0} />
    </Box>
  );
}
