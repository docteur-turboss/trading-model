import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import StopIcon from "@mui/icons-material/Stop";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
	Box,
	Button,
	Chip,
	CircularProgress,
	Divider,
	LinearProgress,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";

import { API_CLIENT } from "../api/api-client";
import { DrawerPanel } from "../components/drawer-panel";
import { StatsCard } from "../components/stats-card";
import { useApi } from "../hooks/use-api";
import type {
	TrainingAgentEntry,
	TrainingAgentListResponse,
} from "../types/dtos";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function PageError({ message }: { message: string }) {
	return (
		<Box sx={{ mt: 4, textAlign: "center" }}>
			<Typography color="error">{message}</Typography>
		</Box>
	);
}

function fitnessColor(fitness: number): "success" | "warning" | "error" {
	if (fitness >= 0.5) {
		return "success";
	}
	if (fitness >= 0) {
		return "warning";
	}
	return "error";
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

function pnlColor(pnl: number): "success" | "error" {
	return pnl >= 0 ? "success" : "error";
}

function OverviewStats({ data }: { data: TrainingAgentListResponse }) {
	const agents = data.agents ?? [];
	const bestFitness =
		agents.length > 0
			? Math.max(...agents.map((entry) => entry.agent.fitness))
			: 0;
	const bestSharpe =
		agents.length > 0
			? Math.max(...agents.map((entry) => entry.agent.sharpe))
			: 0;
	const avgPnl =
		agents.length > 0
			? agents.reduce((sum, entry) => sum + entry.agent.avgPnl, 0) /
				agents.length
			: 0;

	return (
		<Box sx={{ display: "flex", gap: 2, mb: 3 }}>
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<TrendingUpIcon />}
					value={agents.length.toString()}
					label="ACTIVE AGENTS"
					delta={data.training ? `Training: ${data.currentSymbol}` : "Idle"}
					deltaColor={data.training ? "warning.main" : "text.secondary"}
				/>
			</Box>
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<TrendingUpIcon />}
					value={bestFitness.toFixed(4)}
					label="BEST FITNESS"
					deltaColor="success.main"
				/>
			</Box>
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<TrendingUpIcon />}
					value={bestSharpe.toFixed(2)}
					label="BEST SHARPE"
					deltaColor="success.main"
				/>
			</Box>
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<TrendingDownIcon />}
					value={`${avgPnl >= 0 ? "+" : ""}${avgPnl.toFixed(4)}`}
					label="AVG PNL"
					deltaColor={avgPnl >= 0 ? "success.main" : "error.main"}
				/>
			</Box>
		</Box>
	);
}

function AgentStatusChip({ training }: { training: boolean }) {
	return (
		<Chip
			size="small"
			label={training ? "Training" : "Idle"}
			color={training ? "warning" : "default"}
			variant="outlined"
			sx={{ fontWeight: 600 }}
		/>
	);
}

function AgentDetailSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Box sx={{ mb: 2 }}>
			<Typography
				variant="subtitle2"
				sx={{
					fontWeight: 600,
					mb: 1,
					textTransform: "uppercase",
					letterSpacing: 0.5,
				}}
			>
				{title}
			</Typography>
			{children}
		</Box>
	);
}

function DetailRow({
	label,
	value,
}: {
	label: string;
	value: string | number;
}) {
	return (
		<Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
			<Typography variant="body2" color="text.secondary">
				{label}
			</Typography>
			<Typography
				variant="body2"
				sx={{ fontWeight: 500, fontFamily: "monospace" }}
			>
				{typeof value === "number" ? value.toFixed(4) : value}
			</Typography>
		</Box>
	);
}

