import { logger } from "../config/logger";
import type { ErrorResponse } from "../contracts/error-response";
import { normalizeError } from "../utils/errors";
import { normalizeDbError } from "./normalize-db-error";
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

export type { ErrorResponse };

export type ErrorMapping = Record<string, ErrorResponse>;

export interface CoreSuccessResult<TData = string> {
	data: TData;
	statusCode: string;
}

export interface CoreErrorResult {
	errorCode: string;
	errorMessage: string;
}

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
): CoreErrorResult | never => {
	if (err instanceof Error && mapping[err.message]) {
		const { code, message } = mapping[err.message];
		return { errorCode: code, errorMessage: message };
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
): Promise<CoreSuccessResult<TData | string> | CoreErrorResult> => {
	try {
		const result = await fn();
		return { data: result, statusCode: HTTP_CODE.success };
	} catch (err) {
		return handleCoreError(ctx, err, errorMap);
	}
};
