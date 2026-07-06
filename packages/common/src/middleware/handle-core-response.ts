import type { Response } from "express";

import { type ResponseCodeKey, ResponseException } from "./response-exception";

/**
 * Generic utility for returning a standardized HTTP response from a core service.
 *
 * This function executes a core business operation (`coreFn`), which is expected
 * to return a tuple `[data, responseCode]`. It then delegates the formatting of
 * the final client-facing response to `ResponseException`, which maps internal
 * codes to structured HTTP responses.
 *
 * @param coreFn - A function representing a core service call. Must resolve to
 *                 a tuple: `[payload, responseCodeKey]`.
 * @param res - Express response object used to send the final output.
 *
 * @example
 * const coreFn = async () => ["User created", "SUCCESS"];
 * await handleCoreResponse(coreFn, res);
 *
 * // Sends:
 * // res.status(200).json({
 * //   status: 200,
 * //   data: "User created"
 * // });
 */
export async function handleCoreResponse(
	coreFn: () => Promise<[unknown, string]>,
	res: Response
) {
	const [response, code] = await coreFn();

	const clientResponse = ResponseException(response)[code as ResponseCodeKey]();

	res.status(clientResponse.status).json(clientResponse);
}

/**
 * Generic utility for returning a standardized authentication response
 * from a core service.
 *
 * This function runs a core authentication-related operation (`coreFn`), which
 * must return a tuple `[payload, responseCode]`. The `ResponseException` mapper
 * converts this internal result into a structured HTTP response object.
 *
 * In addition to sending the standardized JSON response, this helper also sets
 * an HTTP-only authentication cookie (`token`) using the value provided in
 * `clientResponse.data`. Security attributes such as `httpOnly`, `secure`,
 * `sameSite`, and expiration are applied to enforce safe cookie handling.
 *
 * @param coreFn - A core authentication function that resolves to `[data, responseCodeKey]`.
 * @param res - Express Response object used to set cookies and send the final response.
 *
 * @example
 * const coreFn = async () => ["jwt-token-value", "AUTH_SUCCESS"];
 * await handleCoreAuthResponse(coreFn, res);
 *
 * // Sends:
 * // Set-Cookie: token=jwt-token-value; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
 * // res.status(200).json({ status: 200, data: "jwt-token-value" });
 */
function _getCookieOptions(): Record<string, unknown> {
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict" as const,
		maxAge: 7 * 24 * 60 * 60 * 1000,
		path: "/",
	};
}

export async function handleCoreAuthResponse(
	coreFn: () => Promise<[unknown, string]>,
	res: Response
) {
	const [response, code] = await coreFn();
	const clientResponse = ResponseException(response)[code as ResponseCodeKey]();
	res
		.status(clientResponse.status)
		.cookie("token", clientResponse.data, _getCookieOptions())
		.json(clientResponse);
}
