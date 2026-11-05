import type { RowDataPacket } from "mysql2";
import { DATABASE } from "../../../config/db";
import type { SignalStorePort } from "../../../domain/ports/signal-store.port";
import type { Signal } from "../../../domain/signals";

interface SignalRow extends RowDataPacket {
	id: string;
	schema_version: number;
	source_id: string;
	dimension: Signal["dimension"];
	asset_id: string | null;
	sector: string | null;
	observed_at: Date;
	ingested_at: Date;
	confidence_score: number;
	/** JSON column: mysql2 returns it parsed. */
	payload: Signal["payload"];
}

const COLUMNS =
	"id, schema_version, source_id, dimension, asset_id, sector, observed_at, ingested_at, confidence_score, payload";

/** A signal already stored keeps its row: a replayed collection changes nothing. */
const INSERT_SQL = `INSERT INTO signals (${COLUMNS}) VALUES ? ON DUPLICATE KEY UPDATE id = id`;

const SELECT_FOR_ASSET_SQL = `SELECT ${COLUMNS} FROM signals
	WHERE (asset_id = ? OR (asset_id IS NULL AND sector = ?))
		AND dimension IN (?)
		AND observed_at >= ? AND observed_at < ?
	ORDER BY observed_at, id
	LIMIT ?`;

/** Rows were written from checked signals: the payload matches its dimension. */
function _toSignal(row: SignalRow): Signal {
	return {
		id: row.id,
		schemaVersion: row.schema_version,
		sourceId: row.source_id,
		dimension: row.dimension,
		assetId: row.asset_id,
		sector: row.sector,
		observedAt: row.observed_at.toISOString(),
		ingestedAt: row.ingested_at.toISOString(),
		confidenceScore: row.confidence_score,
		payload: row.payload,
	} as Signal;
}

/** Signals on the MySQL `signals` table (migration 006). */
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
			new Date(signal.observedAt),
			new Date(signal.ingestedAt),
			signal.confidenceScore,
			JSON.stringify(signal.payload),
		]);
		await DATABASE.promise().query(INSERT_SQL, [rows]);
	},

	async findForAsset({ assetId, sector, dimensions, from, to, limit }) {
		const [rows] = await DATABASE.promise().query<SignalRow[]>(
			SELECT_FOR_ASSET_SQL,
			[assetId, sector, dimensions, new Date(from), new Date(to), limit]
		);
		return rows.map(_toSignal);
	},
};
