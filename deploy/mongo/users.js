// MongoDB users of the platform (issue #669, ADR-0067). Run with mongosh against
// a member of the replica set (K8s Jobs `mongo-*-init`) or the standalone mongod
// (compose `mongo-users`). Idempotent: a user is created, or updated to the
// password and roles below, so a rotated password is applied by running it again,
// except root's: change it in the database first (docs/deployment/sealed-secrets.md).
//
// Every user lives in `admin` (clients connect with `authSource=admin`).
// Environment: MONGO_ROOT_PASSWORD (required), and one password per client of
// this replica set: MONGO_EXPORTER_PASSWORD, MONGO_BACKUP_PASSWORD,
// MONGO_AUDIT_PASSWORD (+ MONGO_AUDIT_DB), MONGO_DLQ_PASSWORD (+ MONGO_DLQ_DB).
const env = process.env;
const admin = db.getSiblingDB("admin");

const rootPassword = env.MONGO_ROOT_PASSWORD;
if (!rootPassword) {
	throw new Error("MONGO_ROOT_PASSWORD must be set");
}

const USERS = [
	// restore (oplog replay needs every action), user administration.
	["root", "MONGO_ROOT_PASSWORD", [{ role: "root", db: "admin" }]],
	// mongodb_exporter: server status, replSetGetStatus. Nothing else.
	["exporter", "MONGO_EXPORTER_PASSWORD", [{ role: "clusterMonitor", db: "admin" }]],
	// mongodump and the oplog reads of the hourly PITR archives (scripts/backup-*).
	["backup", "MONGO_BACKUP_PASSWORD", [{ role: "backup", db: "admin" }]],
	["audit-logger", "MONGO_AUDIT_PASSWORD", [{ role: "readWrite", db: env.MONGO_AUDIT_DB }]],
	["dlq-service", "MONGO_DLQ_PASSWORD", [{ role: "readWrite", db: env.MONGO_DLQ_DB }]],
];

// Before the first user exists (and while the replica set still accepts
// unauthenticated clients, --transitionToAuth) the root user is created without
// credentials; afterwards only root may manage users.
try {
	admin.auth("root", rootPassword);
} catch (e) {
	if (e.codeName !== "AuthenticationFailed") {
		throw e;
	}
	admin.createUser({ user: "root", pwd: rootPassword, roles: [{ role: "root", db: "admin" }] });
	admin.auth("root", rootPassword);
}

for (const [user, passwordVar, roles] of USERS) {
	const pwd = env[passwordVar];
	if (!pwd) {
		print(`${passwordVar} not set: user ${user} skipped`);
		continue;
	}
	if (roles.some((r) => !r.db)) {
		throw new Error(`${user}: database of the readWrite role is not set`);
	}
	if (admin.getUser(user)) {
		admin.updateUser(user, { pwd, roles });
	} else {
		admin.createUser({ user, pwd, roles });
	}
	print(`user ${user} ready`);
}
