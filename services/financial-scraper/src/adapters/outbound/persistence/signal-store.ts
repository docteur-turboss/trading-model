import type { RowDataPacket } from "mysql2";
import { DATABASE } from "../../../config/db";
import type { SignalStorePort } from "../../../domain/ports/signal-store.port";
import type {
	AttributeValue,
	Dimension,
	SIGNAL_SCHEMA_VERSION,
	Signal,
} from "../../../domain/signals";

interface SignalRow extends RowDataPacket {
	id: string;
	schema_version: number;
	source_id: string;
	dimension: Dimension;
	asset_id: string | null;
	sector: string | null;
	metric: string;
	value: number;
	unit: string;
	observed_at: Date;
	collected_at: Date;
	confidence_score: number;
	/** JSON column: mysql2 returns it parsed. */
	attributes: Record<string, AttributeValue>;
}

const COLUMNS =
	"id, schema_version, source_id, dimension, asset_id, sector, metric, value, unit, observed_at, collected_at, confidence_score, attributes";

/** A signal already stored keeps its row: a replayed collection changes nothing. */
const INSERT_SQL = `INSERT INTO signals (${COLUMNS}) VALUES ? ON DUPLICATE KEY UPDATE id = id`;

const SELECT_FOR_ASSET_SQL = `SELECT ${COLUMNS} FROM signals
	WHERE (asset_id = ? OR (asset_id IS NULL AND sector = ?))
		AND observed_at >= ? AND observed_at < ?
	ORDER BY observed_at, id
	LIMIT ?`;

function _toSignal(row: SignalRow): Signal {
	return {
		id: row.id,
		schemaVersion: row.schema_version as typeof SIGNAL_SCHEMA_VERSION,
		sourceId: row.source_id,
		dimension: row.dimension,
		assetId: row.asset_id,
		sector: row.sector,
		metric: row.metric,
		value: row.value,
		unit: row.unit,
		observedAt: row.observed_at.toISOString(),
		collectedAt: row.collected_at.toISOString(),
		confidenceScore: row.confidence_score,
		attributes: row.attributes,
	};
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
			signal.metric,
			signal.value,
			signal.unit,
			new Date(signal.observedAt),
			new Date(signal.collectedAt),
			signal.confidenceScore,
			JSON.stringify(signal.attributes),
		]);
		await DATABASE.promise().query(INSERT_SQL, [rows]);
	},

	async findForAsset({ assetId, sector, from, to, limit }) {
		const [rows] = await DATABASE.promise().query<SignalRow[]>(
			SELECT_FOR_ASSET_SQL,
			[assetId, sector, new Date(from), new Date(to), limit]
		);
		return rows.map(_toSignal);
	},
};
