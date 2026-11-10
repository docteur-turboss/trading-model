import type { DlqEntry } from "@trading-model/contracts/dlq-types";
import type { Message } from "@trading-model/contracts/message-types";
import { parseRequest } from "@trading-model/http/adapters/inbound/api-route/api-route";
import { DLQ_API } from "../../../services/dlq-service/src/adapters/inbound/api-routes";
import { deliverEntry } from "../../../services/dlq-service/src/adapters/outbound/delivery-executor";
import { HttpMessageDelivery } from "../../../services/message-manager/src/adapters/outbound/http-message-delivery";
import { overTheWire, type PublishedRequest } from "./broker-pipeline";

/**
 * A message's dead-letter round trip: message-manager dead-letters it,
 * dlq-service takes it like `POST /dlq` and keeps what it parsed, then
 * replays it with its real delivery executor. Returns the stored entry and
 * the request the replay sends to message-manager.
 *
 * The spec mocks dlq-service's claim and retry bookkeeping (MongoDB).
 */
export async function deadLetterAndReplay(
	message: Message,
	service = "audit-logger"
): Promise<{ stored: DlqEntry; replay: PublishedRequest }> {
	const deadLetters: DlqEntry[] = [];
	const delivery = new HttpMessageDelivery({} as never, {
		insert: async (entry) => {
			deadLetters.push(entry);
		},
	});
	await delivery.markDeadLetter({
		service,
		message,
		reason: "MAX_RETRIES_EXCEEDED",
		deliveryAttempt: 10 as never,
	});

	const parsed = parseRequest(DLQ_API.addEntry, {
		body: overTheWire(deadLetters[0]),
	});
	if (!parsed.success) {
		throw new Error(
			`dlq-service rejected the dead letter: ${JSON.stringify(parsed.error)}`
		);
	}
	const stored = parsed.input.body as DlqEntry;

	const replays: PublishedRequest[] = [];
	await deliverEntry(
		{
			id: "entry-1",
			message: stored.message,
			service: stored.service,
		} as never,
		{
			instanceId: "dlq-service-1",
			batchId: "batch-1",
			messageManagerUrl: "https://10.0.0.3:3000",
			// dlq-service's claim and retry bookkeeping (MongoDB) around a replay.
			retryManager: { markRetried: async () => undefined },
			claimRelease: {},
			client: {
				post: async (url: string, body: unknown) => {
					replays.push({ method: "POST", url, body: overTheWire(body) });
				},
			},
		} as never
	);
	return { stored, replay: replays[0] as PublishedRequest };
}
