import { afterAll, describe, expect, it, jest } from "@jest/globals";
import {
	CALLER,
	computeDlqSignature,
	e2eTestTimeout,
	meshRequest,
} from "./helpers";

/**
 * A message no subscriber can take goes the real dead-letter path: message-
 * manager dead-letters it, sends it to dlq-service (signed `POST /dlq`), which
 * stores it in MongoDB; a replay publishes it again through message-manager,
 * which dead-letters it again (ADR-0048). dlq-service publishes each step on
 * the bus (`dlq.*` topics), where audit-logger records it.
 *
 * The subscriber is the trainer's identity with a callback path it does not
 * serve (404), and the message lives 1 ms: its first failed delivery
 * dead-letters it (TTL_EXPIRED) instead of retrying for minutes.
 */

jest.setTimeout(e2eTestTimeout * 2);

const MM = "https://message-manager:3000";
const DLQ = "https://dlq-service:3000";
const AUDIT = "https://audit-logger:3000";
const HMAC_SECRET = process.env.DLQ_AUTH_HMAC_SECRET ?? "test-hmac-secret";
/** Listed in DLQ_ALLOWED_SERVICES by the E2E overlay. */
const SERVICE_NAME = "e2e-test-runner";
const TOPIC = `e2e.dead-letter.run-${Date.now()}`;
const INSTANCE_ID = "e2e-dead-letter-sink";

interface StoredEntry {
	id: string;
	topic: string | null;
	reason: string | null;
	message: { metadata: { topic: string }; payload: unknown };
}

function signedDlqRequest(
	method: string,
	path: string,
	query = ""
): ReturnType<typeof meshRequest> {
	const timestamp = Date.now().toString();
	return meshRequest(CALLER.message, `${DLQ}${path}${query}`, {
		method,
		headers: {
			"x-service-name": SERVICE_NAME,
			"x-timestamp": timestamp,
			"x-signature": computeDlqSignature({
				serviceName: SERVICE_NAME,
				secret: HMAC_SECRET,
				body: undefined,
				timestamp,
				method,
				path: `${path}${query}`,
			}),
		},
	});
}

function storedEntries(): StoredEntry[] {
	const { status, body } = signedDlqRequest(
		"GET",
		"/dlq",
		`?topic=${TOPIC}&limit=100`
	);
	expect(status).toBe(200);
	return (JSON.parse(body) as { entries: StoredEntry[] }).entries;
}

/** Payloads audit-logger recorded for a DLQ event about this run's topic. */
function auditedPayloads(event: string): Record<string, unknown>[] {
	const { status, body } = meshRequest(
		CALLER.scraper,
		`${AUDIT}/events?topic=${event}&limit=1000`
	);
	expect(status).toBe(200);
	return (JSON.parse(body) as { docs: Array<{ payload: unknown }> }).docs
		.map((doc) => doc.payload as Record<string, unknown>)
		.filter((payload) => payload?.topic === TOPIC);
}

async function eventually<T>(
	description: string,
	probe: () => T | undefined
): Promise<T> {
	const deadline = Date.now() + e2eTestTimeout;
	while (Date.now() < deadline) {
		const value = probe();
		if (value !== undefined) {
			return value;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	throw new Error(`Timed out waiting for ${description}`);
}

describe("Dead-letter flow E2E", () => {
	afterAll(() => {
		meshRequest(CALLER.trainer, `${MM}/subscribe`, {
			method: "DELETE",
			body: { topic: TOPIC, instanceId: INSTANCE_ID },
		});
	});

	it("subscribes a subscriber that cannot take the topic", () => {
		const { status } = meshRequest(CALLER.trainer, `${MM}/subscribe`, {
			method: "POST",
			body: {
				topic: TOPIC,
				callbackPath: "e2e-no-such-route",
				serviceIdentity: {
					serviceName: "trader-trainer",
					instanceId: INSTANCE_ID,
				},
			},
		});
		expect(status).toBeLessThan(300);
	});

	it("stores the undeliverable message in dlq-service", async () => {
		const { status } = meshRequest(CALLER.scraper, `${MM}/message`, {
			method: "POST",
			body: {
				payload: { e2e: "dead-letter" },
				metadata: {
					schemaVersion: "1.0.0",
					eventType: TOPIC,
					topic: TOPIC,
					publisher: {
						serviceName: "financial-scraper-service",
						instanceId: "e2e-publisher",
					},
					delivery: { mode: "at-least-once", ttl: 1 },
				},
			},
		});
		// 202: journaled, the delivery (and its dead-lettering) follows outside the request.
		expect(status).toBeLessThan(300);

		const [entry] = await eventually("the dead letter in dlq-service", () => {
			const entries = storedEntries();
			return entries.length > 0 ? entries : undefined;
		});
		expect(entry).toMatchObject({
			topic: TOPIC,
			reason: "TTL_EXPIRED",
			message: {
				metadata: { topic: TOPIC },
				payload: { e2e: "dead-letter" },
			},
		});
	});

	it("replays it through message-manager", async () => {
		const { status, body } = signedDlqRequest(
			"POST",
			"/dlq/replay",
			`?topic=${TOPIC}`
		);
		expect(status).toBe(200);
		expect(JSON.parse(body)).toMatchObject({ replayed: 1, failed: 0 });

		// The subscriber still cannot take it: the replay is dead-lettered anew.
		const entries = await eventually("the replayed dead letter", () => {
			const all = storedEntries();
			return all.length > 1 ? all : undefined;
		});
		expect(entries).toHaveLength(2);
		for (const entry of entries) {
			expect(entry.message.payload).toEqual({ e2e: "dead-letter" });
		}
	});

	it("records the dead letters and the replay in the audit trail", async () => {
		const added = await eventually("dlq.entry.added in audit-logger", () => {
			const payloads = auditedPayloads("dlq.entry.added");
			return payloads.length > 1 ? payloads : undefined;
		});
		expect(added).toHaveLength(2);
		expect(added[0]).toMatchObject({ reason: "TTL_EXPIRED" });

		const replays = await eventually(
			"dlq.replay.completed in audit-logger",
			() => {
				const payloads = auditedPayloads("dlq.replay.completed");
				return payloads.length > 0 ? payloads : undefined;
			}
		);
		expect(replays).toEqual([
			expect.objectContaining({ replayed: 1, failed: 0 }),
		]);
	});
});
