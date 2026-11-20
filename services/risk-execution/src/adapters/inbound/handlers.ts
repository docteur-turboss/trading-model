import { extractCanonicalServiceName } from "@trading-model/common/utils/spiffe";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ApiRouteHandler } from "@trading-model/http/api-route/mount-route";
import { sendResponse } from "@trading-model/http/response-exception";
import type { Request } from "express";
import type { RiskExecution } from "../../application/risk-execution";
import type { RISK_API } from "./api-routes";

/** Callers by route (ADR-0064 §1): the ACL lets both in, each route keeps its own. */
const DECISION_CONSUMER = "trader-trainer";
const OPERATOR = "risk-execution";

const callerOf = (req: Request): string | null => {
	const identity = (req as Request & { clientIdentity?: string })
		.clientIdentity;
	return identity?.includes("spiffe://")
		? String(extractCanonicalServiceName(identity))
		: null;
};
const forbidden = (req: Request, ...allowed: string[]) =>
	allowed.includes(callerOf(req) ?? "")
		? null
		: sendResponse(
				{
					error: "Forbidden",
					reason: `only ${allowed.join(", ")} may call this route`,
				},
				HTTP_STATUS.FORBIDDEN
			);

type Handler<Key extends keyof typeof RISK_API> = ApiRouteHandler<
	(typeof RISK_API)[Key]
>;

export function createHandlers(
	risk: RiskExecution,
	emitMetrics: (outcome: string) => void
) {
	const intent: Handler<"intent"> = async ({ body }, req) => {
		const denied = forbidden(req, DECISION_CONSUMER);
		if (denied) {
			return denied;
		}
		const result = await risk.submitIntent(body);
		emitMetrics(
			result.status === "rejected" ? `rejected:${result.reason}` : result.status
		);
		return sendResponse(result, HTTP_STATUS.OK);
	};
	const price: Handler<"price"> = async ({ body }, req) => {
		const denied = forbidden(req, DECISION_CONSUMER);
		if (denied) {
			return denied;
		}
		await risk.observePrice(body.symbol, body.price, body.at);
		return sendResponse({ status: "recorded" as const }, HTTP_STATUS.OK);
	};
	const cancel: Handler<"cancel"> = async ({ params }, req) => {
		const denied = forbidden(req, DECISION_CONSUMER, OPERATOR);
		if (denied) {
			return denied;
		}
		const status = await risk.cancel(params.clientOrderId);
		return status === "not_found"
			? sendResponse({ error: "Unknown order" }, HTTP_STATUS.NOT_FOUND)
			: sendResponse({ status }, HTTP_STATUS.OK);
	};
	const adminStatus: Handler<"adminStatus"> = (_in, req) =>
		forbidden(req, OPERATOR) ?? sendResponse(risk.status(), HTTP_STATUS.OK);
	const adminEngage: Handler<"adminEngage"> = async ({ body }, req) => {
		const denied = forbidden(req, OPERATOR);
		if (denied) {
			return denied;
		}
		if (body.scope === "symbol" && !body.symbol) {
			return sendResponse(
				{ error: "symbol is required for scope symbol" },
				HTTP_STATUS.BAD_REQUEST
			);
		}
		await risk.engage(body.scope, body.reason, body.actor, body.symbol);
		return sendResponse({ status: "engaged" as const }, HTTP_STATUS.OK);
	};
	const adminRearm: Handler<"adminRearm"> = async ({ body }, req) => {
		const denied = forbidden(req, OPERATOR);
		if (denied) {
			return denied;
		}
		if (body.scope === "symbol" && !body.symbol) {
			return sendResponse(
				{ error: "symbol is required for scope symbol" },
				HTTP_STATUS.BAD_REQUEST
			);
		}
		try {
			await risk.rearm(body.scope, body.reason, body.actor, body.symbol);
		} catch (error) {
			return sendResponse(
				{ error: error instanceof Error ? error.message : "refused" },
				HTTP_STATUS.FORBIDDEN
			);
		}
		return sendResponse({ status: "rearmed" as const }, HTTP_STATUS.OK);
	};
	return { intent, price, cancel, adminStatus, adminEngage, adminRearm };
}
