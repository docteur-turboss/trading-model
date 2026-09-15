import { HEALTH_STATUS_OK } from "@trading-model/http/adapters/inbound/response-exception";
import type { RequestHandler } from "express";

export interface ReadinessCheck {
	name: string;
	check: () => Promise<boolean> | boolean;
}

/**
 * Mounts a dependency-aware readiness handler at `/health/ready`.
 * Returns 200 `{ status: "ok" }` when every check passes, otherwise 503 with
 * the per-dependency results. `/ping` stays a pure liveness endpoint.
 */
export function createReadinessHandler(
	checks: ReadinessCheck[]
): RequestHandler {
	return async (_req, res) => {
		const results: Record<string, "ok" | "error"> = {};
		let healthy = true;
		for (const check of checks) {
			try {
				const ok = await check.check();
				results[check.name] = ok ? "ok" : "error";
				if (!ok) {
					healthy = false;
				}
			} catch {
				results[check.name] = "error";
				healthy = false;
			}
		}
		if (healthy) {
			res.json({ status: HEALTH_STATUS_OK, checks: results });
			return;
		}
		res.status(503).json({ status: "error", checks: results });
	};
}
