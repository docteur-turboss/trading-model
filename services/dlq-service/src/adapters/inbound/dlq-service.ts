import type { Span } from "@opentelemetry/api";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/response-exception";
import type { DeleteEntriesResult } from "../../application/use-cases/dlq-delete-handler";
import type {
	ReplayRequest,
	ReplayResult,
} from "../../application/use-cases/dlq-replay-service";
import type { DlqListOptions, StoredDlqEntry } from "../outbound/repository";
import type {
	DeleteEntriesBody,
	ListEntriesQuery,
	ReplayEntriesQuery,
} from "./api-routes";
import {
	createHealthHandlers,
	type HealthDeps,
	type HealthHandlers,
} from "./dlq-health-handler";
import { createListEntries } from "./dlq-list-handler";
import { createReplayEntries } from "./dlq-replay-handler";

/** The use cases the HTTP handlers call; their results carry no status code. */
export interface DlqUseCases {
	deleteEntries(
		ids: string[],
		actor: string | null
	): Promise<DeleteEntriesResult>;
	replayEntries(request: ReplayRequest, span: Span): Promise<ReplayResult>;
}

export interface DlqHandlerDeps extends HealthDeps {
	useCases: DlqUseCases;
	entries: HealthDeps["entries"] & {
		query(options: DlqListOptions): Promise<StoredDlqEntry[]>;
	};
}

export interface DlqHandlers extends HealthHandlers {
	deleteEntries(
		body: DeleteEntriesBody,
		actor: string | null
	): Promise<ResponseObject>;
	listEntries(query: ListEntriesQuery): Promise<ResponseObject>;
	replayEntries(
		query: ReplayEntriesQuery,
		actor: string | null
	): Promise<ResponseObject>;
}

/** Binds the HTTP handlers (response mapping) to the use cases of the container. */
export function createDlqHandlers(deps: DlqHandlerDeps): DlqHandlers {
	const { useCases } = deps;
	return {
		...createHealthHandlers(deps),
		async deleteEntries({ ids }, actor) {
			const result = await useCases.deleteEntries(ids, actor);
			// Deleted but not in the audit trail: no silent success (ADR-0059).
			return sendResponse(
				result,
				result.auditRecorded ? HTTP_STATUS.OK : HTTP_STATUS.BAD_GATEWAY
			);
		},
		listEntries: createListEntries(deps.entries),
		replayEntries: createReplayEntries(useCases.replayEntries),
	};
}
