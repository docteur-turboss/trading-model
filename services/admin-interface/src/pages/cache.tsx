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

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function HitRateCard({ hitRate, label }: { hitRate: number; label: string }) {
	return (
		<Box sx={{ flex: 1 }}>
			<StatsCard
				icon={<RefreshIcon />}
				value={`${hitRate}%`}
				label={label}
				delta="Based on last 5 minutes"
			/>
		</Box>
	);
}

function ActiveEntriesCard({ count, label }: { count: number; label: string }) {
	return (
		<Box sx={{ flex: 1 }}>
			<StatsCard
				icon={<StorageIcon />}
				value={count.toLocaleString()}
				label={label}
				delta="5% increase today"
				deltaColor="warning.main"
			/>
		</Box>
	);
}

function CacheStats({
	data,
	translate,
}: {
	data:
		| { stats: { hitRate: number; activeEntries: number } }
		| null
		| undefined;
	translate: (key: string) => string;
}) {
	return (
		<Box sx={{ display: "flex", gap: 2, mb: 3 }}>
			<HitRateCard
				hitRate={data?.stats.hitRate ?? 0}
				label={translate("hitRate")}
			/>
			<ActiveEntriesCard
				count={data?.stats.activeEntries ?? 0}
				label={translate("activeEntries")}
			/>
		</Box>
	);
}

function CachePageHeader({
	title,
	subtitle,
	onInvalidate,
}: {
	title: string;
	subtitle: string;
	onInvalidate: () => void;
}) {
	return (
		<Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
			<Box>
				<Typography variant="h4" fontWeight={700}>
					{title}
				</Typography>
				<Typography variant="body2" color="text.secondary">
					{subtitle}
				</Typography>
			</Box>
			<Box sx={{ display: "flex", gap: 1 }}>
				<Button variant="outlined" startIcon={<HistoryIcon />}>
					Invalidation History
				</Button>
				<Button
					variant="contained"
					color="error"
					startIcon={<DeleteSweepIcon />}
					onClick={onInvalidate}
				>
					Invalidate All
				</Button>
			</Box>
		</Box>
	);
}

function useCacheColumns(
	translate: (key: string) => string
): Column<CacheEntry>[] {
	return [
		{ id: "key", label: translate("cacheKey"), render: (row) => row.key },
		{
			id: "service",
			label: translate("service"),
			render: (row) => row.service,
		},
		{
			id: "expiration",
			label: translate("expiration"),
			render: (row) => row.expiration,
		},
		{ id: "size", label: translate("size"), render: (row) => row.size },
		{
			id: "lastAccess",
			label: translate("lastAccess"),
			render: (row) => row.lastAccess,
		},
		{
			id: "status",
			label: "Status",
			render: (row) =>
				row.status ? <StatusBadge status={row.status} /> : null,
		},
	];
}

function CacheInvalidateModal({
	open,
	onConfirm,
	onCancel,
	entryCount,
	translate,
}: {
	open: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	entryCount: number;
	translate: (key: string, opts?: Record<string, unknown>) => string;
}) {
	return (
		<ModalConfirm
			open={open}
			title={translate("criticalAction")}
			description={translate("confirmDescription")}
			confirmLabel={translate("confirmLabel")}
			confirmColor="error"
			impactItems={[
				translate("entriesDeleted", { count: entryCount }),
				translate("latencyWarning"),
				translate("clustersAffected"),
			]}
			onConfirm={onConfirm}
			onCancel={onCancel}
		/>
	);
}

export function Cache() {
	const { t } = useTranslation("cache");
	const { data, loading, refetch } = useApi(() => API_CLIENT.getCacheEntries());
	const [confirmOpen, setConfirmOpen] = useState(false);
	const columns = useCacheColumns(t);

	if (loading) {
		return <PageLoading />;
	}

	return (
		<Box>
			<CachePageHeader
				title={t("title")}
				subtitle={t("subtitle")}
				onInvalidate={() => setConfirmOpen(true)}
			/>

			<CacheStats data={data} translate={t} />

			<DataTable
				columns={columns}
				rows={data?.entries ?? []}
				getId={(row) => row.key}
				total={data?.entries.length ?? 0}
			/>

			<CacheInvalidateModal
				open={confirmOpen}
				entryCount={data?.stats.activeEntries ?? 0}
				translate={t}
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
