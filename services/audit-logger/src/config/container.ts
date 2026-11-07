import { S3Client } from "@aws-sdk/client-s3";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { MongoConnectionManager } from "@trading-model/persistence/mongo-connection-manager";
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

const MS_PER_DAY = 86_400_000;

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

export function createAuditServer(
	auditRepo: AuditRepository,
	mongoManager: MongoConnectionManager
): ReturnType<typeof createServer> {
	const messageHandler = createMessageHandler(
		auditRepo,
		ENV.AUDIT_RETENTION_DAYS
	);
	return createServer(auditRepo, mongoManager, messageHandler);
}

export async function createRepositories(mongoUri: string): Promise<{
	mongoManager: MongoConnectionManager;
	db: Db;
	auditRepo: AuditRepository;
}> {
	const mongoManager = new MongoConnectionManager({
		uri: mongoUri,
		dbName: "audit-logger",
	});
	const mongoClient = await mongoManager.getConnection();
	const db = mongoClient.db();
	const auditRepo = new AuditRepository(db);
	await Promise.all([auditRepo.ensureIndexes(), dropRetiredCollections(db)]);
	return { mongoManager, db, auditRepo };
}

export type AuditLoggerApp = Awaited<ReturnType<typeof createAuditLoggerApp>>;

/** Wires the whole service: MongoDB repositories, HTTP server, bus subscriptions, audit chain checks. */
export async function createAuditLoggerApp() {
	const { mongoManager, db, auditRepo } = await createRepositories(
		ENV.MONGODB_URI
	);
	const chainAuditScheduler = new ChainAuditScheduler(
		createChainAudit(db, chainAuditSettingsFromEnv()),
		DurationMs.of(ENV.AUDIT_CHAIN_INTERVAL_MS)
	);
	const server = await createAuditServer(auditRepo, mongoManager);
	const { brokerMessage } = await createBrokerMessage();
	return {
		server,
		mongoManager,
		brokerMessage,
		chainAuditScheduler,
	};
}
