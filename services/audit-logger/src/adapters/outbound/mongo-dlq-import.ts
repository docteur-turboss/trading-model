import type { DeadStreams } from "@trading-model/broker-message/bus/dead-streams";
import type { Message } from "@trading-model/contracts/message-types";
import type { Collection } from "mongodb";
import type { MongoDlqImportReport } from "../../domain/mongo-dlq-import-report";

/** One entry of the retired MongoDB DLQ (`dlq_entries`). */
interface MongoDlqEntry {
	_id: unknown;
	topic?: string | null;
	service?: string | null;
	reason?: string | null;
	deliveryAttempt?: number;
	createdAt?: Date;
	status?: string;
	message?: Message;
}

/**
 * One-off, replayable copy of the MongoDB DLQ entries still waiting into the
 * dead streams (ADR-0073 release N+1). Idempotent per Mongo `_id`; a run is
 * complete when `written + alreadyImported === eligible` and `unusable` is empty.
 */
export async function importMongoDlq(
	collection: Collection<MongoDlqEntry>,
	streams: Pick<DeadStreams, "restore">
): Promise<MongoDlqImportReport> {
	const report: MongoDlqImportReport = {
		eligible: 0,
		written: 0,
		alreadyImported: 0,
		unusable: [],
	};
	for await (const entry of collection.find({ status: { $ne: "completed" } })) {
		report.eligible++;
		const topic = entry.topic ?? entry.message?.metadata?.topic;
		if (!(topic && entry.service && entry.message)) {
			report.unusable.push(String(entry._id));
			continue;
		}
		const written = await streams.restore(
			{
				topic,
				group: entry.service,
				attempts: entry.deliveryAttempt ?? 1,
				reason: entry.reason ?? "IMPORTED_FROM_MONGODB_DLQ",
				message: entry.message,
				deadAt: (entry.createdAt ?? new Date()).getTime(),
			},
			String(entry._id)
		);
		report[written ? "written" : "alreadyImported"]++;
	}
	return report;
}
