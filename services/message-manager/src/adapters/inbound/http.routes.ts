import { PUBLISH_ACCEPT_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from "express";
import rateLimit from "express-rate-limit";
import type { Dispatcher } from "../../application/services/dispatcher";
import { metricsHandler } from "../../config/metrics";
import { BROKER_API } from "./api-routes";
import {
	DELETE_A_SUBSCRIPTION,
	PUBLISH_A_MESSAGE,
	SUBSCRIPTION_TO_A_TOPIC,
} from "./http.controller";

const SUBSCRIPTION_TIMEOUT_MS = 10_000;

const PUBLISH_LIMITER = rateLimit({
	windowMs: 60_000,
	max: 1000,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many publications, please try again later" },
});

const SUBSCRIBE_LIMITER = rateLimit({
	windowMs: 60_000,
	max: 500,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many subscription requests, please try again later" },
});

const UNSUBSCRIBE_LIMITER = rateLimit({
	windowMs: 60_000,
	max: 500,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		error: "Too many unsubscription requests, please try again later",
	},
});

const WITH_TIMEOUT =
	(ms: number) => (req: Request, _res: Response, next: NextFunction) => {
		req.setTimeout(ms);
		next();
	};

export const BROKER_ROUTES = (dispatcher: Dispatcher): Router => {
	const router = Router();
	router.get("/metrics", metricsHandler);
	registerPublishRoute(router, dispatcher);
	registerSubscribeRoute(router, dispatcher);
	registerUnsubscribeRoute(router, dispatcher);
	return router;
};

function registerPublishRoute(router: Router, dispatcher: Dispatcher): void {
	mountRoute(router, BROKER_API.publish, PUBLISH_A_MESSAGE(dispatcher), {
		middlewares: [WITH_TIMEOUT(PUBLISH_ACCEPT_TIMEOUT_MS), PUBLISH_LIMITER],
	});
}

function registerSubscribeRoute(router: Router, dispatcher: Dispatcher): void {
	mountRoute(
		router,
		BROKER_API.subscribe,
		SUBSCRIPTION_TO_A_TOPIC(dispatcher),
		{
			middlewares: [WITH_TIMEOUT(SUBSCRIPTION_TIMEOUT_MS), SUBSCRIBE_LIMITER],
		}
	);
}

function registerUnsubscribeRoute(
	router: Router,
	dispatcher: Dispatcher
): void {
	mountRoute(
		router,
		BROKER_API.unsubscribe,
		DELETE_A_SUBSCRIPTION(dispatcher),
		{
			middlewares: [WITH_TIMEOUT(SUBSCRIPTION_TIMEOUT_MS), UNSUBSCRIBE_LIMITER],
		}
	);
}
