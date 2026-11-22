import type { Signal } from "@trading-model/contracts/wire/signals";
import type { RowDataPacket } from "mysql2";
import { DATABASE } from "../../../config/db";
import type { SignalStorePort } from "../../../domain/ports/signal-store.port";

interface SignalRow extends RowDataPacket {
	id: string;
	schema_version: number;
	source_id: string;
	dimension: Signal["dimension"];
	asset_id: string | null;
	sector: string | null;
	area: string | null;
	observed_at: Date;
	ingested_at: Date;
	confidence_score: number;
	/** JSON column: mysql2 returns it parsed. */
	payload: Signal["payload"];
}

const COLUMNS =
	"id, schema_version, source_id, dimension, asset_id, sector, area, observed_at, ingested_at, confidence_score, payload";

/** A signal already stored keeps its row: a replayed collection changes nothing. */
const INSERT_SQL = `INSERT INTO signals (${COLUMNS}) VALUES ? ON DUPLICATE KEY UPDATE id = id`;

const SELECT_FOR_ASSET_SQL = `SELECT ${COLUMNS} FROM signals
	WHERE (asset_id = ? OR (asset_id IS NULL AND sector = ?) OR area IN (?))
		AND dimension IN (?)
		AND (? IS NULL OR source_id = ?)
		AND (? IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(payload, '$.metric')) = ?)
		AND observed_at >= ? AND observed_at < ?
	ORDER BY observed_at, id
	LIMIT ?`;

interface NewestRow extends RowDataPacket {
	source_id: string;
	ingested: Date;
	observed: Date | null;
}

const NEWEST_SQL = `SELECT source_id, MAX(ingested_at) AS ingested, MAX(CASE WHEN observed_at <> ingested_at THEN observed_at END) AS observed
	FROM signals GROUP BY source_id`;

/** Rows were written from checked signals: the payload matches its dimension. */
function _toSignal(row: SignalRow): Signal {
	return {
		id: row.id,
		schemaVersion: row.schema_version,
		sourceId: row.source_id,
		dimension: row.dimension,
		assetId: row.asset_id,
		sector: row.sector,
		area: row.area,
		observedAt: row.observed_at.toISOString(),
		ingestedAt: row.ingested_at.toISOString(),
		confidenceScore: row.confidence_score,
		payload: row.payload,
	} as Signal;
}

/** Signals on the MySQL `signals` table (migrations 006, 009). */
export const MySqlSignalStore: SignalStorePort = {
	async save(signals) {
		if (signals.length === 0) {
			return;
		}
		const rows = signals.map((signal) => [
			signal.id,
			signal.schemaVersion,
			signal.sourceId,
			signal.dimension,
			signal.assetId,
			signal.sector,
			signal.area,
			new Date(signal.observedAt),
			new Date(signal.ingestedAt),
			signal.confidenceScore,
			JSON.stringify(signal.payload),
		]);
		await DATABASE.promise().query(INSERT_SQL, [rows]);
	},

	async newestBySource() {
		const [rows] = await DATABASE.promise().query<NewestRow[]>(NEWEST_SQL);
		return new Map(
			rows.map((row) => [
				row.source_id,
				{
					ingestedAt: row.ingested.getTime(),
					observedAt: row.observed?.getTime() ?? null,
				},
			])
		);
	},

	async findForAsset({
		assetId,
		sector,
		areas,
		dimensions,
		sourceId = null,
		metric = null,
		from,
		to,
		limit,
	}) {
		// `IN ()` is a syntax error: no applicable dimension means no signal.
		if (dimensions.length === 0) {
			return [];
		}
		const [rows] = await DATABASE.promise().query<SignalRow[]>(
			SELECT_FOR_ASSET_SQL,
			// `IN ()` is a syntax error: an asset without areas matches none.
			[
				assetId,
				sector,
				areas.length > 0 ? areas : [null],
				dimensions,
				sourceId,
				sourceId,
				metric,
				metric,
				new Date(from),
				new Date(to),
				limit,
			]
		);
		return rows.map(_toSignal);
	},
};
