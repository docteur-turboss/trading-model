import { HTTP_STATUS } from "../http-status";
import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

function _buildValidationDetails(
	issues: Array<{ path: (string | number)[]; message: string }>
): Array<{ field: string; message: string }> {
	return issues.map((issue) => ({
		field: issue.path.join("."),
		message: issue.message,
	}));
}

function _extractIssues(
	error: unknown
): Array<{ path: (string | number)[]; message: string }> {
	return (
		error as unknown as {
			issues: Array<{ path: (string | number)[]; message: string }>;
		}
	).issues;
}

function _sendValidationError(
	res: Response,
	issues: Array<{ path: (string | number)[]; message: string }>
): void {
	res.status(HTTP_STATUS.BAD_REQUEST).json({
		error: "Validation failed",
		details: _buildValidationDetails(issues),
	});
}

export function validateSchema(schema: ZodSchema) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const result = schema.safeParse(req.body);
		if (!result.success) {
			_sendValidationError(res, _extractIssues(result.error));
			return;
		}
		req.body = result.data;
		next();
	};
}
