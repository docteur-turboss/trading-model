import BoltIcon from "@mui/icons-material/Bolt";
import DnsIcon from "@mui/icons-material/Dns";
import MemoryIcon from "@mui/icons-material/Memory";
import StorageIcon from "@mui/icons-material/Storage";
import { Grid } from "@mui/material";
import { StatsCard } from "../components/stats-card";

export function WorkerStats({
	data,
}: {
	data:
		| {
				stats: {
					activeWorkers: number;
					totalWorkers: number;
					avgCpu: number;
					totalJobsPerMin: number;
					clusterMemory: number;
				};
		  }
		| null
		| undefined;
}) {
	return (
		<Grid container spacing={2} sx={{ mb: 3 }}>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<MemoryIcon />}
					value={`${data?.stats.activeWorkers ?? 0} / ${data?.stats.totalWorkers ?? 0}`}
					label="WORKERS ACTIFS"
					delta="+2 instances provisioned"
					deltaColor="success.main"
				/>
			</Grid>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<BoltIcon />}
					value={`${data?.stats.avgCpu ?? 0}%`}
					label="CHARGE MOYENNE CPU"
					delta="12% stable over 4h"
				/>
			</Grid>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<DnsIcon />}
					value={String(data?.stats.totalJobsPerMin ?? 0)}
					label="TOTAL JOBS/MIN"
					delta="Capacity: 2,500/min"
				/>
			</Grid>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<StorageIcon />}
					value={`${data?.stats.clusterMemory ?? 0} GB`}
					label="MÉMOIRE CLUSTER"
					delta="64% pool utilization"
				/>
			</Grid>
		</Grid>
	);
}
