import BoltIcon from "@mui/icons-material/Bolt";
import RefreshIcon from "@mui/icons-material/Refresh";
import { Box } from "@mui/material";
import { InfoBox } from "../components/info-box";

function DrainModeBox() {
	return (
		<InfoBox
			icon={<RefreshIcon />}
			title="What is 'Drain' mode?"
			description="Draining prepares a node for software update by letting running jobs finish gracefully."
			color="info.main"
		/>
	);
}

function AutoScalingBox() {
	return (
		<InfoBox
			icon={<BoltIcon />}
			title="Auto-scaling"
			description="The system added 3 additional nodes 22 minutes ago due to a traffic spike on API Gateway."
			color="info.main"
		/>
	);
}

export function WorkerInfoBoxes() {
	return (
		<Box sx={{ display: "flex", gap: 2, mt: 3 }}>
			<DrainModeBox />
			<AutoScalingBox />
		</Box>
	);
}
