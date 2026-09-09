import type { HttpStatusCode } from "@trading-model/common/http-status";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { Request, RequestHandler } from "express";

interface QueryableRepo<TQuery, TDoc> {
	query(query: TQuery): Promise<unknown>;
	findById(id: string): Promise<TDoc | null>;
	getStats(): Promise<unknown>;
}

interface QueryControllerConfig {
	notFoundMessage: string;
	idParam?: string;
}

/**
 * Builds the standard list / get-by-id / stats handler triplet shared by the logs and
 * events controllers. The repository only needs to expose `query`, `findById` and
 * `getStats`.
 */
export function createQueryController<TQuery, TDoc>(
	repo: QueryableRepo<TQuery, TDoc>,
	buildQuery: (req: Request) => TQuery,
	config: QueryControllerConfig
): {
	list: RequestHandler;
	getById: RequestHandler;
	stats: RequestHandler;
} {
	const idParam = config.idParam ?? "id";

	return {
		list: catchSync(async (req) => {
			const result = await repo.query(buildQuery(req));
			return sendResponse(result, 200 as HttpStatusCode);
		}),
		getById: catchSync(async (req) => {
			const doc = await repo.findById(String(req.params[idParam]));
			if (!doc) {
				return sendResponse(
					{ error: config.notFoundMessage },
					404 as HttpStatusCode
				);
			}
			return sendResponse(doc, 200 as HttpStatusCode);
		}),
		stats: catchSync(async () => {
			const stats = await repo.getStats();
			return sendResponse(stats, 200 as HttpStatusCode);
		}),
	};
}
