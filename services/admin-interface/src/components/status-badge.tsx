import { Chip } from "@mui/material";
import type {
	JOB_STATUS,
	ServiceStatus,
} from "@trading-model/common/contracts/admin";
import type { WorkerStatusCode } from "@trading-model/common/domain/primitives";

enum MuiColor {
	Success = "success",
	Warning = "warning",
	Error = "error",
	Default = "default",
	Info = "info",
}

type StatusValue = JOB_STATUS | ServiceStatus | WorkerStatusCode;

const STATUS_COLORS: Record<string, MuiColor> = {
	healthy: MuiColor.Success,
	online: MuiColor.Success,
	active: MuiColor.Success,
	degraded: MuiColor.Warning,
	draining: MuiColor.Warning,
	expired: MuiColor.Warning,
	down: MuiColor.Error,
	offline: MuiColor.Error,
	failed: MuiColor.Error,
	error: MuiColor.Error,
	critical: MuiColor.Error,
	completed: MuiColor.Info,
	finished: MuiColor.Info,
	info: MuiColor.Info,
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
	const chipColor =
		color === MuiColor.Default
			? undefined
			: (color as unknown as "success" | "warning" | "error" | "info");
	return (
		<Chip
			size="small"
			label={label}
			color={chipColor}
			variant="outlined"
			sx={{
				fontWeight: 600,
				fontSize: "0.7rem",
				...(chipColor === undefined && {
					borderColor: "#bdbdbd",
					color: "#757575",
				}),
			}}
		/>
	);
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
	const color: MuiColor =
		STATUS_COLORS[status.toLowerCase()] ?? MuiColor.Default;
	return <StatusChip label={label ?? status} color={color} />;
}
