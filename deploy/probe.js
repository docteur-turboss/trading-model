// HTTPS GET with the workload SVID as client cert: node /app/probe.js <url>. Exit 0 if status < 300.
// Server chain checked against the SPIRE bundle; the SVID has only a SPIFFE URI SAN, so the host name check is a trust-domain URI check.
const f = require("fs"), d = "/run/spire/svid/";
const checkServerIdentity = (_host, c) => /(^|, )URI:spiffe:\/\/trading-model\.local\//.test(c.subjectaltname || "") ? undefined : new Error("server SVID not in trust domain");
require("https").get(process.argv[2], { cert: f.readFileSync(d + "svid.pem"), key: f.readFileSync(d + "svid_key.pem"), ca: f.readFileSync(d + "bundle.pem"), checkServerIdentity }, r => { r.pipe(process.stdout); process.exitCode = r.statusCode < 300 ? 0 : 1; }).on("error", () => process.exit(1));
