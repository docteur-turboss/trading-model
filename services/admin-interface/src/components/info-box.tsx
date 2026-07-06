import { Box, Paper, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface INfoBoxProps {
	icon: ReactNode;
	title: string;
	description: string;
	color?: string;
}

function InfoBoxIcon({ icon, color }: { icon: ReactNode; color: string }) {
	return <Box sx={{ color, mt: 0.25 }}>{icon}</Box>;
}

function InfoBoxText({
	title,
	description,
	color,
}: {
	title: string;
	description: string;
	color: string;
}) {
	return (
		<Box>
			<Typography variant="subtitle2" fontWeight={600} sx={{ color }}>
				{title}
			</Typography>
			<Typography variant="body2" color="text.secondary">
				{description}
			</Typography>
		</Box>
	);
}

/** Informational card displaying an icon, title, and description. */
export function InfoBox({
	icon,
	title,
	description,
	color = "primary.main",
}: INfoBoxProps) {
	return (
		<Paper
			variant="outlined"
			sx={{ padding: 1.5, display: "flex", gap: 1.5, alignItems: "flex-start" }}
		>
			<InfoBoxIcon icon={icon} color={color} />
			<InfoBoxText title={title} description={description} color={color} />
		</Paper>
	);
}
