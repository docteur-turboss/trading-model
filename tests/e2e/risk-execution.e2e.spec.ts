import { execFileSync } from "node:child_process";
import { afterAll, describe, expect, it, jest } from "@jest/globals";
import { CALLER, containerHealth, eventually, meshRequest } from "./helpers";

/**
 * risk-execution as deployed (ADR-0064): paper mode, kill switch driven by the
 * operator from the container itself (runbook-risk-execution), state kept on
 * the `risk-execution-data` volume across a restart. Restarts a container:
 * runs serially with the other suites (maxWorkers: 1), like resilience.
 */

const RISK = "trading-risk-execution";
const URL = "https://risk-execution:3000";
const RESTART_TIMEOUT_MS = 90_000;
const SCOPE = { scope: "global", reason: "e2e", actor: "e2e" };

jest.setTimeout(RESTART_TIMEOUT_MS + 60_000);

interface Status {
	code: number;
	mode: string;
	ready: boolean;
	killSwitch: { global: string | null };
	openOrders: number;
	positions: unknown;
}

const status = (): Status => {
	const res = meshRequest(RISK, `${URL}/admin/status`);
	return { code: res.status, ...JSON.parse(res.body) };
};

describe("risk-execution E2E", () => {
	// Leaves the stack clean even when an assertion failed mid-way.
	afterAll(() => {
		meshRequest(RISK, `${URL}/admin/kill-switch/rearm`, {
			method: "POST",
			body: SCOPE,
		});
	});

	it("starts in paper mode and ready", () => {
		const res = status();
		expect(res.code).toBe(200);
		expect(res.mode).toBe("paper");
		expect(res.ready).toBe(true);
	});

	it("keeps an engaged kill switch across a restart, then re-arms", async () => {
		// A fresh volume starts engaged as state_missing: clear it so the engage below sets "e2e".
		meshRequest(RISK, `${URL}/admin/kill-switch/rearm`, {
			method: "POST",
			body: SCOPE,
		});
		const engaged = meshRequest(RISK, `${URL}/admin/kill-switch`, {
			method: "POST",
			body: SCOPE,
		});
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

		const rearmed = meshRequest(RISK, `${URL}/admin/kill-switch/rearm`, {
			method: "POST",
			body: SCOPE,
		});
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
});
