import type { DedupConfig } from "./messaging-types";

export interface IDedupOps {
	tryDeduplicate(params: DedupConfig): Promise<boolean>;
}
