import { getLogger } from "@trading-model/contracts/logger-registry";
import type {
	ClaimReleasePort,
	DlqReplaySettings,
} from "../../domain/ports/replay.port";

export interface ClaimReleaseServiceDeps {
	claimRelease: ClaimReleasePort;
	settings: DlqReplaySettings;
}

export class ClaimReleaseService {
	constructor(private readonly _deps: ClaimReleaseServiceDeps) {}

	/** Frees the claims of this instance; entries stay queuable in MongoDB. */
	async releaseOwn(): Promise<void> {
		await this._deps.claimRelease.releaseClaimsByInstance(
			this._deps.settings.instanceId
		);
	}

	async releaseStale(staleThresholdMs?: number): Promise<void> {
		const released =
			await this._deps.claimRelease.releaseStaleClaims(staleThresholdMs);
		if (released > 0) {
			getLogger().info(
				`Released ${released} stale claims from previous instance`
			);
		}
	}
}
