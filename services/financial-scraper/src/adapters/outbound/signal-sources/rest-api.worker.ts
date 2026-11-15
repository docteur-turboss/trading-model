import { normalizeError } from "@trading-model/common/utils/errors";
import {
	HttpStatusError,
	InvalidPayloadError,
	type ProtocolWorker,
} from "../../../domain/ports/signal-source.port";

const TIMEOUT_MS = 10_000;
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
			row.push(field);
			rows.push(row);
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
	return Buffer.concat(chunks).toString("utf8");
}

/**
 * `rest_api` protocol: GET of the request URL, JSON body (or CSV / text, as the source declares, 5 MB at most). Rejects on a
 * network error, after 10 s, or on a non-2xx status; no retry here, the
 * collector spaces the next ticks of a failing source. A body that cannot be
 * decoded rejects with an `InvalidPayloadError`.
 */
export function createRestApiWorker(userAgent: string): ProtocolWorker {
	return async (request, auth, body) => {
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
		// Rethrown with the host only: a query key must not reach a log.
		const response = await fetch(url, {
			headers,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		}).catch((err: unknown) => {
			throw new Error(`${normalizeError(err).name} from ${url.host}`);
		});
		if (!response.ok) {
			await response.body?.cancel();
			throw new HttpStatusError(
				`HTTP ${response.status} from ${url.host}`,
				response.status,
				response.headers.get("retry-after") ?? undefined
			);
		}
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
}
