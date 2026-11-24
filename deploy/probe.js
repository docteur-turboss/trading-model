// HTTPS GET with the workload SVID as client cert: node /app/probe.js <url>. Exit 0 if status < 300.
const f = require("fs"), d = "/run/spire/svid/";
require("https").get(process.argv[2], { cert: f.readFileSync(d + "svid.pem"), key: f.readFileSync(d + "svid_key.pem"), rejectUnauthorized: false }, r => { r.pipe(process.stdout); process.exitCode = r.statusCode < 300 ? 0 : 1; }).on("error", () => process.exit(1));
