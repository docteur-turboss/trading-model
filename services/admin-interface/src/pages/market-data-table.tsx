import { Typography } from "@mui/material";
import { DataTable } from "../components/data-table";
import type { Candle } from "../types/dtos";
import { createCandleColumns } from "./helpers/market-data-utils";

export function CandleDataTable({
	candles,
}: {
	candles: Candle[] | null | undefined;
}) {
	return (
		<>
			<Typography variant="subtitle2" sx={{ mb: 1 }}>
				Historical Candle Data
			</Typography>
			<DataTable
				columns={createCandleColumns()}
				rows={candles ?? []}
				getId={(row) => String(row.timestamp)}
				total={candles?.length ?? 0}
			/>
		</>
	);
}
