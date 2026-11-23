import { extractCanonicalServiceName } from "@trading-model/common/utils/spiffe";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ApiRouteHandler } from "@trading-model/http/api-route/mount-route";
import { sendResponse } from "@trading-model/http/response-exception";
import type { Request } from "express";
import type { RiskExecution } from "../../application/risk-execution";
import type { KillTarget } from "../../domain/accounting";
import type { RISK_API } from "./api-routes";

/** Callers by route (ADR-0064 §1): the ACL lets them in, each route keeps its own. */
const OPERATOR = "risk-execution";
const GATEWAY = "api-gateway";

const callerOf = (req: Request): string | null => {
	const identity = (req as Request & { clientIdentity?: string })
		.clientIdentity;
	return identity?.includes("spiffe://")
		? String(extractCanonicalServiceName(identity))
		: null;
};
/** API key name (ADR-0059): `x-actor`, trusted only from the gateway, which sets it. */
const actorOf = (req: Request): string | null => {
	const actor = req.headers?.[HTTP_HEADERS.X_ACTOR];
	return callerOf(req) === GATEWAY && typeof actor === "string" && actor
		? actor
		: null;
};
const killTarget = (body: {
	scope: "global" | "symbol";
	symbol?: string;
}): KillTarget | null =>
	body.scope === "global"
		? { scope: "global" }
		: body.symbol
			? { scope: "symbol", symbol: body.symbol }
			: null;
const scopeError = () =>
	sendResponse(
		{ error: "symbol is required for scope symbol" },
		HTTP_STATUS.BAD_REQUEST
	);
const forbidden = (req: Request, ...allowed: string[]) =>
	allowed.includes(callerOf(req) ?? "")
		? null
		: sendResponse(
				{
					error: "Forbidden",
					reason: allowed.length
						? `only ${allowed.join(", ")} may call this route`
						: "no caller is allowed on this route yet",
				},
				HTTP_STATUS.FORBIDDEN
			);

type Handler<Key extends keyof typeof RISK_API> = ApiRouteHandler<
	(typeof RISK_API)[Key]
>;

/**
 * @param decisionConsumers identities allowed to send intents: none until the
 * decision consumer exists, with its own identity and ACL entry (ADR-0049 §1.3).
 */
export function createHandlers(
	risk: RiskExecution,
	emitMetrics: (outcome: string) => void,
	decisionConsumers: readonly string[] = []
) {
	const intent: Handler<"intent"> = async ({ body }, req) => {
		const denied = forbidden(req, ...decisionConsumers);
		if (denied) {
			return denied;
		}
		const result = await risk.submitIntent(body);
		emitMetrics(
			result.status === "rejected" ? `rejected:${result.reason}` : result.status
		);
		return sendResponse(result, HTTP_STATUS.OK);
	};
	const cancel: Handler<"cancel"> = async ({ params }, req) => {
		const denied = forbidden(req, ...decisionConsumers, OPERATOR);
		if (denied) {
			return denied;
		}
		const status = await risk.cancel(params.clientOrderId);
		return status === "not_found"
			? sendResponse({ error: "Unknown order" }, HTTP_STATUS.NOT_FOUND)
			: sendResponse({ status }, HTTP_STATUS.OK);
	};
	const position: Handler<"position"> = ({ params }, req) =>
		forbidden(req, ...decisionConsumers) ??
		sendResponse(
			{
				symbol: params.symbol,
				quantity: risk.status().positions[params.symbol] ?? 0,
			},
			HTTP_STATUS.OK
		);
	const adminStatus: Handler<"adminStatus"> = (_in, req) =>
		forbidden(req, OPERATOR) ?? sendResponse(risk.status(), HTTP_STATUS.OK);
	const adminEngage: Handler<"adminEngage"> = async ({ body }, req) => {
		const actor = actorOf(req);
		if (!actor) {
			return sendResponse(
				{
					error: "Forbidden",
					reason: "only api-gateway, for a named API key, may call this route",
				},
				HTTP_STATUS.FORBIDDEN
			);
		}
		const target = killTarget(body);
		if (!target) {
			return scopeError();
		}
		await risk.engage(target, body.reason, actor);
		return sendResponse({ status: "engaged" as const }, HTTP_STATUS.OK);
	};
	const adminRearm: Handler<"adminRearm"> = async ({ body }, req) => {
		const actor = actorOf(req);
		if (!actor) {
			return sendResponse(
				{
					error: "Forbidden",
					reason: "only api-gateway, for a named API key, may call this route",
				},
				HTTP_STATUS.FORBIDDEN
			);
		}
		const target = killTarget(body);
		if (!target) {
			return scopeError();
		}
		try {
			await risk.rearm(target, body.reason, actor);
		} catch (error) {
			return sendResponse(
				{ error: error instanceof Error ? error.message : "refused" },
				HTTP_STATUS.FORBIDDEN
			);
		}
		return sendResponse({ status: "rearmed" as const }, HTTP_STATUS.OK);
	};
	return { intent, cancel, position, adminStatus, adminEngage, adminRearm };
}
