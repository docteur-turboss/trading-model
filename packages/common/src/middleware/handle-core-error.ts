import type { ErrorResponse } from "@trading-model/validation/contracts/error-response";
import { logger } from "../config/logger";
import { HTTP_STATUS, type HttpStatusCode } from "../http-status";
import { normalizeError } from "../utils/errors";
import { normalizeDbError } from "./normalize-db-error";
import { ResponseException } from "./response-exception";

export enum FileHandle {
	Auth = "auth",
	Newsletter = "newsletter",
	Settings = "settings",
	User = "user",
	Contact = "contact",
	Transaction = "transaction",
	KiffScore = "kiff-score",
}

export interface CoreErrorContext {
	file: FileHandle;
	context: string;
}

export type { ErrorResponse };

export type ErrorMapping = Record<string, ErrorResponse>;

export interface CoreSuccessResult<TData = string> {
	data: TData;
	statusCode: HttpStatusCode;
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
): ErrorResponse | never => {
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

export const handleOnlyDataCore = async <TData>(
	fn: () => Promise<TData>,
	errorMap: ErrorMapping,
	ctx: CoreErrorContext
): Promise<CoreSuccessResult<TData | string> | ErrorResponse> => {
	try {
		const result = await fn();
		return { data: result, statusCode: HTTP_STATUS.OK };
	} catch (err) {
		return handleCoreError(ctx, err, errorMap);
	}
};
