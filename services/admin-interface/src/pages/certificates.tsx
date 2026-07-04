import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Box, Button, CircularProgress, Typography } from "@mui/material";

import { API_CLIENT } from "../api/api-client";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { StatusBadge } from "../components/status-badge";
import { useApi } from "../hooks/use-api";
import type { CertificateEntry } from "../types/dtos";

export function Certificates() {
	const { data, loading, refetch } = useApi<CertificateEntry[]>(() =>
		API_CLIENT.getCertificates()
	);

	const columns: Column<CertificateEntry>[] = [
		{ id: "cn", label: "Common Name", render: (row) => row.commonName },
		{ id: "issuer", label: "Issuer", render: (row) => row.issuer },
		{
			id: "fingerprint",
			label: "Fingerprint",
			render: (row) => row.fingerprint.slice(0, 20),
		},
		{ id: "expires", label: "Expires At", render: (row) => row.expiresAt },
		{
			id: "status",
			label: "Status",
			render: (row) => <StatusBadge status={row.status} />,
		},
	];

	if (loading) {
		return (
			<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
				<CircularProgress />
			</Box>
		);
	}

	return (
		<Box>
			<Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
				<Box>
					<Typography variant="h4" fontWeight={700}>
						Certificates
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Manage X.509 certificate lifecycle and CRL.
					</Typography>
				</Box>
				<Box sx={{ display: "flex", gap: 1 }}>
					<Button
						variant="outlined"
						startIcon={<RefreshIcon />}
						onClick={refetch}
					>
						Refresh
					</Button>
					<Button variant="contained" startIcon={<AddIcon />}>
						Sign Certificate
					</Button>
				</Box>
			</Box>

			<DataTable
				columns={columns}
				rows={data ?? []}
				getId={(row) => row.id}
				total={data?.length ?? 0}
			/>
		</Box>
	);
}
