import { defineRoute } from "@trading-model/http/adapters/inbound/api-route/api-route";
import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { Router } from "express";

import { BROKER_CALLBACK_API } from "./api-routes";
import { MESSAGE_CONTROLLER } from "./messages.controller";

/** Creates the Express route that receives the broker's deliveries.
 *
 * @param callbackpath - The URL path for the callback route, with or without
 *   the leading slash (MESSAGE_CALLBACK_PATH defaults to `message`, which
 *   Express would never match without it)
 * @returns An Express router with the POST route configured
 */
export const CREATE_CALLBACK_ROUTE = (callbackpath: string) => {
	const router = Router();
	mountRoute(
		router,
		defineRoute({
			...BROKER_CALLBACK_API.receive,
			path: `/${callbackpath.replace(/^\/+/, "")}`,
		}),
		MESSAGE_CONTROLLER
	);
	return router;
};
