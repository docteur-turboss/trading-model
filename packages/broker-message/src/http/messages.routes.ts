import { Router } from "express";

import { MESSAGE_CONTROLLER } from "./messages.controller";

/** Creates an Express route to receive broker message callbacks.
 *
 * @param callbackpath - The URL path for the callback route
 * @returns An Express router with the POST route configured
 */
export const CREATE_CALLBACK_ROUTE = (callbackpath: string) =>
	Router().post(callbackpath, MESSAGE_CONTROLLER);
