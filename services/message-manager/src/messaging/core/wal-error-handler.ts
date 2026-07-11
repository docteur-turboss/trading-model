import type { SequenceNumber } from "@trading-model/common/domain/primitives";
import type { WalEntryParser } from "./wal-entry-parser";
import { WalFlushErrorHandler } from "./wal-flush-error-handler";

export enum WalErrorAction {
	Retry = "retry",
	MemoryBuffer = "memory-buffer",
	Abort = "abort",
}

export class WalErrorHandler {
	private readonly _delegate: WalFlushErrorHandler;

	constructor(
		private readonly _walKey: () => string,
		_entryParser: WalEntryParser
	) {
		this._delegate = new WalFlushErrorHandler(_entryParser);
	}

	handleFlushError(
		raw: string[],
		consecutiveErrors: SequenceNumber
	): Promise<WalErrorAction> {
		return this._delegate.handle(raw, consecutiveErrors, this._walKey());
	}
}
