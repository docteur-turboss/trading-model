import { catchSync } from "@trading-model/common/middleware/catch-error";
import {
	addEntry,
	deleteEntries,
	healthCheck,
	listEntries,
	readyCheck,
	replayEntries,
} from "./dlq-service";

export const AddEntry = catchSync((req) => addEntry(req));

export const ListEntries = catchSync((req) => listEntries(req));

export const DeleteEntries = catchSync((req) => deleteEntries(req));

export const HealthCheck = catchSync((_req) => healthCheck());

export const ReadyCheck = catchSync((_req) => readyCheck());

export const ReplayEntries = catchSync((req) => replayEntries(req));
