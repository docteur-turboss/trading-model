import { Chip } from "@mui/material";

const SEVERITY_STYLES: Record<string, { color: string; bg: string }> = {
	INFO: { color: "#1565c0", bg: "#e3f2fd" },
	WARNING: { color: "#e65100", bg: "#fff3e0" },
	ERROR: { color: "#c62828", bg: "#ffebee" },
	CRITICAL: { color: "#b71c1c", bg: "#fce4ec" },
};

function getSeverityStyle(severity: string): { color: string; bg: string } {
	return SEVERITY_STYLES[severity.toUpperCase()] ?? { color: "#757575", bg: "#f5f5f5" };
}

interface SeverityBadgeProps {
	severity: string;
}

function SeverityChip({
	severity,
	style,
}: {
	severity: string;
	style: { color: string; bg: string };
}) {
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

export function SeverityBadge({ severity }: SeverityBadgeProps) {
	const style = getSeverityStyle(severity);
	return <SeverityChip severity={severity} style={style} />;
}
