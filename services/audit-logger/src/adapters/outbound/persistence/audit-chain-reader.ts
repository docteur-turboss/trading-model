import type { Collection, Db } from "mongodb";
import type {
	ChainedAuditEvent,
	ChainPoint,
} from "../../../domain/audit-chain";
import type {
	AuditChainReaderPort,
	ChainState,
	ChainStatePort,
} from "../../../domain/ports/audit-chain.port";

const EVENTS = "audit_events";
const STATE = "audit_chain_state";
const STATE_ID = "chain";
/** Events read per round trip: bounds memory on a five-year trail. */
const BATCH_SIZE = 1000;
/** Only what the hash covers, plus the hash. */
const CHAIN_FIELDS = {
	_id: 0,
	receivedAt: 1,
	metadata: 1,
	payload: 1,
	previousHash: 1,
	chainSequence: 1,
	dataHash: 1,
} as const;

export class MongoAuditChainReader implements AuditChainReaderPort {
	private readonly _events: Collection<ChainedAuditEvent>;

	constructor(db: Db) {
		this._events = db.collection<ChainedAuditEvent>(EVENTS);
	}

	async *eventsAfter(
		afterSequence: number | null
	): AsyncIterable<ChainedAuditEvent> {
		const filter =
			afterSequence === null ? {} : { chainSequence: { $gt: afterSequence } };
		yield* this._events
			.find(filter, { projection: CHAIN_FIELDS })
			.sort({ chainSequence: 1 })
			.batchSize(BATCH_SIZE);
	}

	async head(): Promise<ChainPoint | null> {
		const last = await this._events.findOne(
			{},
			{
				sort: { chainSequence: -1 },
				projection: { _id: 0, chainSequence: 1, dataHash: 1 },
			}
		);
		return last
			? { chainSequence: last.chainSequence, dataHash: last.dataHash }
			: null;
	}
}

interface ChainStateDocument extends ChainState {
	_id: typeof STATE_ID;
}

export class MongoChainState implements ChainStatePort {
	private readonly _state: Collection<ChainStateDocument>;

	constructor(db: Db) {
		this._state = db.collection<ChainStateDocument>(STATE);
	}

	async load(): Promise<ChainState> {
		const doc = await this._state.findOne({ _id: STATE_ID });
		return { verified: doc?.verified ?? null, anchored: doc?.anchored ?? null };
	}

	async save(state: ChainState): Promise<void> {
		await this._state.replaceOne(
			{ _id: STATE_ID },
			{ verified: state.verified, anchored: state.anchored },
			{ upsert: true }
		);
	}
}
