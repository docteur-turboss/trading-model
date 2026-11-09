import { extractCanonicalServiceName } from "@trading-model/common/utils/spiffe";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import type { Request } from "express";

const GATEWAY = "api-gateway";

/**
 * Name of the API key behind the request (ADR-0059): the `x-actor` header,
 * read only when the mTLS caller (SVID) is api-gateway, which strips the
 * client's own header and sets it. From any other caller it is ignored: null.
 */
export function actorOf(req: Request): string | null {
	// Set by the mTLS middleware from the peer certificate.
	const identity = (req as Request & { clientIdentity?: string })
		.clientIdentity;
	const caller = identity
		? extractCanonicalServiceName(String(identity))
		: null;
	const actor = req.headers[HTTP_HEADERS.X_ACTOR];
	return String(caller) === GATEWAY && typeof actor === "string" && actor
		? actor
		: null;
}
