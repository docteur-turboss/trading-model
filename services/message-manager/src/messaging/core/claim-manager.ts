import { ClaimExecutor } from "./claim-executor";

export class ClaimManager {
	private _executor: ClaimExecutor;

	constructor(prefix: string) {
		this._executor = new ClaimExecutor(prefix);
	}

	async claimPendingMessages(
		groupName: string,
		consumerId: string,
		minIdleMs = 60_000,
		count = 100
	): Promise<number> {
		return this._executor.claimPendingMessages(
			groupName,
			consumerId,
			minIdleMs,
			count
		);
	}

	async claimEntriesForRetry(options: {
		groupName: string;
		consumerId: string;
		minIdleMs?: number;
		count?: number;
	}): Promise<number> {
		return this._executor.claimEntriesForRetry(options);
	}
}
