import type { DlqEntry } from "@trading-model/contracts/dlq-types";

/** Where dead-lettered messages go (ADR-0048). */
export interface DeadLetterStorePort {
	insert(entry: DlqEntry): Promise<void>;
}
