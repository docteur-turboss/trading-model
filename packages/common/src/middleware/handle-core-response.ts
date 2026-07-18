import type { Response } from "express";
import { isProduction } from "../config/node-env";
import { type ResponseCodeKey, ResponseException } from "./response-exception";

export interface CoreResult<_TData = unknown> {
	data: _TData;
	code: string;
}

/**
 * Executes a core operation and sends a standardized HTTP response via ResponseException.
 */
export async function handleCoreResponse(
	coreFn: () => Promise<CoreResult>,
	res: Response
) {
	const { data, code } = await coreFn();

	const clientResponse = ResponseException(data)[code as ResponseCodeKey]();

	res.status(clientResponse.status).json(clientResponse);
}

export interface CookieOptions {
	httpOnly: boolean;
	secure: boolean;
	sameSite: "strict";
	maxAge: number;
	path: string;
}

/**
 * Runs a core auth operation and sends a standardized HTTP response with an HttpOnly cookie.
 */
function _getCookieOptions(): CookieOptions {
	return {
		httpOnly: true,
		secure: isProduction(),
		sameSite: "strict" as const,
		maxAge: 7 * 24 * 60 * 60 * 1000,
		path: "/",
	};
}

export async function handleCoreAuthResponse(
	coreFn: () => Promise<CoreResult>,
	res: Response
) {
	const { data, code } = await coreFn();
	const clientResponse = ResponseException(data)[code as ResponseCodeKey]();
	res
		.status(clientResponse.status)
		.cookie("token", clientResponse.data, _getCookieOptions())
		.json(clientResponse);
}
