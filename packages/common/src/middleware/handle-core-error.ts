import { logger } from "../config/logger";
import { normalizeError } from "../utils/errors";
import { HTTP_CODE, ResponseException } from "./response-exception";
import { normalizeDbError } from "./normalize-db-error";

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

export interface ErrorResponse {
	code: string;
	message: string;
}

export type ErrorMapping = Record<string, ErrorResponse>;

export type CoreResponse<TData = string> = Promise<[TData, string]>;

export function ensureAtLeastOneField(fields: Record<string, unknown>) {
	if (!Object.values(fields).some(Boolean)) {
		throw ResponseException("No parameters provided").badRequest();
	}
}

export const handleDBError = normalizeDbError;

export const handleCoreError = (
	ctx: CoreErrorContext,
	err: unknown,
	mapping: ErrorMapping
): [string, string] | never => {
	if (err instanceof Error && mapping[err.message]) {
		const { code, message } = mapping[err.message];
		return [code, message];
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

export const handleOnlyDataCore = async <TData>(
	fn: () => Promise<TData>,
	errorMap: ErrorMapping,
	ctx: CoreErrorContext
): Promise<CoreResponse<TData | string>> => {
	try {
		const result = await fn();
		return [result, HTTP_CODE.success];
	} catch (err) {
		return handleCoreError(ctx, err, errorMap);
	}
};
