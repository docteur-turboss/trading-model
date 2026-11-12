import { access, constants } from "node:fs/promises";
import type { TlsEnvVars } from "@trading-model/common/config/tls-paths";
import { withTimeout } from "@trading-model/common/utils/retry";
import { HEALTH_STATUS_OK } from "@trading-model/http/adapters/inbound/response-exception";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { RequestHandler } from "express";

export interface ReadinessCheck {
	name: string;
	check: () => Promise<boolean> | boolean;
}

/**
 * Local readiness check: the SVID (key, certificate, trust bundle) is readable,
 * so the pod can make mTLS calls. Depends on no other service.
 */
export function svidReadinessCheck(env: TlsEnvVars): ReadinessCheck {
	return {
		name: "svid",
		check: async () => {
			await Promise.all(
				[env.TLS_KEY_PATH, env.TLS_CERT_PATH, env.TLS_CA_PATH].map((path) =>
					access(path, constants.R_OK)
				)
			);
			return true;
		},
	};
}

/** Per-check bound, under the 3 s `timeoutSeconds` of the K8s readiness probes. */
const CHECK_TIMEOUT_MS = DurationMs.of(2000);

/**
 * Mounts a dependency-aware readiness handler at `/health/ready`.
 * Runs every check in parallel, each bounded by `timeoutMs` (a check that
 * throws or times out is "error"). Returns 200 `{ status: "ok" }` when every
 * check passes, otherwise 503 with the per-dependency results. `/ping` stays
 * a pure liveness endpoint.
 */
export function createReadinessHandler(
	checks: ReadinessCheck[],
	timeoutMs: DurationMs = CHECK_TIMEOUT_MS
): RequestHandler {
	return async (_req, res) => {
		const outcomes = await Promise.allSettled(
			checks.map((check) =>
				withTimeout(Promise.resolve().then(check.check), timeoutMs)
			)
		);
		const results: Record<string, "ok" | "error"> = {};
		checks.forEach((check, index) => {
			const outcome = outcomes[index];
			results[check.name] =
				outcome.status === "fulfilled" && outcome.value ? "ok" : "error";
		});
		if (Object.values(results).every((result) => result === "ok")) {
			res.json({ status: HEALTH_STATUS_OK, checks: results });
			return;
		}
		res.status(503).json({ status: "error", checks: results });
	};
}
