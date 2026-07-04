import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import HistoryIcon from "@mui/icons-material/History";
import RefreshIcon from "@mui/icons-material/Refresh";
import StorageIcon from "@mui/icons-material/Storage";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { API_CLIENT } from "../api/api-client";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { ModalConfirm } from "../components/modal-confirm";
import { StatsCard } from "../components/stats-card";
import { StatusBadge } from "../components/status-badge";
import { useApi } from "../hooks/use-api";
import type { CacheEntry } from "../types/dtos";

export function Cache() {
	const { t } = useTranslation("cache");
	const { data, loading, refetch } = useApi(() => API_CLIENT.getCacheEntries());
	const [confirmOpen, setConfirmOpen] = useState(false);

	const columns: Column<CacheEntry>[] = [
		{ id: "key", label: t("cacheKey"), render: (row) => row.key },
		{ id: "service", label: t("service"), render: (row) => row.service },
		{
			id: "expiration",
			label: t("expiration"),
			render: (row) => row.expiration,
		},
		{ id: "size", label: t("size"), render: (row) => row.size },
		{
			id: "lastAccess",
			label: t("lastAccess"),
			render: (row) => row.lastAccess,
		},
		{
			id: "status",
			label: "Status",
			render: (row) =>
				row.status ? <StatusBadge status={row.status} /> : null,
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
						{t("title")}
					</Typography>
					<Typography variant="body2" color="text.secondary">
						{t("subtitle")}
					</Typography>
				</Box>
				<Box sx={{ display: "flex", gap: 1 }}>
					<Button variant="outlined" startIcon={<HistoryIcon />}>
						{t("invalidationHistory")}
					</Button>
					<Button
						variant="contained"
						color="error"
						startIcon={<DeleteSweepIcon />}
						onClick={() => setConfirmOpen(true)}
					>
						{t("invalidateAll")}
					</Button>
				</Box>
			</Box>

			<Box sx={{ display: "flex", gap: 2, mb: 3 }}>
				<Box sx={{ flex: 1 }}>
					<StatsCard
						icon={<RefreshIcon />}
						value={`${data?.stats.hitRate ?? 0}%`}
						label={t("hitRate")}
						delta="Based on last 5 minutes"
					/>
				</Box>
				<Box sx={{ flex: 1 }}>
					<StatsCard
						icon={<StorageIcon />}
						value={(data?.stats.activeEntries ?? 0).toLocaleString()}
						label={t("activeEntries")}
						delta="5% increase today"
						deltaColor="warning.main"
					/>
				</Box>
			</Box>

			<DataTable
				columns={columns}
				rows={data?.entries ?? []}
				getId={(row) => row.key}
				total={data?.entries.length ?? 0}
			/>

			<ModalConfirm
				open={confirmOpen}
				title={t("criticalAction")}
				description={t("confirmDescription")}
				confirmLabel={t("confirmLabel")}
				confirmColor="error"
				impactItems={[
					t("entriesDeleted", { count: data?.stats.activeEntries ?? 0 }),
					t("latencyWarning"),
					t("clustersAffected"),
				]}
				onConfirm={() => {
					void API_CLIENT.invalidateCache().then(() => {
						setConfirmOpen(false);
						refetch();
					});
				}}
				onCancel={() => setConfirmOpen(false)}
			/>
		</Box>
	);
}
