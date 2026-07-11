import type { Request } from "express";

import { ServiceId } from "../domain/primitives";
import { extractServiceName } from "../utils/spiffe";
import { DEFAULT_ACL } from "./acl-config";
import { ResponseException } from "./response-exception";

export class AclService {
	constructor(
		private readonly _acl: Record<string, readonly ServiceId[]> = DEFAULT_ACL
	) {}

	resolveCallerName(req: Request): string {
		const callerIdentity = req.clientIdentity;
		if (!callerIdentity) {
			this._throwUnauthorized("Unauthenticated");
		}
		const callerName = extractServiceName(callerIdentity);
		if (!callerName) {
			this._throwForbidden("Could not resolve caller identity");
		}
		return callerName;
	}

	authorizeCaller(
		callerName: string,
		targetService: string,
		allowedCallers?: readonly ServiceId[]
	): void {
		const allowed = this._getAllowedCallers(targetService, allowedCallers);
		if (
			!(
				allowed.includes(ServiceId.of("*")) ||
				allowed.includes(ServiceId.of(callerName))
			)
		) {
			this._throwForbidden(
				`"${callerName}" is not authorized to access "${targetService}"`
			);
		}
	}

	private _getAllowedCallers(
		targetService: string,
		allowedCallers?: readonly ServiceId[]
	): readonly ServiceId[] {
		const allowed = allowedCallers ?? this._acl[targetService];
		if (!allowed) {
			this._throwForbidden(`No authorization policy for "${targetService}"`);
		}
		return allowed;
	}

	private _throwUnauthorized(message: string): never {
		throw ResponseException(JSON.stringify({ error: message })).unauthorized();
	}

	private _throwForbidden(reason: string): never {
		throw ResponseException(
			JSON.stringify({ error: "Forbidden", reason })
		).forbidden();
	}
}
