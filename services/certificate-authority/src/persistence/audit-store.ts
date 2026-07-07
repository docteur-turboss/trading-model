import { logger } from "@trading-model/common/config/logger";
import type { SerialNumber } from "@trading-model/common/domain/primitives";

import { AuditBuffer } from "./audit-buffer";
import { MongoAuditConnection } from "./mongo-audit-connection";

export interface AuditEntry {
	action: "sign" | "revoke" | "renew" | "rotate" | "ca_key_rotation";
	serviceId: string;
	serialNumber: SerialNumber;
	clientIdentity?: string;
	requestId?: string;
	success: boolean;
	errorMessage?: string;
	timestamp: Date;
}

export class AuditStore {
	private readonly _mongoConn: MongoAuditConnection;
	private readonly _buffer = new AuditBuffer();

	constructor(uri: string) {
		this._mongoConn = new MongoAuditConnection(uri);
		this._buffer.start(() => this._flush());
	}

	async connect(): Promise<void> {
		await this._mongoConn.connect();
	}

	async disconnect(): Promise<void> {
		await this._flush();
		this._buffer.stop();
		await this._mongoConn.disconnect();
	}

	async log(entry: AuditEntry): Promise<void> {
		if (!(await this._mongoConn.ensureMongo())) {
			this._buffer.buffer(entry);
			return;
		}
		const collection = this._mongoConn.collection;
		if (!collection) {
			this._buffer.buffer(entry);
			return;
		}
		try {
			await collection.insertOne(entry);
		} catch (err) {
			logger.error("AuditStore: MongoDB write failed — buffering entry", {
				context: { err },
			});
			this._buffer.buffer(entry);
		}
	}

	async save(entry: AuditEntry): Promise<void> {
		await this.log(entry);
	}

	async add(entry: AuditEntry): Promise<void> {
		await this.log(entry);
	}

	private async _flush(): Promise<void> {
		if (this._buffer.pendingCount === 0) {
			return;
		}
		if (!(await this._mongoConn.ensureMongo())) {
			return;
		}
		const collection = this._mongoConn.collection;
		if (!collection) {
			return;
		}
		const batch = this._buffer.drain();
		try {
			await collection.insertMany(batch, { ordered: false });
		} catch (err) {
			this._buffer.rebuffer(batch, err);
		}
	}
}
