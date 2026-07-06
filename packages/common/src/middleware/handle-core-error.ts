import ChainedError from "chained-error";
import { logger } from "../config/logger";
import { normalizeError } from "../utils/errors";
import { HTTP_CODE, ResponseException } from "./response-exception";

type FileHandle =
	| "auth"
	| "newsletter"
	| "settings"
	| "user"
	| "contact"
	| "transaction"
	| "kiff-score";

export interface CoreErrorContext {
	file: FileHandle;
	context: string;
}

export type CoreResponse<TData = string> = Promise<[TData, string]>;

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
		throw ResponseException("No parameters provided").badRequest();
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
export const handleDBError = (file: string) => (err: unknown) => {
	if (err instanceof ChainedError) {
		const msg = err.message ?? "";
		if (msg.includes("No result returned")) {
			throw new Error("404");
		}
		if (msg.includes("Duplicate entry")) {
			if (msg.includes("name_UNIQUE")) {
				throw new Error("Name already exists");
			}
			if (msg.includes("email_UNIQUE")) {
				throw new Error("Email already exists");
			}
		}
	}

	logger.error("Model operation failed", { context: { file, err: normalizeError(err) } });
	throw err;
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
 *   return handleCoreError({ file: "user", context: "updateUser" }, err, errorMapping);
 * }
 */
export const handleCoreError = (
	ctx: CoreErrorContext,
	err: unknown,
	mapping: Record<string, [string, string]>
): [string, string] | never => {
	if (err instanceof Error && mapping[err.message]) {
		return mapping[err.message];
	}

	logger.error("Core operation failed", {
		context: {
			file: ctx.file,
			context: ctx.context,
			err: normalizeError(err),
		},
	});
	throw err;
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
 * @param ctx - Core error context with file identifier and operation description.
 *
 * @returns A `CoreResponse` tuple containing either:
 *   - `[data, HTTP_CODE.success]` on success, or
 *   - The mapped error tuple from `handleCoreError`.
 *
 * @example
 * const result = await handleOnlyDataCore(
 *   () => UserCore.getUser(id),
 *   { "USER_NOT_FOUND": ["404", "User not found"] },
 *   { file: "user", context: "getUser" }
 * );
 */
export const handleOnlyDataCore = async <TData>(
	fn: () => Promise<TData>,
	errorMap: Record<string, [string, string]>,
	ctx: CoreErrorContext
): Promise<CoreResponse<TData | string>> => {
	try {
		const result = await fn();
		return [result, HTTP_CODE.success];
	} catch (err) {
		return handleCoreError(ctx, err, errorMap);
	}
};