function AgentDetailDrawer({
	agent,
	onClose,
}: {
	agent: TrainingAgentEntry | null;
	onClose: () => void;
}) {
	if (!agent) {
		return null;
	}

	const { agent: summary, symbol, generation, training } = agent;

	return (
		<DrawerPanel
			open={Boolean(agent)}
			title={`${symbol} Agent`}
			subtitle={`Generation #${String(generation)} | ${training ? "Training" : "Idle"}`}
			onClose={onClose}
			tabs={[
				{
					label: "Metrics",
					content: (
						<Box>
							<AgentDetailSection title="Performance">
								<DetailRow label="Fitness" value={summary.fitness} />
								<DetailRow label="Sharpe Ratio" value={summary.sharpe} />
								<DetailRow label="Avg PnL" value={summary.avgPnl} />
								<DetailRow
									label="Max Drawdown"
									value={`-${(summary.maxDrawdown * 100).toFixed(1)}%`}
								/>
							</AgentDetailSection>
							<Divider sx={{ my: 2 }} />
							<AgentDetailSection title="Network Architecture">
								<DetailRow label="Input Dim" value={summary.network.inputDim} />
								<DetailRow
									label="Output Dim"
									value={summary.network.outputDim}
								/>
								{summary.network.hiddenLayers.map((hiddenLayer, layerIdx) => (
									<DetailRow
										// biome-ignore lint/suspicious/noArrayIndexKey: static read-only list
										key={`layer-${layerIdx}-${hiddenLayer.neurons}`}
										label={`Layer ${layerIdx + 1}`}
										value={`${hiddenLayer.neurons} neurons (${hiddenLayer.activation})`}
									/>
								))}
							</AgentDetailSection>
							<Divider sx={{ my: 2 }} />
							<AgentDetailSection title="Reinforcement Learning">
								<DetailRow label="Gamma" value={summary.rl.gamma} />
								<DetailRow
									label="Learning Rate"
									value={summary.rl.learningRate}
								/>
								<DetailRow
									label="Epsilon Start"
									value={summary.rl.epsilonStart}
								/>
								<DetailRow label="Epsilon Min" value={summary.rl.epsilonMin} />
								<DetailRow
									label="Epsilon Decay"
									value={summary.rl.epsilonDecay}
								/>
							</AgentDetailSection>
							<Divider sx={{ my: 2 }} />
							<AgentDetailSection title="GA Control">
								<DetailRow
									label="Population Size"
									value={summary.gaControl.populationSize}
								/>
								<DetailRow
									label="Elitism Fraction"
									value={summary.gaControl.elitismFraction}
								/>
								<DetailRow
									label="Survivor Fraction"
									value={summary.gaControl.survivorFraction}
								/>
								<DetailRow
									label="Episodes/Individual"
									value={summary.gaControl.episodesPerIndividual}
								/>
								<DetailRow
									label="Selection"
									value={summary.gaControl.selectionType}
								/>
								<DetailRow
									label="Fitness Type"
									value={summary.gaControl.fitnessType}
								/>
							</AgentDetailSection>
						</Box>
					),
				},
				{
					label: "Raw JSON",
					content: (
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
							{JSON.stringify(agent, null, 2)}
						</Typography>
					),
				},
			]}
		/>
	);
}

function TrainingActions({
	onRefresh,
	isTraining,
}: {
	onRefresh: () => void;
	isTraining: boolean;
}) {
	return (
		<Box sx={{ display: "flex", gap: 1 }}>
			<Button
				variant="outlined"
				startIcon={<RefreshIcon />}
				onClick={onRefresh}
			>
				Refresh
			</Button>
			{!isTraining && (
				<Button
					variant="contained"
					color="success"
					startIcon={<PlayArrowIcon />}
				>
					Start Training
				</Button>
			)}
			{isTraining && (
				<Button variant="contained" color="error" startIcon={<StopIcon />}>
					Stop
				</Button>
			)}
		</Box>
	);
}

function TrainingPageHeader({
	onRefresh,
	isTraining,
}: {
	onRefresh: () => void;
	isTraining: boolean;
}) {
	return (
		<Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
			<Box>
				<Typography variant="h4" sx={{ fontWeight: 700 }}>
					Training Agents
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Monitor active genetic algorithm agents and their performance.
				</Typography>
			</Box>
			<TrainingActions onRefresh={onRefresh} isTraining={isTraining} />
		</Box>
	);
}

