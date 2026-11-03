import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, jest } from "@jest/globals";
import { MarketEvent } from "@trading-model/contracts/market-events";
import {
	type ApiRoute,
	parseRequest,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import { CREATE_CALLBACK_ROUTE } from "../../packages/broker-message/src/adapters/inbound/messages.routes";
import { MessageManagerClient } from "../../packages/broker-message/src/adapters/outbound/message-manager-client";
import { DEFAULT_CALLBACK_PATH } from "../../packages/broker-message/src/application/services/broker-message";
import { AUDIT_API } from "../../services/audit-logger/src/adapters/inbound/http/api-routes";
import { BROKER_API } from "../../services/message-manager/src/adapters/inbound/api-routes";
import { SUBSCRIBE_SCHEMA } from "../../services/message-manager/src/adapters/inbound/validation/broker.schema";
import { resolveTarget } from "../../services/message-manager/src/application/services/address-resolver";
import { overTheWire } from "./support/broker-pipeline";

/**
 * The HTTP routes between the broker client (SDK) and message-manager, on
 * both legs. service-contracts.spec.ts checks the bodies but cuts the
 * network, so a route renamed on one side only (the 13.09 break: SDK on
 * `/subscribe`, message-manager on `/subscription`, no subscription ever
 * made) would still pass there.
 */

jest.mock("../../services/message-manager/src/config/address-manager", () => ({
	FIND_A_SERVICE: async () => ({ host: "10.0.0.2", port: 3000 }),
}));

const ROOT = join(__dirname, "../..");
const TOPIC =
	MarketEvent[Object.keys(MarketEvent)[0] as keyof typeof MarketEvent];

interface SentRequest {
	method: "POST" | "DELETE";
	url: string;
	body: unknown;
}

/** The real broker client of a service, every request recorded instead of sent. */
function recordingClient(callbackPath: string): {
	client: MessageManagerClient;
	sent: SentRequest[];
} {
	const sent: SentRequest[] = [];
	const record =
		(method: SentRequest["method"]) => async (url: string, body: unknown) => {
			sent.push({ method, url, body: overTheWire(body) });
		};
	const client = new MessageManagerClient(
		{ post: record("POST"), delete: record("DELETE") } as never,
		{
			callbackPath,
			instanceId: "routes-1",
			serviceName: "trader-trainer",
		} as never,
		{ findService: async () => ({ host: "10.0.0.1", port: 3000 }) } as never
	);
	return { client, sent };
}

/** The message-manager route serving this request, if any. */
function brokerRouteFor(request: SentRequest): ApiRoute | undefined {
	const { pathname } = new URL(request.url);
	return Object.values(BROKER_API).find(
		(route) => route.method === request.method && route.path === pathname
	);
}

/** Every MESSAGE_CALLBACK_PATH a deployment sets (compose and K8s). */
function deployedCallbackPaths(): string[] {
	const configDir = join(ROOT, "deploy/k8s/config");
	const files = [
		join(ROOT, "docker-compose.yml"),
		...readdirSync(configDir)
			.filter((file) => file.endsWith(".yaml"))
			.map((file) => join(configDir, file)),
	];
	const paths = new Set<string>();
	for (const file of files) {
		const text = readFileSync(file, "utf8");
		for (const match of text.matchAll(
			/MESSAGE_CALLBACK_PATH:\s*["']?([^"'\s]+)/g
		)) {
			paths.add(match[1]);
		}
	}
	return [...paths];
}

/** Path message-manager delivers to, from the subscription the SDK sent. */
async function deliveryPath(callbackPath: string): Promise<string> {
	const { client, sent } = recordingClient(callbackPath);
	await client.subscribe([TOPIC]);
	const parsed = SUBSCRIBE_SCHEMA.parse(sent[0].body);
	const url = await resolveTarget(
		parsed.serviceIdentity.serviceName,
		parsed.callbackPath
	);
	return new URL(url).pathname;
}

interface RouterLayer {
	route?: { methods: Record<string, boolean> };
	match: (path: string) => boolean;
}

describe("broker routes", () => {
	describe("message-manager serves every request of the broker client", () => {
		it("publish", async () => {
			const { client, sent } = recordingClient(DEFAULT_CALLBACK_PATH);
			await client.publish({}, {} as never);

			expect(sent).toHaveLength(1);
			expect(brokerRouteFor(sent[0])).toBe(BROKER_API.publish);
		});

		it.each([
			["subscribe", BROKER_API.subscribe],
			["unsubscribe", BROKER_API.unsubscribe],
		] as const)("%s, with a body its route accepts", async (action, expected) => {
			const { client, sent } = recordingClient(DEFAULT_CALLBACK_PATH);
			await client[action]([TOPIC]);

			expect(sent).toHaveLength(1);
			const route = brokerRouteFor(sent[0]);
			expect(route).toBe(expected);
			expect(parseRequest(expected, { body: sent[0].body }).success).toBe(true);
		});
	});

	describe("subscribers mount the path message-manager delivers to", () => {
		const callbackPaths = [
			...new Set([DEFAULT_CALLBACK_PATH, ...deployedCallbackPaths()]),
		];

		it("deployments set a callback path", () => {
			expect(deployedCallbackPaths().length).toBeGreaterThan(0);
		});

		it.each(
			callbackPaths
		)("broker-message callback route, MESSAGE_CALLBACK_PATH=%s", async (callbackPath) => {
			const path = await deliveryPath(callbackPath);
			const router = CREATE_CALLBACK_ROUTE(callbackPath) as unknown as {
				stack: RouterLayer[];
			};

			expect(
				router.stack.some(
					(layer) => layer.route?.methods.post && layer.match(path)
				)
			).toBe(true);
		});

		it("audit-logger, which keeps the default callback path", async () => {
			expect(await deliveryPath(DEFAULT_CALLBACK_PATH)).toBe(
				AUDIT_API.receive.path
			);
			expect(AUDIT_API.receive.method).toBe("POST");
		});
	});
});
