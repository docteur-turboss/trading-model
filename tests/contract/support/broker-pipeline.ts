import type { Message } from "@trading-model/contracts/message-types";
import { toJsonWire } from "@trading-model/http/infrastructure/json-wire";
import { MessageManagerClient } from "../../../packages/broker-message/src/adapters/outbound/message-manager-client";
import {
	PUBLISH_SCHEMA,
	REPUBLISH_SCHEMA,
} from "../../../services/message-manager/src/adapters/inbound/validation/broker.schema";
import { HttpMessageDelivery } from "../../../services/message-manager/src/adapters/outbound/http-message-delivery";
import { Dispatcher } from "../../../services/message-manager/src/application/services/dispatcher";
import { createMessage } from "../../../services/message-manager/src/domain/message-factory";

/** JSON round trip with the HttpClient body replacer: what actually travels. */
export function overTheWire<TValue>(value: unknown): TValue {
	return JSON.parse(JSON.stringify(value, toJsonWire)) as TValue;
}

/** One HTTP request a service sent to message-manager (publish: `POST /message`). */
export interface PublishedRequest {
	method: "POST" | "DELETE";
	url: string;
	body: unknown;
}

/**
 * The real broker client of a service, with only the network cut: every
 * request is recorded (over the wire) instead of being sent.
 */
export function createRecordingBrokerClient(
	serviceName: string,
	callbackPath = "message"
): {
	client: MessageManagerClient;
	requests: PublishedRequest[];
} {
	const requests: PublishedRequest[] = [];
	const record =
		(method: PublishedRequest["method"]) =>
		async (url: string, body: unknown) => {
			requests.push({ method, url, body: overTheWire(body) });
		};
	const addressManager = {
		findService: async () => ({ host: "10.0.0.1", port: 3000 }),
		recordCallSuccess: () => undefined,
		recordCallFailure: () => undefined,
	};
	const client = new MessageManagerClient(
		{ post: record("POST"), delete: record("DELETE") } as never,
		{ callbackPath, instanceId: "contract-1", serviceName } as never,
		addressManager as never
	);
	return { client, requests };
}

/**
 * message-manager between publisher and subscriber: validates the publish
 * request like `POST /message`, builds the message like the dispatcher, and
 * returns the message it built and the body `HttpMessageDelivery` posts to
 * every subscriber.
 */
export async function relayThroughMessageManager(
	request: PublishedRequest
): Promise<
	| {
			accepted: true;
			message: Message;
			delivered: unknown;
			/** Replay only: the services the journal entry was written for. */
			journaledFor?: { services: readonly string[]; onlyFor?: string };
	  }
	| { accepted: false; error: string }
> {
	const replay = request.url.endsWith("/message/replay");
	if (!(replay || request.url.endsWith("/message"))) {
		return { accepted: false, error: `published to ${request.url}` };
	}
	let message: Message;
	let journaledFor:
		| { services: readonly string[]; onlyFor?: string }
		| undefined;
	if (replay) {
		const parsedReplay = REPUBLISH_SCHEMA.safeParse(request.body);
		if (!parsedReplay.success) {
			return { accepted: false, error: parsedReplay.error.message };
		}
		// message-manager's real dispatcher, over a journal that records its write.
		await new Dispatcher({
			registry: {} as never,
			journal: {
				append: async (
					_m: Message,
					services: readonly string[],
					onlyFor?: string
				) => {
					journaledFor = { services, onlyFor };
				},
			} as never,
		}).republish(parsedReplay.data.message as never, parsedReplay.data.service);
		message = parsedReplay.data.message as never;
	} else {
		const parsed = PUBLISH_SCHEMA.safeParse(request.body);
		if (!parsed.success) {
			return { accepted: false, error: parsed.error.message };
		}
		message = createMessage(parsed.data.payload, parsed.data.metadata as never);
	}
	let delivered: unknown;
	const delivery = new HttpMessageDelivery(
		{
			post: async (_url: string, body: unknown) => {
				delivered = overTheWire(body);
			},
		} as never,
		{} as never
	);
	await delivery.send({
		url: "https://10.0.0.2:3000/message",
		message,
		context: { deliveryAttempt: 1 },
	} as never);
	return { accepted: true, message, delivered, journaledFor };
}
