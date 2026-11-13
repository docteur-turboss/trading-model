import { toMessageId } from "@trading-model/primitives/primitives";
import type {
	ClaimedEntry,
	LogPort,
	RetryLedgerPort,
} from "../../domain/ports/replay.port";
import type { DlqEntryRef } from "../../shared/types";

/** Maps claimed entries to the refs a replay batch takes; keeps `service` so the replay targets the failed subscriber. */
export function toEntryRefs(entries: ClaimedEntry[]): DlqEntryRef[] {
	return entries.map((entry) => ({
		id: toMessageId(entry.id),
		message: entry.message,
		service: entry.service,
	}));
}

/** Abandons the entries that exhausted their retries and logs how many. */
export async function abandonExhaustedEntries(
	retryLedger: RetryLedgerPort,
	logger: LogPort,
	source: string
): Promise<void> {
	const abandoned = await retryLedger.abandonExhaustedEntries();
	if (abandoned > 0) {
		logger.warn(`${source}: ${abandoned} entries abandoned after max retries`);
	}
}
