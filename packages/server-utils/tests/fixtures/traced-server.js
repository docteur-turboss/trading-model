/**
 * Runs as its own Node process (Jest's module loader bypasses the require
 * hooks the instrumentations rely on): starts telemetry the way a service
 * entry point does, serves one Express request, then flushes the spans.
 * `late` starts telemetry after Express is loaded, the order issue #599 fixed.
 */
const late = process.argv[2] === "late";
const telemetry = require("../../src/infrastructure/telemetry");

if (!late) telemetry.startTelemetry("api-gateway");
const express = require("express");
const http = require("node:http");
if (late) telemetry.startTelemetry("api-gateway");

const app = express();
app.get("/traced", (_req, res) => res.send("ok"));
const server = http.createServer(app).listen(0, "127.0.0.1", () => {
	const { port } = server.address();
	http.get(`http://127.0.0.1:${port}/traced`, (res) => {
		res.resume();
		res.on("end", () => {
			server.close();
			telemetry.shutdownTelemetry();
		});
	});
});
