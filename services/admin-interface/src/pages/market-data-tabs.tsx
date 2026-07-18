import { Tab, Tabs } from "@mui/material";

export function MarketDataTabs({
	tab,
	onTabChange,
}: {
	tab: number;
	onTabChange: (newTab: number) => void;
}) {
	return (
		<Tabs
			value={tab}
			onChange={(_, newTab) => onTabChange(newTab)}
			sx={{ mb: 2 }}
		>
			<Tab label="Candles" />
			<Tab label="Transactions" />
			<Tab label="Order Book" />
			<Tab label="Tickers 24h" />
		</Tabs>
	);
}
