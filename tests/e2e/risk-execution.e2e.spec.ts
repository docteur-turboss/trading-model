import { execFileSync } from "node:child_process";
import { afterAll, describe, expect, it, jest } from "@jest/globals";
import {
	CALLER,
	containerHealth,
	eventually,
	externalRequest,
	GATEWAY_API_KEY,
	meshRequest,
} from "./helpers";

/**
 * risk-execution as deployed (ADR-0064): paper mode, kill switch driven by the
 * operator through the gateway with a `risk:admin` key (runbook-risk-execution), state kept on
 * the `risk-execution-data` volume across a restart. Restarts a container:
 * runs serially with the other suites (maxWorkers: 1), like resilience.
 */

const RISK = "trading-risk-execution";
const DECIDER = "trading-decision-consumer";
const URL = "https://risk-execution:3000";
const RESTART_TIMEOUT_MS = 90_000;
const TRAINING_TIMEOUT_MS = 240_000;
const DECISION_TIMEOUT_MS = 180_000;
const SYMBOL = "BTCUSDT";
const SCOPE = { scope: "global", reason: "e2e" };

/** The API key name is the actor (ADR-0059): the overlay names it `e2e`. */
const admin = (path: string) =>
	externalRequest(`/v1/risk-execution/admin/${path}`, {
		method: "POST",
		body: SCOPE,
		headers: { "x-api-key": GATEWAY_API_KEY },
	});

jest.setTimeout(TRAINING_TIMEOUT_MS + DECISION_TIMEOUT_MS + 60_000);

interface Status {
	code: number;
	mode: string;
	ready: boolean;
	killSwitch: { global: string | null };
	openOrders: number;
	positions: Record<string, number>;
}

const status = (): Status => {
	const res = meshRequest(RISK, `${URL}/admin/status`);
	return { code: res.status, ...JSON.parse(res.body) };
};

/** Tells hold, no-room, rejected and missing-bar apart: the CI log shows none of them otherwise. */
function dumpDecisionDiagnostics(): void {
	const metrics = meshRequest(
		CALLER.gateway,
		"https://decision-consumer:3000/metrics"
	).body;
	console.error(
		metrics
			.split("\n")
			.filter((line) => /^decision_(intents|skipped)_total/.test(line))
			.join("\n")
	);
	for (const container of [DECIDER, RISK]) {
		console.error(
			execFileSync("docker", ["logs", "--tail", "40", container], {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			})
		);
	}
}

describe("risk-execution E2E", () => {
	// Leaves the stack clean even when an assertion failed mid-way.
	afterAll(async () => {
		await admin("kill-switch/rearm");
	});

	it("starts in paper mode and ready", () => {
		const res = status();
		expect(res.code).toBe(200);
		expect(res.mode).toBe("paper");
		expect(res.ready).toBe(true);
	});

	it("keeps an engaged kill switch across a restart, then re-arms", async () => {
		// A fresh volume starts engaged as state_missing: clear it so the engage below sets "e2e".
		await admin("kill-switch/rearm");
		const engaged = await admin("kill-switch");
		expect(engaged.status).toBe(200);
		expect(JSON.parse(engaged.body)).toEqual({ status: "engaged" });

		execFileSync("docker", ["restart", RISK], { stdio: "ignore" });
		const after = await eventually(
			"kill switch readable after restart",
			() => (containerHealth(RISK) === "healthy" ? status() : undefined),
			{ timeoutMs: RESTART_TIMEOUT_MS, intervalMs: 3000 }
		);
		expect(after.code).toBe(200);
		expect(after.killSwitch.global).toBe("e2e");

		const rearmed = await admin("kill-switch/rearm");
		expect(rearmed.status).toBe(200);
		expect(JSON.parse(rearmed.body)).toEqual({ status: "rearmed" });
		expect(status().killSwitch.global).toBeNull();
	});

	it.each([
		[
			"/intents",
			{
				decisionId: "e2e-denied",
				symbol: "BTCUSDT",
				side: "buy",
				quantity: 1,
				referencePrice: 100,
				referenceAt: 1,
				model: { symbol: "BTCUSDT", version: "e2e" },
			},
		],
	])("refuses %s from another service of the mesh", (path, body) => {
		const before = status();
		const res = meshRequest(CALLER.trainer, `${URL}${path}`, {
			method: "POST",
			body,
		});
		expect(res.status).toBe(403);
		const after = status();
		expect(after.openOrders).toBe(before.openOrders);
		expect(after.positions).toEqual(before.positions);
	});

	// ADR-0092: no hand-made intent. The model published by the trainer is promoted by recreating
	// decision-consumer (same compose project and files) with its `symbol@version`.
	it("opens a paper position from a promoted model", async () => {
		await admin("kill-switch/rearm");
		let version: string | undefined;
		const deadline = Date.now() + TRAINING_TIMEOUT_MS;
		while (!version && Date.now() < deadline) {
			const res = await externalRequest(`/v1/trader-trainer/models/${SYMBOL}`, {
				headers: { "x-api-key": GATEWAY_API_KEY },
			});
			version =
				res.status === 200
					? (JSON.parse(res.body) as { data: { version: string }[] }).data[0]
							?.version
					: undefined;
			if (!version) {
				await new Promise((resolve) => setTimeout(resolve, 5_000));
			}
		}
		expect(version).toBeDefined();

		const label = (key: string) =>
			execFileSync(
				"docker",
				["inspect", "--format", `{{index .Config.Labels "${key}"}}`, DECIDER],
				{ encoding: "utf8" }
			).trim();
		const files = label("com.docker.compose.project.config_files")
			.split(",")
			.flatMap((file) => ["-f", file]);
		execFileSync(
			"docker",
			[
				"compose",
				"-p",
				label("com.docker.compose.project"),
				"--project-directory",
				label("com.docker.compose.project.working_dir"),
				...files,
				"up",
				"-d",
				"--no-deps",
				"--force-recreate",
				"decision-consumer",
			],
			{
				stdio: "inherit",
				env: { ...process.env, PROMOTED_MODELS: `${SYMBOL}@${version}` },
			}
		);

		// `eventually` only returns a defined value: a non-zero position.
		try {
			await eventually(
				"a paper position opened by the promoted model",
				() => status().positions[SYMBOL] || undefined,
				{ timeoutMs: DECISION_TIMEOUT_MS, intervalMs: 5_000 }
			);
		} catch (error) {
			dumpDecisionDiagnostics();
			throw error;
		}
	});
});
