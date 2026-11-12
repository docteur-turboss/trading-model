// Writes an audit trail into MongoDB with the code of the audit-logger image
// (buildAuditDocument + AuditRepository, as audit-subscriber does), for
// the Docker restore drill (tests/backup/compose-restore-drill.sh):
//   docker compose run --rm --no-deps -T --entrypoint node audit-logger - < tests/backup/seed-audit-chain.cjs
// First LEGACY events stored the way audit-logger did before 2026-10-31
// (undefined correlationId written as null), then CURRENT events through the
// repository, which extends their chain. tests/backup/audit-chain.js must
// verify both. Uses MONGODB_URI of the audit-logger service.
const { createRequire } = require("node:module");

const dist = "/app/services/audit-logger/dist";
const load = createRequire(`${dist}/application/index.js`);
const { MongoClient } = load("mongodb");
const { buildAuditDocument } = load(
	`${dist}/adapters/outbound/persistence/audit-document-builder.js`
);
const { computeAuditHash } = load(`${dist}/domain/audit-chain.js`);
const { AuditRepository } = load(
	`${dist}/adapters/outbound/persistence/audit-repository.js`
);

const LEGACY = 5;
const CURRENT = 20;

function envelope(i) {
	return {
		payload: { symbol: "BTCUSDT", price: 65000.5 + i, volume: i, levels: [1, 2.5] },
		metadata: {
			topic: "market.data",
			messageId: `restore-drill-${i}`,
			emittedAt: new Date(Date.UTC(2026, 9, 31, 12, 0, i)).toISOString(),
			publisher: { serviceName: "financial-scraper", instanceId: "drill" },
			...(i % 2 === 0 ? { correlationId: `corr-${i}` } : {}),
		},
	};
}

(async () => {
	const client = await MongoClient.connect(process.env.MONGODB_URI, {
		auth: { username: process.env.MONGO_USERNAME, password: process.env.MONGO_PASSWORD },
	});
	const db = client.db();
	const repository = new AuditRepository(db);
	await repository.ensureIndexes();
	const events = db.collection("audit_events");
	let previousHash = "";
	for (let i = 1; i <= LEGACY; i++) {
		const event = buildAuditDocument(envelope(i), 30);
		event.previousHash = previousHash;
		event.chainSequence = i;
		event.dataHash = computeAuditHash({
			receivedAt: event.receivedAt,
			metadata: event.metadata,
			payload: event.payload,
			previousHash: event.previousHash,
			chainSequence: event.chainSequence,
		});
		// The former insert: no ignoreUndefined, correlationId stored as null.
		await events.insertOne(event);
		previousHash = event.dataHash;
	}
	for (let i = LEGACY + 1; i <= LEGACY + CURRENT; i++) {
		await repository.insert(buildAuditDocument(envelope(i), 30));
	}
	await client.close();
	console.log(LEGACY + CURRENT);
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
