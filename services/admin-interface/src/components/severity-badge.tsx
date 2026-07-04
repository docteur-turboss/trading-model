import { Chip } from "@mui/material";

function getSeverityStyle(severity: string): { color: string; bg: string } {
	const sev = severity.toUpperCase();
	if (sev === "INFO") {
		return { color: "#1565c0", bg: "#e3f2fd" };
	}
	if (sev === "WARNING") {
		return { color: "#e65100", bg: "#fff3e0" };
	}
	if (sev === "ERROR") {
		return { color: "#c62828", bg: "#ffebee" };
	}
	if (sev === "CRITICAL") {
		return { color: "#b71c1c", bg: "#fce4ec" };
	}
	return { color: "#757575", bg: "#f5f5f5" };
}

interface SeverityBadgeProps {
	severity: string;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
	const style = getSeverityStyle(severity);
	return (
		<Chip
			size="small"
			label={severity}
			sx={{
				fontWeight: 600,
				fontSize: "0.7rem",
				color: style.color,
				backgroundColor: style.bg,
			}}
		/>
	);
}
