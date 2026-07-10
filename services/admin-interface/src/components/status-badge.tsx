import { Chip } from "@mui/material";
import type {
	JOB_STATUS,
	ServiceStatus,
} from "@trading-model/common/contracts/admin";
import type { WorkerStatusCode } from "@trading-model/common/domain/primitives";

type MuiColor = "success" | "warning" | "error" | "default" | "info";

type StatusValue = JOB_STATUS | ServiceStatus | WorkerStatusCode;

const STATUS_COLORS: Record<string, MuiColor> = {
	healthy: "success",
	online: "success",
	active: "success",
	degraded: "warning",
	draining: "warning",
	expired: "warning",
	down: "error",
	offline: "error",
	failed: "error",
	error: "error",
	critical: "error",
	completed: "info",
	finished: "info",
	info: "info",
};

interface StatusBadgeProps {
	status: StatusValue;
	label?: string;
}

function StatusChip({
	label,
	color,
}: {
	label: string;
	color: MuiColor | undefined;
}) {
	return (
		<Chip
			size="small"
			label={label}
			color={
				color === "default"
					? undefined
					: (color as "success" | "warning" | "error" | "info")
			}
			variant="outlined"
			sx={{
				fontWeight: 600,
				fontSize: "0.7rem",
				...(color === "default" && {
					borderColor: "#bdbdbd",
					color: "#757575",
				}),
			}}
		/>
	);
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
	const color: MuiColor = STATUS_COLORS[status.toLowerCase()] ?? "default";
	return <StatusChip label={label ?? status} color={color} />;
}
