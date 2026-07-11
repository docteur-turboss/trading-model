import { HTTP_STATUS } from "@trading-model/common/http-status";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import zod from "zod";

export const SYMBOL_SCHEMA = zod.object({
	symbol: zod.string("Symbol is required and must be a string.").min(1),
});

export const SOURCE_SCHEMA = zod.object({
	source: zod.string("Source is required and must be a string.").min(1),
});

export const TIMESTAMP_SCHEMA = zod.object({
	timestamp: zod.coerce.date(
		"Timestamp must be a valid date or a parsable date string."
	),
});

export const ORDER_BOOK_TIMESTAMP_SCHEMA = zod.object({
	timestamp: zod.coerce.number("Timestamp must be a valid numeric value."),
});

export function createController<TBody>(
	schema: zod.ZodSchema<TBody>,
	fetcher: (params: TBody) => Promise<unknown>
) {
	return catchSync(async (req) => {
		const parsed = schema.safeParse(req.params);
		if (!parsed.success) {
			return sendResponse(
				{ error: parsed.error.message },
				HTTP_STATUS.BAD_REQUEST
			);
		}

		try {
			return sendResponse(
				JSON.stringify(await fetcher(parsed.data)),
				HTTP_STATUS.OK
			);
		} catch (err) {
			if (err instanceof Error && err.message.includes("No result returned")) {
				return sendResponse({ error: "No data found" }, HTTP_STATUS.NOT_FOUND);
			}
			throw err instanceof Error ? err : new Error(String(err));
		}
	});
}
