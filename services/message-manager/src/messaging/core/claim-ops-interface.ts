import type { ClaimParams } from "./messaging-types";

export interface IClaimOps {
	claimPendingMessages(params: ClaimParams): Promise<number>;
}
