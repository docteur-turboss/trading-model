import type { DlqEntry } from "@trading-model/contracts/dlq-types";

/** Where dead-lettered messages go (ADR-0043). */
export interface DeadLetterStorePort {
	insert(entry: DlqEntry): Promise<void>;
}
