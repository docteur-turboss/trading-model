import { Chip } from "@mui/material";

const STATUS_COLORS: Record<
	string,
	"success" | "warning" | "error" | "default" | "info"
> = {
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
	status: string;
	label?: string;
}

function StatusChip({
	label,
	color,
}: {
	label: string;
	color: string | undefined;
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

/** Renders a colored chip representing a service or instance health status. */
export function StatusBadge({ status, label }: StatusBadgeProps) {
	const color = STATUS_COLORS[status.toLowerCase()] ?? "default";
	return <StatusChip label={label ?? status} color={color} />;
}
