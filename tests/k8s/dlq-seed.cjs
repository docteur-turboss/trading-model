// Deletes the throwaway dead letter `argv[2]` through the dlq-service API:
// dlq-service records dlq.entries.deleted, which grows the audit chain (nothing
// posts dead letters over HTTP any more, ADR-0073). Request signed by the
// image's own request-signer with DLQ_AUTH_HMAC_SECRET, sent over mTLS with
// the pod's SVID. Run inside the message-manager container by the restore
// drill (tests/k8s/run-kind.sh):
//   kubectl exec -i deployment/message-manager -c message-manager -- node - <id> < tests/k8s/dlq-seed.cjs
const fs = require("node:fs");
const https = require("node:https");
const {
	buildSignedHeaders,
} = require("/app/packages/crypto/dist/request-signer.js");

const body = { ids: [process.argv[2]] };
const headers = buildSignedHeaders(
	{ serviceName: "message-manager", method: "DELETE", path: "/v1/dlq", body },
	process.env.DLQ_AUTH_HMAC_SECRET
);
const svid = "/run/spire/svid";
const request = https.request(
	{
		host: "dlq-service",
		port: 3000,
		path: "/v1/dlq",
		method: "DELETE",
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
			if (response.statusCode !== 200) {
				console.error(`dlq-service answered ${response.statusCode}: ${text}`);
				process.exit(1);
			}
			console.log(text);
		});
	}
);
request.on("error", (err) => {
	console.error(err.message);
	process.exit(1);
});
request.end(JSON.stringify(body));
