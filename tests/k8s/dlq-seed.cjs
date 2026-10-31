// Stores one dead letter in dlq-service the way message-manager does: request
// signed by the image's own request-signer with DLQ_AUTH_HMAC_SECRET, sent
// over mTLS with the pod's SVID (HttpDeadLetterStore). Run inside the
// message-manager container by the restore drill (tests/k8s/run-kind.sh):
//   kubectl exec -i deployment/message-manager -c message-manager -- node - < tests/k8s/dlq-seed.cjs
// Prints the id dlq-service gave the entry.
const fs = require("node:fs");
const https = require("node:https");
const {
	buildSignedHeaders,
} = require("/app/packages/crypto/dist/application/services/request-signer.js");

const now = Date.now();
const body = {
	topic: "restore-drill",
	message: { drill: "restore", seededAt: now },
	reason: "restore drill: dead letter that must survive a restore",
	deliveryAttempt: 3,
	timestamp: now,
	messageId: `restore-drill-${now}`,
};
const headers = buildSignedHeaders(
	{ serviceName: "message-manager", method: "POST", path: "/dlq", body },
	process.env.DLQ_AUTH_HMAC_SECRET
);
const svid = "/run/spire/svid";
const request = https.request(
	{
		host: "dlq-service",
		port: 3000,
		path: "/dlq",
		method: "POST",
		headers: { ...headers, "content-type": "application/json" },
		cert: fs.readFileSync(`${svid}/svid.pem`),
		key: fs.readFileSync(`${svid}/svid_key.pem`),
		ca: fs.readFileSync(`${svid}/bundle.pem`),
		// SVIDs name a SPIFFE ID, not a DNS name: trust comes from the bundle.
		checkServerIdentity: () => undefined,
	},
	(response) => {
		let text = "";
		response.on("data", (chunk) => {
			text += chunk;
		});
		response.on("end", () => {
			if (response.statusCode !== 201) {
				console.error(`dlq-service answered ${response.statusCode}: ${text}`);
				process.exit(1);
			}
			console.log(JSON.parse(text).id);
		});
	}
);
request.on("error", (err) => {
	console.error(err.message);
	process.exit(1);
});
request.end(JSON.stringify(body));
