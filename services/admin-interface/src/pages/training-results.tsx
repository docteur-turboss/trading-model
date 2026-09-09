import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import StopIcon from "@mui/icons-material/Stop";
import TrackChangesIcon from "@mui/icons-material/TrackChanges";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
	Box,
	Button,
	Chip,
	CircularProgress,
	Grid,
	Typography,
} from "@mui/material";
import { useState } from "react";

import { API_CLIENT } from "../api/api-client";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { DrawerPanel } from "../components/drawer-panel";
import { StatsCard } from "../components/stats-card";
import { useApi } from "../hooks/use-api";
import type { TrainingResult } from "../types/dtos";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function FitnessCard() {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<TrackChangesIcon />}
				value="0.824"
				label="FITNESS MOYEN"
				delta="+4.2% vs yesterday"
				deltaColor="success.main"
			/>
		</Grid>
	);
}

function SharpeCard() {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<TrendingUpIcon />}
				value="2.14"
				label="SHARPE MAX"
				delta="Generation #142"
			/>
		</Grid>
	);
}

function TrainingStats() {
	return (
		<Grid container spacing={2} sx={{ mb: 3 }}>
			<FitnessCard />
			<SharpeCard />
		</Grid>
	);
}

function GenomeEmptyState() {
	return (
		<Typography variant="body2" color="text.secondary">
			No genome data available.
		</Typography>
	);
}

function GenomeJson({ genome }: { genome: unknown }) {
	return (
		<Typography
			variant="body2"
			component="pre"
			sx={{
				fontFamily: "monospace",
				fontSize: "0.7rem",
				bgcolor: "#1e1e1e",
				color: "#d4d4d4",
				padding: 2,
				borderRadius: 1,
				overflow: "auto",
			}}
		>
			{JSON.stringify(genome, null, 2)}
		</Typography>
	);
}

function GenomeViewer({ genome }: { genome: unknown }) {
	if (!genome) {
		return <GenomeEmptyState />;
	}
	return <GenomeJson genome={genome} />;
}

function sharpeColor(sharpe: number): "success" | "warning" | "error" {
	if (sharpe >= 1.5) {
		return "success";
	}
	if (sharpe >= 1) {
		return "warning";
	}
	return "error";
}

function SharpeChip({ sharpe }: { sharpe: number }) {
	return (
		<Chip
			size="small"
			label={sharpe.toFixed(2)}
			color={sharpeColor(sharpe)}
			variant="outlined"
		/>
	);
}

function createTrainingResultColumns(): Column<TrainingResult>[] {
	return [
		{ id: "id", label: "ID", render: (row) => row.id },
		{ id: "symbol", label: "Symbol", render: (row) => row.symbol },
		{ id: "gen", label: "Gen.", render: (row) => `#${row.generation}` },
		{
			id: "fitness",
			label: "Fitness",
			render: (row) => row.fitness.toFixed(3),
		},
		{
			id: "sharpe",
			label: "Sharpe",
			render: (row) => <SharpeChip sharpe={row.sharpe} />,
		},
	];
}

function TrainingResultDrawer({
	selected,
	onClose,
}: {
	selected: TrainingResult | null;
	onClose: () => void;
}) {
	return (
		<DrawerPanel
			open={Boolean(selected)}
			title={`Genome Inspection - ${selected?.id ?? ""}`}
			subtitle={`Symbol: ${selected?.symbol ?? ""} | Generation: #${selected?.generation ?? ""}`}
			onClose={onClose}
			tabs={
				selected
					? [
							{
								label: "Genome (JSON)",
								content: <GenomeViewer genome={selected.genome} />,
							},
						]
					: []
			}
		/>
	);
}

function TrainingActions({ onRefresh }: { onRefresh: () => void }) {
	return (
		<Box sx={{ display: "flex", gap: 1 }}>
			<Button
				variant="outlined"
				startIcon={<RefreshIcon />}
				onClick={onRefresh}
			>
				Refresh
			</Button>
			<Button variant="contained" color="success" startIcon={<PlayArrowIcon />}>
				Start Training
			</Button>
			<Button variant="contained" color="error" startIcon={<StopIcon />}>
				Stop
			</Button>
		</Box>
	);
}

function TrainingPageHeader({ onRefresh }: { onRefresh: () => void }) {
	return (
		<Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
			<Box>
				<Typography variant="h4" sx={{ fontWeight: 700 }}>
					Training Results
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Monitor and analyze genetic algorithm performance.
				</Typography>
			</Box>
			<TrainingActions onRefresh={onRefresh} />
		</Box>
	);
}

function TrainingResultsTable({
	data,
	selectedId,
	onSelectId,
}: {
	data: { results: TrainingResult[]; total: number } | null | undefined;
	selectedId: string | null;
	onSelectId: (id: string) => void;
}) {
	return (
		<DataTable
			columns={createTrainingResultColumns()}
			rows={data?.results ?? []}
			getId={(row) => row.id}
			total={data?.total ?? 0}
			onSelectOne={onSelectId}
			selectedIds={selectedId ? new Set([selectedId]) : new Set()}
			selectable
		/>
	);
}

export function TrainingResults() {
	const { data, loading, refetch } = useApi(() =>
		API_CLIENT.getTrainingResults()
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected =
		data?.results.find((result) => result.id === selectedId) ?? null;

	if (loading) {
		return <PageLoading />;
	}

	return (
		<Box>
			<TrainingPageHeader onRefresh={refetch} />
			<TrainingStats />
			<TrainingResultsTable
				data={data}
				selectedId={selectedId}
				onSelectId={setSelectedId}
			/>
			<TrainingResultDrawer
				selected={selected}
				onClose={() => setSelectedId(null)}
			/>
		</Box>
	);
}
