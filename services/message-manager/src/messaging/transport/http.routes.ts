import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from "express";
import rateLimit from "express-rate-limit";
import type { Dispatcher } from "../core/dispatcher";
import {
	DELETE_A_SUBSCRIPTION,
	PUBLISH_A_MESSAGE,
	SUBSCRIPTION_TO_A_TOPIC,
} from "./http.controller";
import {
	PUBLISH_SCHEMA,
	SUBSCRIBE_SCHEMA,
	UNSUBSCRIBE_SCHEMA,
} from "./validation/broker.schema";
import { VALIDATE_SCHEMA } from "./validation/validate-schema.middleware";

const PUBLISH_TIMEOUT_MS = 30_000;
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

	router.post(
		"/message",
		WITH_TIMEOUT(PUBLISH_TIMEOUT_MS),
		PUBLISH_LIMITER,
		VALIDATE_SCHEMA(PUBLISH_SCHEMA),
		PUBLISH_A_MESSAGE(dispatcher)
	);
	router.post(
		"/subscription",
		WITH_TIMEOUT(SUBSCRIPTION_TIMEOUT_MS),
		SUBSCRIBE_LIMITER,
		VALIDATE_SCHEMA(SUBSCRIBE_SCHEMA),
		SUBSCRIPTION_TO_A_TOPIC(dispatcher)
	);
	router.delete(
		"/subscription",
		WITH_TIMEOUT(SUBSCRIPTION_TIMEOUT_MS),
		UNSUBSCRIBE_LIMITER,
		VALIDATE_SCHEMA(UNSUBSCRIBE_SCHEMA),
		DELETE_A_SUBSCRIPTION(dispatcher)
	);

	return router;
};
