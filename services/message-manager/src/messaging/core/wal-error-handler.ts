import type { WalEntryParser } from "./wal-entry-parser";
import { WalFlushErrorHandler } from "./wal-flush-error-handler";

export type WalErrorAction = "retry" | "memory-buffer" | "abort";

export class WalErrorHandler {
	private readonly _delegate: WalFlushErrorHandler;

	constructor(
		private readonly _walKey: () => string,
		_entryParser: WalEntryParser
	) {
		this._delegate = new WalFlushErrorHandler(_entryParser);
	}

	async handleFlushError(
		raw: string[],
		consecutiveErrors: number
	): Promise<WalErrorAction> {
		return this._delegate.handle(raw, consecutiveErrors, this._walKey());
	}
}
