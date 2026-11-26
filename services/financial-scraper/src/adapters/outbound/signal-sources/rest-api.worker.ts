import { normalizeError } from "@trading-model/common/utils/errors";
import {
	HttpStatusError,
	InvalidPayloadError,
	NOT_MODIFIED,
	type ProtocolWorker,
} from "../../../domain/ports/signal-source.port";

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const ACCEPT = {
	json: "application/json",
	csv: "text/csv",
	text: "text/plain",
};

/** RFC 4180 table to records keyed by the header line; a row of the wrong width is refused. */
function parseCsv(text: string, delimiter: string): Record<string, string>[] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch !== '"') {
				field += ch;
			} else if (text[i + 1] === '"') {
				field += '"';
				i++;
			} else {
				quoted = false;
			}
		} else if (ch === '"' && field === "") {
			quoted = true;
		} else if (ch === delimiter) {
			row.push(field);
			field = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") {
				i++;
			}
			if (row.length > 0 || field !== "") {
				row.push(field);
				rows.push(row);
			}
			row = [];
			field = "";
		} else {
			field += ch;
		}
	}
	if (quoted) {
		throw new Error("unterminated quote");
	}
	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	const [header = [], ...lines] = rows;
	return lines.map((line, index) => {
		if (line.length !== header.length) {
			throw new Error(
				`row ${index + 2} has ${line.length} columns, not ${header.length}`
			);
		}
		return Object.fromEntries(
			header.map((name, column) => [name, line[column]])
		);
	});
}

/** Reads the body, giving up as soon as it passes the bound. */
async function readBounded(response: Response, host: string): Promise<string> {
	const chunks: Uint8Array[] = [];
	let size = 0;
	for await (const chunk of response.body ?? []) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) {
			throw new Error(`Body from ${host} over ${MAX_BODY_BYTES} bytes`);
		}
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "");
}

const MAX_VALIDATORS = 64;

/** Insert as newest; past the bound the oldest entry goes (Map keeps insertion order). */
function remember(
	map: Map<string, Record<string, string>>,
	url: string,
	value: Record<string, string>
) {
	map.delete(url);
	map.set(url, value);
	if (map.size > MAX_VALIDATORS) {
		map.delete(map.keys().next().value as string);
	}
}

/**
 * `rest_api` protocol: GET of the request URL, JSON body (or CSV / text, as
 * the source declares), 5 MB at most, JSON included. Rejects on a network
 * error, after 3 attempts of 10 s each (only a timeout is retried, at once: the
 * ECB API is slow when it publishes), or on a non-2xx status; no other retry
 * here, the collector spaces the next ticks of a failing source. A body that cannot be decoded
 * rejects with an `InvalidPayloadError`.
 *
 * Validators (`ETag`, `Last-Modified`) of the last 200 are kept in memory per
 * expanded URL, without the body, once the collector calls `confirm(url)` after
 * storing it (a 304 must never hide a body that was not stored); they are sent
 * back and a 304 resolves `NOT_MODIFIED`.
 * A `{date-N}` URL changes every day, so its entry is not reused from one day
 * to the next: each map keeps the last `MAX_VALIDATORS` URLs, oldest dropped
 * first. Lost on restart.
 */
export function createRestApiWorker(userAgent: string): ProtocolWorker {
	const validators = new Map<string, Record<string, string>>();
	const pending = new Map<string, Record<string, string>>();
	const worker: ProtocolWorker = async (request, auth, body, signal) => {
		const url = new URL(request.url);
		const format = body?.format ?? "json";
		const headers: Record<string, string> = {
			accept: ACCEPT[format],
			"user-agent": userAgent,
		};
		if (auth !== "none") {
			// An unset key never gets here: the source is not scheduled.
			const key = process.env[auth.env] ?? "";
			if (auth.in === "header") {
				headers[auth.name] = key;
			} else {
				url.searchParams.set(auth.name, key);
			}
		}
		Object.assign(headers, validators.get(request.url));
		// Rethrown with the host only: a query key must not reach a log.
		let response: Response | undefined;
		// Each attempt lasts TIMEOUT_MS, longer than any source's request spacing (>= 7.5 s).
		for (let attempt = 1; !response; attempt++) {
			response = await fetch(url, {
				headers,
				signal: AbortSignal.any([
					...(signal ? [signal] : []),
					AbortSignal.timeout(TIMEOUT_MS),
				]),
			}).catch((err: unknown): undefined => {
				const { name } = normalizeError(err);
				if (name === "TimeoutError" && attempt < MAX_ATTEMPTS) {
					return;
				}
				throw new Error(`${name} from ${url.host}`);
			});
		}
		if (response.status === 304) {
			await response.body?.cancel();
			return NOT_MODIFIED;
		}
		if (!response.ok) {
			await response.body?.cancel();
			throw new HttpStatusError(
				`HTTP ${response.status} from ${url.host}`,
				response.status,
				response.headers.get("retry-after") ?? undefined
			);
		}
		const etag = response.headers.get("etag");
		const modified = response.headers.get("last-modified");
		validators.delete(request.url);
		remember(pending, request.url, {
			...(etag && { "if-none-match": etag }),
			...(modified && { "if-modified-since": modified }),
		});
		// Read, then parse: a body cut by the network stays a transport error.
		const text = await readBounded(response, url.host);
		try {
			return format === "json"
				? JSON.parse(text)
				: format === "csv"
					? parseCsv(text, body?.delimiter ?? ",")
					: text;
		} catch (err) {
			throw new InvalidPayloadError(
				`Body from ${url.host} is not ${format}: ${normalizeError(err).message}`
			);
		}
	};
	worker.confirm = (url) => {
		const entry = pending.get(url);
		if (entry) {
			remember(validators, url, entry);
			pending.delete(url);
		}
	};
	return worker;
}
