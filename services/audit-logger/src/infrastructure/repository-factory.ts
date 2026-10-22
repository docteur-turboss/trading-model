import { MongoConnectionManager } from "@trading-model/persistence/mongo-connection-manager";
import { URLString } from "@trading-model/primitives/primitives";
import { AuditRepository } from "../adapters/outbound/persistence/audit-repository";
import { JobRepository } from "../adapters/outbound/persistence/job-repository";

export async function createRepositories(mongoUri: string): Promise<{
	mongoManager: MongoConnectionManager;
	jobRepo: JobRepository;
	auditRepo: AuditRepository;
}> {
	const mongoManager = new MongoConnectionManager({
		uri: URLString.of(mongoUri),
		dbName: "audit-logger",
	});
	const mongoClient = await mongoManager.getConnection();
	const db = mongoClient.db();
	const jobRepo = new JobRepository(db);
	await jobRepo.ensureIndexes();
	const auditRepo = new AuditRepository(db);
	await auditRepo.ensureIndexes();
	return { mongoManager, jobRepo, auditRepo };
}
