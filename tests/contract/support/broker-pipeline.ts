import type { Message } from "@trading-model/contracts/message-types";
import { toJsonWire } from "@trading-model/http/infrastructure/json-wire";
import { MessageManagerClient } from "../../../packages/broker-message/src/adapters/outbound/message-manager-client";
import { PUBLISH_SCHEMA } from "../../../services/message-manager/src/adapters/inbound/validation/broker.schema";
import { HttpMessageDelivery } from "../../../services/message-manager/src/adapters/outbound/http-message-delivery";
import { createMessage } from "../../../services/message-manager/src/domain/message-factory";

/** JSON round trip with the HttpClient body replacer: what actually travels. */
export function overTheWire<TValue>(value: unknown): TValue {
	return JSON.parse(JSON.stringify(value, toJsonWire)) as TValue;
}

/** Body of one HTTP POST a publisher sent to message-manager `/message`. */
export interface PublishedRequest {
	url: string;
	body: unknown;
}

/**
 * The real broker client of a publishing service, with only the network cut:
 * every POST is recorded (over the wire) instead of being sent.
 */
export function createRecordingBrokerClient(serviceName: string): {
	client: MessageManagerClient;
	requests: PublishedRequest[];
} {
	const requests: PublishedRequest[] = [];
	const httpClient = {
		post: async (url: string, body: unknown) => {
			requests.push({ url, body: overTheWire(body) });
		},
	};
	const addressManager = {
		findService: async () => ({ host: "10.0.0.1", port: 3000 }),
		recordCallSuccess: () => undefined,
		recordCallFailure: () => undefined,
	};
	const client = new MessageManagerClient(
		httpClient as never,
		{ callbackPath: "message", instanceId: "contract-1", serviceName } as never,
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
	| { accepted: true; message: Message; delivered: unknown }
	| { accepted: false; error: string }
> {
	if (!request.url.endsWith("/message")) {
		return { accepted: false, error: `published to ${request.url}` };
	}
	const parsed = PUBLISH_SCHEMA.safeParse(request.body);
	if (!parsed.success) {
		return { accepted: false, error: parsed.error.message };
	}

	const message: Message = createMessage(
		parsed.data.payload,
		parsed.data.metadata as never
	);
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
	return { accepted: true, message, delivered };
}
