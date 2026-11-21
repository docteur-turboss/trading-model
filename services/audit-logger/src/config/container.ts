import { S3Client } from "@aws-sdk/client-s3";
import {
	ErrorCode,
	makeErrorCode,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { retryWithBackoff } from "@trading-model/common/utils/retry";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { MongoConnectionManager } from "@trading-model/persistence/mongo-connection-manager";
import { mongoAuthFromEnv } from "@trading-model/persistence/mongo-utils";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { Db } from "mongodb";
import { createMessageHandler } from "../adapters/inbound/subscription/audit-subscriber";
import { S3AnchorStore } from "../adapters/outbound/anchor/s3-anchor-store";
import {
	MongoAuditChainReader,
	MongoChainState,
} from "../adapters/outbound/persistence/audit-chain-reader";
import { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import { dropRetiredCollections } from "../adapters/outbound/persistence/retired-collections";
import { ChainAudit } from "../application/audit-chain/chain-audit";
import { ChainAuditScheduler } from "../application/audit-chain/chain-audit-scheduler";
import { createServer } from "../application/server";
import { MS_PER_DAY } from "../domain/audit-chain";
import type { ChainAuditMetricsPort } from "../domain/ports/audit-chain.port";
import { ENV } from "../infrastructure/config/env";
import { createBrokerMessage } from "./broker-setup";
import {
	CHAIN_ANCHORED_SEQUENCE,
	CHAIN_ANCHORING_ENABLED,
	CHAIN_BROKEN,
	CHAIN_LAST_ANCHOR_TIMESTAMP,
	CHAIN_LAST_VERIFICATION_TIMESTAMP,
	CHAIN_VERIFIED_SEQUENCE,
} from "./metrics";

const CHAIN_METRICS: ChainAuditMetricsPort = {
	verified(upTo, broken) {
		CHAIN_BROKEN.set(broken ? 1 : 0);
		CHAIN_VERIFIED_SEQUENCE.set(upTo?.chainSequence ?? 0);
		CHAIN_LAST_VERIFICATION_TIMESTAMP.set(Date.now() / 1000);
	},
	anchored(point) {
		CHAIN_ANCHORED_SEQUENCE.set(point?.chainSequence ?? 0);
		CHAIN_LAST_ANCHOR_TIMESTAMP.set(Date.now() / 1000);
	},
};

export interface ChainAuditSettings {
	retentionDays: number;
	anchorBucket?: string;
	anchorPrefix: string;
	anchorRegion: string;
	/** S3-compatible endpoint; path-style addressing when set. */
	anchorEndpoint?: string;
	/** Refuse to run without an anchor store. */
	anchorRequired: boolean;
}

/** Deadlines of the S3 anchor client: a hung call must not freeze the chain verification. */
const S3_CONNECTION_TIMEOUT_MS = 3000;
const S3_REQUEST_TIMEOUT_MS = 10_000;

/** Verification and anchoring of the audit chain (ADR-0027). */
export function createChainAudit(
	db: Db,
	settings: ChainAuditSettings
): ChainAudit {
	const { anchorBucket, anchorEndpoint, retentionDays } = settings;
	if (settings.anchorRequired && !anchorBucket) {
		throw new Error(
			"AUDIT_ANCHOR_REQUIRED is set but AUDIT_ANCHOR_BUCKET is not: the audit trail would not be anchored"
		);
	}
	const anchors = anchorBucket
		? new S3AnchorStore({
				client: new S3Client({
					region: settings.anchorRegion,
					endpoint: anchorEndpoint,
					forcePathStyle: anchorEndpoint !== undefined,
					requestHandler: {
						connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
						requestTimeout: S3_REQUEST_TIMEOUT_MS,
					},
				}),
				bucket: anchorBucket,
				prefix: settings.anchorPrefix,
				retentionDays,
			})
		: null;
	if (!anchors) {
		getLogger().warn(
			"AUDIT_ANCHOR_BUCKET not set — the audit chain is verified but not anchored: a rewrite of the whole chain would go unnoticed"
		);
	}
	CHAIN_ANCHORING_ENABLED.set(anchors ? 1 : 0);
	return new ChainAudit({
		reader: new MongoAuditChainReader(db),
		state: new MongoChainState(db),
		anchors,
		retentionMs: retentionDays * MS_PER_DAY,
		metrics: CHAIN_METRICS,
	});
}

export function chainAuditSettingsFromEnv(): ChainAuditSettings {
	return {
		retentionDays: ENV.AUDIT_RETENTION_DAYS,
		anchorBucket: ENV.AUDIT_ANCHOR_BUCKET,
		anchorPrefix: ENV.AUDIT_ANCHOR_PREFIX,
		anchorRegion: ENV.AUDIT_ANCHOR_REGION,
		anchorEndpoint: ENV.AUDIT_ANCHOR_ENDPOINT,
		anchorRequired: ENV.AUDIT_ANCHOR_REQUIRED,
	};
}

export async function createRepositories(
	mongoUri: string,
	auth?: { username: string; password: string }
): Promise<{
	mongoManager: MongoConnectionManager;
	db: Db;
	auditRepo: AuditRepository;
}> {
	const mongoManager = new MongoConnectionManager({
		uri: mongoUri,
		auth,
		dbName: "audit-logger",
	});
	const mongoClient = await mongoManager.getConnection();
	const db = mongoClient.db();
	const auditRepo = new AuditRepository(db);
	await Promise.all([auditRepo.ensureIndexes(), dropRetiredCollections(db)]);
	return { mongoManager, db, auditRepo };
}

export type AuditLoggerApp = Awaited<ReturnType<typeof createAuditLoggerApp>>;

const unavailable = makeErrorCode(
	ErrorCode.Agent,
	HTTP_STATUS.SERVICE_UNAVAILABLE
);

/** Wires the whole service. MongoDB connects in the background: the server listens at once, its routes answer 503 and `/health/ready` fails until it is up. */
export async function createAuditLoggerApp() {
	const mongoManager = new MongoConnectionManager({
		uri: ENV.MONGODB_URI,
		auth: mongoAuthFromEnv(ENV),
		dbName: "audit-logger",
		maxRetries: Number.POSITIVE_INFINITY,
	});
	let repo: AuditRepository | null = null;
	const ready = retryWithBackoff(
		async () => {
			try {
				const db = (await mongoManager.getConnection()).db();
				const auditRepo = new AuditRepository(db);
				await Promise.all([
					auditRepo.ensureIndexes(),
					dropRetiredCollections(db),
				]);
				auditRepo.warmStats();
				repo = auditRepo;
				return createChainAudit(db, chainAuditSettingsFromEnv());
			} catch (err) {
				getLogger().error("Audit logger database start-up failed, retrying", {
					error: normalizeError(err).message,
				});
				throw err;
			}
		},
		{
			maxRetries: Number.POSITIVE_INFINITY,
			baseDelayMs: DurationMs.of(1000),
			maxDelayMs: DurationMs.of(30_000),
		}
	);
	const notReady = (): never => {
		throw unavailable("Audit database is not ready");
	};
	// A stand-in for the repository: every call is the real one once the database is up.
	const lazyRepo = new Proxy({} as AuditRepository, {
		// `then` stays undefined so the proxy is never mistaken for a thenable.
		get: (_, method: keyof AuditRepository | "then") =>
			method === "then"
				? undefined
				: (...args: unknown[]) =>
						(repo ?? notReady())[method](...(args as [never])),
	});
	const chainAuditScheduler = new ChainAuditScheduler(
		{
			runCycle: async () => (await ready).result?.runCycle(),
		},
		DurationMs.of(ENV.AUDIT_CHAIN_INTERVAL_MS)
	);
	const server = await createServer(
		lazyRepo,
		mongoManager,
		() => repo !== null
	);
	const { brokerMessage } = await createBrokerMessage(
		createMessageHandler(lazyRepo, ENV.AUDIT_RETENTION_DAYS)
	);
	return {
		server,
		mongoManager,
		brokerMessage,
		chainAuditScheduler,
	};
}
