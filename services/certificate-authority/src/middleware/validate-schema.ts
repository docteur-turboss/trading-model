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

export function validateSchema(schema: ZodSchema) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const result = schema.safeParse(req.body);
		if (!result.success) {
			const issues = (result.error as unknown as { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
			res.status(400).json({ error: "Validation failed", details: _buildValidationDetails(issues) });
			return;
		}
		req.body = result.data;
		next();
	};
}
