import {
	type CorrelationId,
	toCorrelationId,
} from "@trading-model/common/domain/primitives";
import { IDS_METADATA_PREDICATE } from "./message.schema";

export class MessageChainingMetadata {
	private _causationId?: CorrelationId;
	private _correlationId?: CorrelationId;

	public constructor(data?: { causationId?: string; correlationId?: string }) {
		this.setIds(data ?? {});
	}

	public get causationId(): CorrelationId | undefined {
		return this._causationId;
	}

	public get correlationId(): CorrelationId | undefined {
		return this._correlationId;
	}

	public setIds(
		context: {
			causationId?: string;
			correlationId?: string;
		} | null
	): void {
		if (context === null) {
			this._causationId = undefined;
			this._correlationId = undefined;
			return;
		}
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
