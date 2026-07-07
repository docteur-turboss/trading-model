import {
	type CorrelationId,
	toCorrelationId,
} from "@trading-model/common/domain/primitives";
import { IDS_METADATA_PREDICATE } from "./message.schema";

export interface ChainingMetadata {
	readonly causationId: CorrelationId | undefined;
	readonly correlationId: CorrelationId | undefined;
	setIds(context: { causationId?: string; correlationId?: string }): void;
	toJSON(): { causationId?: CorrelationId; correlationId?: CorrelationId };
}

export class MessageChainingMetadata implements ChainingMetadata {
	private _causationId?: CorrelationId;
	private _correlationId?: CorrelationId;

	public constructor(data: { causationId?: string; correlationId?: string }) {
		this.setIds(data);
	}

	public get causationId(): CorrelationId | undefined {
		return this._causationId;
	}

	public get correlationId(): CorrelationId | undefined {
		return this._correlationId;
	}

	public setIds(context: {
		causationId?: string;
		correlationId?: string;
	}): void {
		if (context.causationId) {
			IDS_METADATA_PREDICATE.parse(context.causationId);
			this._causationId = toCorrelationId(context.causationId);
		}
		if (context.correlationId) {
			IDS_METADATA_PREDICATE.parse(context.correlationId);
			this._correlationId = toCorrelationId(context.correlationId);
		}
	}

	public toJSON(): {
		causationId?: CorrelationId;
		correlationId?: CorrelationId;
	} {
		return {
			causationId: this._causationId,
			correlationId: this._correlationId,
		};
	}
}

export class NullMessageChainingMetadata implements ChainingMetadata {
	public get causationId(): CorrelationId | undefined {
		return undefined;
	}

	public get correlationId(): CorrelationId | undefined {
		return undefined;
	}

	public setIds(_context: {
		causationId?: string;
		correlationId?: string;
	}): void {
	}

	public toJSON(): {
		causationId?: CorrelationId;
		correlationId?: CorrelationId;
	} {
		return {};
	}
}
