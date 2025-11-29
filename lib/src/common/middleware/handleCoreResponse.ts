import { Response } from "express";
import ChainedError from "chained-error";
import { logger } from "../config/logger";
import { ResponseException, ResponseCodeKey, HTTP_CODE } from "./responseException";

type fileHandle = "auth"|"newsletter"|"settings"|"user"|"contact"|"transaction"|"kiff-score"
export type CoreResponse<T = string> = Promise<[T, string]>;

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
  // Execute the core service function and retrieve the raw result.
  const [response, code] = await coreFn();

  // Convert core output into a client-facing standardized response object.
  const clientResponse = ResponseException(response)[code as ResponseCodeKey]();

  // Send the final response with the appropriate HTTP status code.
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
export async function handleCoreAuthResponse(
  coreFn: () => Promise<[unknown, string]>,
  res: Response
) {
  // Execute the core authentication logic and unpack the result.
  const [response, code] = await coreFn();

  // Convert the internal result into a client-facing standardized response object.
  const clientResponse = ResponseException(response)[code as ResponseCodeKey]();

  // Set a secure HTTP-only cookie containing the auth token,
  // then send the final formatted response to the client.
  res
    .status(clientResponse.status)
    .cookie("token", clientResponse.data, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    })
    .json(clientResponse);
}

/**
 * Ensures that at least one field in the provided object contains
 * a truthy value. This is typically used to validate partial updates
 * or payloads where at least one property must be supplied.
 *
 * @param fields - An object whose values will be checked for truthiness.
 *
 * @throws BadRequestException - Thrown when all provided fields are empty,
 *         null, undefined, or otherwise falsy.
 *
 * @example
 * ensureAtLeastOneField({ name: "", age: null });
 * // ❌ Throws BadRequest: no valid fields provided
 *
 * ensureAtLeastOneField({ name: "John", age: null });
 * // ✅ At least one field is truthy, continues execution
 */
export function ensureAtLeastOneField(fields: Record<string, unknown>) {
  if (!Object.values(fields).some(Boolean)) {
    throw ResponseException("Aucun paramètres fournis").BadRequest();
  }
}

/**
 * Higher-order utility that normalizes common database errors into
 * consistent, human-readable exceptions. This helps ensure predictable
 * error handling across model layers.
 *
 * The handler inspects known DB error patterns (e.g. "No result returned",
 * duplicate key constraints) and throws standardized errors that can be
 * mapped by upper layers (controllers, services, API response builders).
 *
 * @param file - The name of the file or model using this handler, used
 *               for contextual logging.
 *
 * @returns A function that processes any caught database error and 
 *          rethrows a normalized error when applicable.
 *
 * @throws Error("404")        - When no row is returned (interpreted as "not found").
 * @throws Error("Nom exist")  - When a duplicate name constraint is violated.
 * @throws Error("Email exist")- When a duplicate email constraint is violated.
 * @throws e                   - Re-throws any unrecognized error after logging.
 *
 * @example
 * try {
 *   await UserModel.getById(id);
 * } catch (err) {
 *   handleDBError("user")(err); // logs and normalizes DB errors
 * }
 */
export const handleDBError = (file: string) => (e: unknown) => {
  if (e instanceof ChainedError) {
    const msg = e.message ?? "";
    if (msg.includes("No result returned")) throw new Error("404");
    if (msg.includes("Duplicate entry")) {
      if (msg.includes("name_UNIQUE")) throw new Error("Nom exist");
      if (msg.includes("email_UNIQUE")) throw new Error("Email exist");
    }
  }

  logger.error(`${file}.models.ts`, { err: e });
  throw e;
};

/**
 * Centralized error handler for core-level operations.
 *
 * This utility maps known error messages to standardized response tuples,
 * allowing core services to translate internal errors into predictable,
 * higher-level response codes or messages.
 *
 * If the thrown error matches a key in the provided `mapping` dictionary,
 * the corresponding tuple is returned. Otherwise, the error is logged with
 * contextual information and rethrown for upstream handling.
 *
 * @param file - Identifier of the core file invoking this handler, used for logging.
 * @param context - Additional contextual metadata describing the operation in progress.
 * @param e - The caught error to inspect and potentially map.
 * @param mapping - A dictionary where keys are known error messages and values are
 *                  tuples `[responseCode, responseMessage]` used by the caller.
 *
 * @returns A tuple `[string, string]` representing the standardized response
 *          mapped from the error, if a match is found.
 *
 * @throws e - Re-throws the original error when no mapping applies.
 *
 * @example
 * const errorMapping = {
 *   "USER_NOT_FOUND": ["404", "User not found"],
 *   "INVALID_STATE": ["400", "Invalid user state"],
 * };
 *
 * try {
 *   await UserCore.updateUser(id, payload);
 * } catch (err) {
 *   return handleCoreError("user", "updateUser", err, errorMapping);
 * }
 */
export const handleCoreError = (
  file: fileHandle,
  context: string,
  e: unknown,
  mapping: Record<string, [string, string]>
): [string, string] | never => {
  if (e instanceof Error && mapping[e.message]) return mapping[e.message];

  logger.error(`${file}.core.ts`, { err: e, context });
  throw e;
};

/**
 * Generic wrapper that executes a core function and extracts only its data,
 * while providing centralized error handling and standardized response formatting.
 *
 * This utility is used when the caller only cares about the returned data and the
 * success/error code, without needing to construct a full client response object.
 *
 * On success, the wrapped function `fn` is executed and its result is returned
 * along with a standardized success code.  
 * On failure, the error is delegated to `handleCoreError`, which either maps it
 * to a known response tuple or rethrows it after logging.
 *
 * @template T - The type of the expected successful data result.
 *
 * @param fn - A core function that returns a Promise resolving to the desired data.
 * @param errorMap - Optional mapping of known error messages to standardized
 *                   `[responseCode, responseMessage]` tuples.
 * @param file - Identifier of the core module calling this wrapper, used for logging.
 * @param context - Additional contextual information about the operation, also logged on error.
 *
 * @returns A `CoreResponse` tuple containing either:
 *   - `[data, HTTP_CODE.Success]` on success, or  
 *   - The mapped error tuple from `handleCoreError`.
 *
 * @example
 * const result = await handleOnlyDataCore(
 *   () => UserCore.getUser(id),
 *   { "USER_NOT_FOUND": ["404", "User not found"] },
 *   "user",
 *   "getUser"
 * );
 */
export const handleOnlyDataCore = async <T>(
  fn: () => Promise<T>,
  errorMap: Record<string, [string, string]> = {},
  file: fileHandle,
  context: string
): Promise<CoreResponse<T | string>> => {
  try {
    const result = await fn();
    return [result, HTTP_CODE.Success];
  } catch (e) {
    return handleCoreError(file, context, e, errorMap);
  }
};