import { normalizeServiceName } from "@trading-model/common/utils/spiffe";
import { resolveMtlsIdentity } from "@trading-model/http/adapters/inbound/mtls-identity";
import type { RequestHandler } from "express";

/** The caller's service, from its SPIFFE identity; `undefined` without one. */
export type CallerResolver = (
	req: Parameters<RequestHandler>[0]
) => string | undefined;

const MTLS_CALLER: CallerResolver = (req) => {
	const identity = resolveMtlsIdentity(req);
	return identity
		? String(normalizeServiceName(identity.serviceName))
		: undefined;
};

/**
 * Model weights leave the trainer only for the services named in
 * `MODEL_DOWNLOAD_CALLERS` (ADR-0022). The ACL admits callers per service,
 * and several services may call the trainer for other routes: this guard
 * narrows the weights route. Empty list: nobody.
 */
export const MODEL_DOWNLOAD_GUARD = (
	allowedCallers: readonly string[],
	resolveCaller: CallerResolver = MTLS_CALLER
): RequestHandler => {
	const allowed = new Set(
		allowedCallers.map((name) => String(normalizeServiceName(name)))
	);
	return (req, res, next) => {
		const caller = resolveCaller(req);
		if (!caller) {
			res.status(401).json({ error: "Client certificate required" });
			return;
		}
		if (!allowed.has(caller)) {
			res.status(403).json({
				error: "Model download not allowed",
				reason: `${caller} is not in MODEL_DOWNLOAD_CALLERS`,
			});
			return;
		}
		next();
	};
};
