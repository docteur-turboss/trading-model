import { mongoAuthFromEnv } from "@trading-model/persistence/mongo-utils";
import { ENV } from "../infrastructure/config/env";
import {
	chainAuditSettingsFromEnv,
	createChainAudit,
	createRepositories,
} from "./container";

/** The chain of the operator CLI: opens Mongo with the service's settings and closes it after use. */
export async function openChainCli() {
	const { mongoManager, db } = await createRepositories(
		ENV.MONGODB_URI,
		mongoAuthFromEnv(ENV)
	);
	return {
		audit: createChainAudit(db, chainAuditSettingsFromEnv()),
		close: () => mongoManager.close(),
	};
}
