import { Chip } from "@mui/material";
import { Severity } from "@trading-model/common/contracts/admin/audit.dto";

const SEVERITY_STYLES: Record<Severity, { color: string; bg: string }> = {
	[Severity.Info]: { color: "#1565c0", bg: "#e3f2fd" },
	[Severity.Warning]: { color: "#e65100", bg: "#fff3e0" },
	[Severity.Error]: { color: "#c62828", bg: "#ffebee" },
	[Severity.Critical]: { color: "#b71c1c", bg: "#fce4ec" },
};

function getSeverityStyle(severity: string): { color: string; bg: string } {
	return (
		SEVERITY_STYLES[severity.toUpperCase() as Severity] ?? {
			color: "#757575",
			bg: "#f5f5f5",
		}
	);
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
