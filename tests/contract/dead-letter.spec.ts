import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseRequest } from "@trading-model/http/adapters/inbound/api-route/api-route";
import { DLQ_API } from "../../services/dlq-service/src/adapters/inbound/api-routes";
import { serviceAuth } from "../../services/dlq-service/src/adapters/inbound/auth";
import { checkEntryAcceptable } from "../../services/dlq-service/src/adapters/inbound/dlq-validator";
import { HttpDeadLetterStore } from "../../services/message-manager/src/adapters/outbound/http-dead-letter-store";
import { HttpMessageDelivery } from "../../services/message-manager/src/adapters/outbound/http-message-delivery";
import { createMessage } from "../../services/message-manager/src/domain/message-factory";
import { FileDlqRepository } from "../../services/message-manager/src/infrastructure/fallback/dlq-repository";

/**
 * Dead-letter contract: message-manager → dlq-service (ADR-0019, ADR-0021).
 *
 * message-manager's real delivery adapter writes a dead letter to its real
 * file repository; each line must pass dlq-service's real `POST /dlq`
 * validation (its registry entry, then the size and storage checks), which is
 * how an operator replays it (message-bus runbook).
 * The two sides drifted once: message-manager wrote `timestamp` as epoch
 * milliseconds while dlq-service only took a string.
 *
 * message-manager sends each dead letter to dlq-service itself
 * (`HttpDeadLetterStore`): its signed request must pass dlq-service's real
 * `serviceAuth` (caller allowed, HMAC over the parsed body) and `POST /dlq`.
 */

jest.mock("../../services/message-manager/src/config/metrics", () => ({
	MESSAGES_DLQ_TOTAL: { inc: () => undefined },
	MESSAGES_DLQ_ERROR_TOTAL: { inc: () => undefined },
}));
jest.mock("../../services/dlq-service/src/infrastructure/config/env", () => ({
	ENV: { DLQ_ALLOWED_SERVICES: "message-manager,admin" },
	resolveAuthHmacSecret: () => "contract-test-hmac-secret",
}));
jest.mock("../../services/dlq-service/src/config/db", () => ({
	isDbConnected: () => true,
}));

function sampleMessage() {
	return createMessage({ close: 101.5 }, {
		topic: "market.candles.fetch",
		publisher: "financial-scraper-service",
	} as never);
}

const span = {
	setAttribute: () => span,
	setStatus: () => span,
	recordException: () => undefined,
	end: () => undefined,
} as never;

describe("dead-letter contract: message-manager → dlq-service", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "dead-letter-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	async function deadLettersWritten(
		reasons: Array<{ reason: string; deliveryAttempt: number }>
	): Promise<unknown[]> {
		const file = join(dir, "dead-letter-queue.jsonl");
		const delivery = new HttpMessageDelivery(
			{} as never,
			new FileDlqRepository(file)
		);
		const message = sampleMessage();
		for (const { reason, deliveryAttempt } of reasons) {
			await delivery.markDeadLetter({
				message,
				reason,
				deliveryAttempt: deliveryAttempt as never,
			});
		}
		return readFileSync(file, "utf-8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
	}

	it.each([
		[
			"retries exhausted",
			{ reason: "MAX_RETRIES_EXCEEDED", deliveryAttempt: 10 },
		],
		["circuit breaker open", { reason: "OPEN", deliveryAttempt: 5 }],
	])(
		"%s: the dead letter is accepted by dlq-service",
		async (_label, input) => {
			const [line] = await deadLettersWritten([input]);

			const parsed = parseRequest(DLQ_API.addEntry, { body: line });

			expect(parsed).toMatchObject({
				success: true,
				input: {
					body: {
						reason: input.reason,
						deliveryAttempt: input.deliveryAttempt,
						timestamp: (line as { timestamp: number }).timestamp,
						message: (line as { message: unknown }).message,
					},
				},
			});
			const entry = (parsed as { input: { body: never } }).input.body;
			expect(checkEntryAcceptable(entry, span)).toEqual({ valid: true });
		}
	);

	it("message-manager's signed POST passes dlq-service's auth and validation", async () => {
		const sent: Array<{ url: string; body: unknown; headers: never }> = [];
		const store = new HttpDeadLetterStore({
			httpClient: {
				post: async (url: string, body: unknown, options: never) => {
					sent.push({
						url,
						body,
						headers: (options as { headers: never }).headers,
					});
				},
			} as never,
			resolveUrl: async () => "https://dlq-service:3000/dlq" as never,
			secret: "contract-test-hmac-secret",
		});
		const message = sampleMessage();

		await store.insert({
			message,
			reason: "MAX_RETRIES_EXCEEDED",
			deliveryAttempt: 10 as never,
			timestamp: Date.now() as never,
		});

		const [{ body, headers }] = sent;
		// What Express hands dlq-service: the JSON body, re-parsed.
		const req = {
			method: "POST",
			path: "/dlq",
			originalUrl: "/dlq",
			headers,
			body: JSON.parse(JSON.stringify(body)),
		};
		const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
		const next = jest.fn();
		serviceAuth(req as never, res as never, next);

		expect(res.status).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalled();
		expect(parseRequest(DLQ_API.addEntry, { body: req.body })).toMatchObject({
			success: true,
		});
	});
});