function AgentTable({
	agents,
	selectedSymbol,
	onSelectSymbol,
}: {
	agents: TrainingAgentEntry[];
	selectedSymbol: string | null;
	onSelectSymbol: (symbol: string) => void;
}) {
	return (
		<TableContainer>
			<Table size="small">
				<TableHead>
					<TableRow>
						<TableCell sx={{ fontWeight: 600 }}>Symbol</TableCell>
						<TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
						<TableCell sx={{ fontWeight: 600 }}>Generation</TableCell>
						<TableCell sx={{ fontWeight: 600 }}>Fitness</TableCell>
						<TableCell sx={{ fontWeight: 600 }}>Sharpe</TableCell>
						<TableCell sx={{ fontWeight: 600 }}>Avg PnL</TableCell>
						<TableCell sx={{ fontWeight: 600 }}>Drawdown</TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{agents.map((entry) => (
						<TableRow
							key={entry.symbol}
							hover
							selected={entry.symbol === selectedSymbol}
							sx={{ cursor: "pointer" }}
							onClick={() => onSelectSymbol(entry.symbol)}
						>
							<TableCell>
								<Typography variant="body2" sx={{ fontWeight: 600 }}>
									{entry.symbol}
								</Typography>
							</TableCell>
							<TableCell>
								<AgentStatusChip training={entry.training} />
							</TableCell>
							<TableCell>
								<Typography variant="body2">
									#{String(entry.generation)}
								</Typography>
							</TableCell>
							<TableCell>
								<Chip
									size="small"
									label={entry.agent.fitness.toFixed(4)}
									color={fitnessColor(entry.agent.fitness)}
									variant="outlined"
								/>
							</TableCell>
							<TableCell>
								<Chip
									size="small"
									label={entry.agent.sharpe.toFixed(2)}
									color={sharpeColor(entry.agent.sharpe)}
									variant="outlined"
								/>
							</TableCell>
							<TableCell>
								<Typography
									variant="body2"
									color={pnlColor(entry.agent.avgPnl)}
									sx={{ fontWeight: 500 }}
								>
									{entry.agent.avgPnl >= 0 ? "+" : ""}
									{entry.agent.avgPnl.toFixed(4)}
								</Typography>
							</TableCell>
							<TableCell>
								<Typography variant="body2" color="error.main">
									-{(entry.agent.maxDrawdown * 100).toFixed(1)}%
								</Typography>
							</TableCell>
						</TableRow>
					))}
					{agents.length === 0 && (
						<TableRow>
							<TableCell colSpan={7} sx={{ textAlign: "center", py: 4 }}>
								<Typography variant="body2" color="text.secondary">
									No trained agents yet. Start training to begin.
								</Typography>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</TableContainer>
	);
}

export function TrainingResults() {
	const { data, loading, error, refetch } = useApi(() =>
		API_CLIENT.getTrainingAgents()
	);
	const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
	const selected =
		data?.agents?.find((entry) => entry.symbol === selectedSymbol) ?? null;

	useEffect(() => {
		const interval = setInterval(refetch, 30_000);
		return () => clearInterval(interval);
	}, [refetch]);

	const handleSelect = useCallback((symbol: string) => {
		setSelectedSymbol(symbol);
	}, []);

	if (loading) {
		return <PageLoading />;
	}
	return (
		<Box>
			<TrainingPageHeader
				onRefresh={refetch}
				isTraining={data?.training ?? false}
			/>
			{error && <PageError message={error} />}
			{data && <OverviewStats data={data} />}
			{data?.training && <LinearProgress sx={{ mb: 2 }} color="warning" />}
			<AgentTable
				agents={data?.agents ?? []}
				selectedSymbol={selectedSymbol}
				onSelectSymbol={handleSelect}
			/>
			<AgentDetailDrawer
				agent={selected}
				onClose={() => setSelectedSymbol(null)}
			/>
		</Box>
	);
}
