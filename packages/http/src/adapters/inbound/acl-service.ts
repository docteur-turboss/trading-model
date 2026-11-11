import { extractCanonicalServiceName } from "@trading-model/common/utils/spiffe";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { Request } from "express";
import { mtlsDenialsTotal } from "../../infrastructure/outbound-metrics";
import { DEFAULT_ACL } from "./acl-config";
import { ResponseException } from "./response-exception";

export class AclService {
	constructor(
		private readonly _acl: Record<string, readonly ServiceId[]> = DEFAULT_ACL
	) {}

	resolveCallerName(req: Request): ServiceId {
		const callerIdentity = req.clientIdentity;
		if (!callerIdentity) {
			this._throwUnauthorized("Unauthenticated");
		}
		const callerName = extractCanonicalServiceName(callerIdentity);
		if (!callerName) {
			this._throwForbidden(
				"caller_unresolved",
				"Could not resolve caller identity"
			);
		}
		return callerName;
	}

	authorizeCaller(
		callerName: ServiceId,
		targetService: ServiceId,
		allowedCallers?: readonly ServiceId[]
	): void {
		const allowed = this._getAllowedCallers(targetService, allowedCallers);
		if (
			!(allowed.includes(ServiceId.of("*")) || allowed.includes(callerName))
		) {
			this._throwForbidden(
				"caller_not_allowed",
				`"${callerName}" is not authorized to access "${targetService}"`
			);
		}
	}

	private _getAllowedCallers(
		targetService: ServiceId,
		allowedCallers?: readonly ServiceId[]
	): readonly ServiceId[] {
		const allowed = allowedCallers ?? this._acl[targetService];
		if (!allowed) {
			this._throwForbidden(
				"no_policy",
				`No authorization policy for "${targetService}"`
			);
		}
		return allowed;
	}

	private _throwUnauthorized(message: string): never {
		mtlsDenialsTotal.inc({ reason: "unauthenticated" });
		throw ResponseException({ error: message }).unauthorized();
	}

	private _throwForbidden(code: string, reason: string): never {
		mtlsDenialsTotal.inc({ reason: code });
		throw ResponseException({ error: "Forbidden", reason }).forbidden();
	}
}
