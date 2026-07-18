import InfoIcon from "@mui/icons-material/Info";
import StorageIcon from "@mui/icons-material/Storage";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Grid } from "@mui/material";
import type {
	Percentage,
	Price,
} from "@trading-model/common/domain/primitives";
import { StatsCard } from "../components/stats-card";

function LastPriceCard({
	lastPrice,
	change,
}: {
	lastPrice?: Price;
	change: Percentage;
}) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={
					change >= 0 ? (
						<TrendingUpIcon color="success" />
					) : (
						<TrendingDownIcon color="error" />
					)
				}
				value={lastPrice ? `$${lastPrice.toLocaleString()}` : "-"}
				label="DERNIER PRIX"
				delta={`${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
				deltaColor={change >= 0 ? "success.main" : "error.main"}
			/>
		</Grid>
	);
}

function High24hCard() {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard icon={<InfoIcon />} value={"-"} label="HAUT 24H" />
		</Grid>
	);
}

function Low24hCard() {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<WarningAmberIcon color="error" />}
				value={"-"}
				label="BAS 24H"
			/>
		</Grid>
	);
}

function Volume24hCard() {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard icon={<StorageIcon />} value={"-"} label="VOLUME 24H" />
		</Grid>
	);
}

export function MarketDataStats({
	lastPrice,
	change,
}: {
	lastPrice?: Price;
	change: Percentage;
}) {
	return (
		<Grid container spacing={2} sx={{ mb: 3 }}>
			<LastPriceCard lastPrice={lastPrice} change={change} />
			<High24hCard />
			<Low24hCard />
			<Volume24hCard />
		</Grid>
	);
}
