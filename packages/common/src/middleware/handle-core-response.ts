import type { Response } from "express";
import { isProduction } from "@trading-model/common/config/node-env";
import { type ResponseCodeKey, ResponseException } from "./response-exception";

export interface CoreResult<_TData = unknown> {
	data: _TData;
	code: string;
}

/**
 * Generic utility for returning a standardized HTTP response from a core service.
 *
 * This function executes a core business operation (`coreFn`), which is expected
 * to return a `CoreResult`. It then delegates the formatting of
 * the final client-facing response to `ResponseException`, which maps internal
 * codes to structured HTTP responses.
 *
 * @param coreFn - A function representing a core service call. Must resolve to
 *                 a `CoreResult` with `data` and `code`.
 * @param res - Express response object used to send the final output.
 *
 * @example
 * const coreFn = async () => ({ data: "User created", code: "SUCCESS" });
 * await handleCoreResponse(coreFn, res);
 *
 * // Sends:
 * // res.status(200).json({
 * //   status: 200,
 * //   data: "User created"
 * // });
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
 * Generic utility for returning a standardized authentication response
 * from a core service.
 *
 * This function runs a core authentication-related operation (`coreFn`), which
 * must return a `CoreResult`. The `ResponseException` mapper
 * converts this internal result into a structured HTTP response object.
 *
 * In addition to sending the standardized JSON response, this helper also sets
 * an HTTP-only authentication cookie (`token`) using the value provided in
 * `clientResponse.data`. Security attributes such as `httpOnly`, `secure`,
 * `sameSite`, and expiration are applied to enforce safe cookie handling.
 *
 * @param coreFn - A core authentication function that resolves to `CoreResult`.
 * @param res - Express Response object used to set cookies and send the final response.
 *
 * @example
 * const coreFn = async () => ({ data: "jwt-token-value", code: "AUTH_SUCCESS" });
 * await handleCoreAuthResponse(coreFn, res);
 *
 * // Sends:
 * // Set-Cookie: token=jwt-token-value; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
 * // res.status(200).json({ status: 200, data: "jwt-token-value" });
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
