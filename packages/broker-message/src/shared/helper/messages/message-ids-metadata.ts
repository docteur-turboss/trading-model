import {
	type CorrelationId,
	toCorrelationId,
} from "@trading-model/common/domain/primitives";

import { IDS_METADATA_PREDICATE } from "./message.schema";

export class MessageIdsMetadata {
	private _causationId?: CorrelationId;
	private _correlationId?: CorrelationId;

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
	): this {
		if (context === null) {
			this._causationId = undefined;
			this._correlationId = undefined;
			return this;
		}

		if (context.causationId) {
			IDS_METADATA_PREDICATE.parse(context.causationId);
			this._causationId = toCorrelationId(context.causationId);
		}

		if (context.correlationId) {
			IDS_METADATA_PREDICATE.parse(context.correlationId);
			this._correlationId = toCorrelationId(context.correlationId);
		}

		return this;
	}

	public assignFromData(data: {
		causationId?: CorrelationId;
		correlationId?: CorrelationId;
	}): void {
		this._causationId = data.causationId;
		this._correlationId = data.correlationId;
	}
}
