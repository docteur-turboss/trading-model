import { logger } from "@trading-model/common/config/logger";

import { AuditBuffer } from "./audit-buffer";
import { MongoAuditConnection } from "./mongo-audit-connection";

export interface AuditEntry {
	action: "sign" | "revoke" | "renew" | "rotate" | "ca_key_rotation";
	serviceId: string;
	serialNumber: string;
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

	async add(entry: AuditEntry): Promise<void> {
		await this.log(entry);
	}

	async save(entry: AuditEntry): Promise<void> {
		await this.log(entry);
	}

	async log(entry: AuditEntry): Promise<void> {
		if (!((await this._mongoConn.ensureMongo()) && this._mongoConn.collection)) {
			this._buffer.buffer(entry);
			return;
		}
		try {
			await this._mongoConn.collection!.insertOne(entry);
		} catch (err) {
			logger.error("AuditStore: MongoDB write failed — buffering entry", { context: { err } });
			this._buffer.buffer(entry);
		}
	}

	private async _flush(): Promise<void> {
		if (this._buffer.pendingCount === 0) {
			return;
		}
		if (!((await this._mongoConn.ensureMongo()) && this._mongoConn.collection)) {
			return;
		}
		const batch = this._buffer.drain();
		try {
			await this._mongoConn.collection!.insertMany(batch, { ordered: false });
		} catch (err) {
			this._buffer.rebuffer(batch, err);
		}
	}
}
