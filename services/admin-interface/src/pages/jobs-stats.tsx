import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SyncIcon from "@mui/icons-material/Sync";
import { Box } from "@mui/material";
import { StatsCard } from "../components/stats-card";

export function JobStats({
	stats,
}: {
	stats: { pending: number; inProgress: number; failed: number };
}) {
	return (
		<Box sx={{ display: "flex", gap: 2, mb: 3 }}>
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<ScheduleIcon />}
					value={String(stats.pending)}
					label="PENDING"
				/>
			</Box>
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<SyncIcon />}
					value={String(stats.inProgress)}
					label="IN PROGRESS"
				/>
			</Box>
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<ErrorOutlineIcon />}
					value={String(stats.failed)}
					label="FAILED (1H)"
					deltaColor="error.main"
				/>
			</Box>
		</Box>
	);
}
