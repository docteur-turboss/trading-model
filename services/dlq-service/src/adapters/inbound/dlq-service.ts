import type { DlqEntry } from "@trading-model/contracts/dlq-types";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import type { AddEntryResult } from "../../application/use-cases/add-entry-pipeline";
import type {
	ReplayRequest,
	ReplayResult,
} from "../../application/use-cases/dlq-replay-service";
import { STORAGE_UNAVAILABLE } from "../../shared/dlq-error-builder";
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
	addEntry(entry: DlqEntry): Promise<AddEntryResult>;
	deleteEntries(ids: string[]): Promise<{ deleted: number }>;
	replayEntries(
		request: ReplayRequest,
		span: import("@opentelemetry/api").Span
	): Promise<ReplayResult>;
}

export interface DlqHandlerDeps extends HealthDeps {
	useCases: DlqUseCases;
	entries: HealthDeps["entries"] & {
		query(options: DlqListOptions): Promise<StoredDlqEntry[]>;
	};
}

export interface DlqHandlers extends HealthHandlers {
	addEntry(entry: DlqEntry): Promise<ResponseObject>;
	deleteEntries(body: DeleteEntriesBody): Promise<ResponseObject>;
	listEntries(query: ListEntriesQuery): Promise<ResponseObject>;
	replayEntries(query: ReplayEntriesQuery): Promise<ResponseObject>;
}

/** Maps the outcome of adding an entry to its HTTP response. */
function _addEntryResponse(result: AddEntryResult): ResponseObject {
	switch (result.status) {
		case "added":
			return sendResponse({ id: result.id }, HTTP_STATUS.CREATED);
		case "rejected":
			return result.reason === "too-large"
				? sendResponse(
						{ error: "Message payload exceeds maximum size of 5MB" },
						HTTP_STATUS.BAD_REQUEST
					)
				: sendResponse(STORAGE_UNAVAILABLE, HTTP_STATUS.SERVICE_UNAVAILABLE);
		case "capacity-reached":
			return sendResponse(
				{ error: "DLQ capacity limit reached, entry rejected" },
				HTTP_STATUS.TOO_MANY_REQUESTS
			);
		default:
			return sendResponse(STORAGE_UNAVAILABLE, HTTP_STATUS.SERVICE_UNAVAILABLE);
	}
}

/** Binds the HTTP handlers (response mapping) to the use cases of the container. */
export function createDlqHandlers(deps: DlqHandlerDeps): DlqHandlers {
	const { useCases } = deps;
	return {
		...createHealthHandlers(deps),
		async addEntry(entry) {
			return _addEntryResponse(await useCases.addEntry(entry));
		},
		async deleteEntries({ ids }) {
			return sendResponse(await useCases.deleteEntries(ids), HTTP_STATUS.OK);
		},
		listEntries: createListEntries(deps.entries),
		replayEntries: createReplayEntries(useCases.replayEntries),
	};
}
