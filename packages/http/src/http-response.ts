import type { IncomingMessage } from "node:http";
import { pipeline } from "node:stream";
import { createGunzip, createInflate } from "node:zlib";
import {
	HTTP_STATUS,
	type HttpStatusCode,
} from "@trading-model/contracts/http-status";
import type { URLString } from "@trading-model/primitives/primitives";
import type { z } from "zod";
import { createHttpClientError } from "./http-client-errors";
import type { HttpMethod } from "./http-types";

interface ResponseCollectionContext<TResponse> {
	res: IncomingMessage;
	method: HttpMethod;
	urlStr: URLString;
	schema?: z.ZodType<TResponse>;
}

/** Largest decompressed body accepted: 16 MiB, far above any known answer (Binance, signal sources: well under 1 MiB). */
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

function decompressResponse(
	res: IncomingMessage,
	onError: (err: Error) => void
): NodeJS.ReadableStream {
	const contentEncoding = (res.headers["content-encoding"] as string) || "";
	const zlib = contentEncoding.includes("gzip")
		? createGunzip()
		: contentEncoding.includes("deflate")
			? createInflate()
			: undefined;
	if (!zlib) {
		res.on("error", onError);
		return res;
	}
	// pipeline forwards errors of both streams, `pipe` does not
	return pipeline(res, zlib, (err) => err && onError(err));
}

function parseResponseBody<TResponse>(
	data: string,
	contentType: string,
	schema?: z.ZodType<TResponse>
): TResponse {
	const parsed: unknown = contentType.startsWith("application/json")
		? JSON.parse(data)
		: data;
	return schema ? schema.parse(parsed) : (parsed as TResponse);
}

function collectResponseBody<TResponse>(
	context: ResponseCollectionContext<TResponse>
): Promise<TResponse | undefined> {
	const { res, method, urlStr, schema } = context;
	return new Promise<TResponse | undefined>((resolve, reject) => {
		let data = "";
		let bytes = 0;
		const stream = decompressResponse(res, reject);
		stream.setEncoding("utf8");

		stream.on("data", (chunk: string) => {
			bytes += Buffer.byteLength(chunk);
			if (bytes > MAX_RESPONSE_BYTES) {
				res.destroy();
				return reject(
					new Error(
						`Response body over ${MAX_RESPONSE_BYTES} bytes on ${method} ${urlStr}`
					)
				);
			}
			data += chunk;
		});
		stream.on("end", () => {
			if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
				return reject(
					createHttpClientError(
						`HTTP ${res.statusCode} on ${method} ${urlStr}`,
						res.statusCode as HttpStatusCode
					)
				);
			}

			if (res.statusCode === HTTP_STATUS.NO_CONTENT) {
				return resolve(undefined);
			}

			try {
				const contentType = res.headers["content-type"] || "";
				resolve(parseResponseBody(data, contentType, schema));
			} catch (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	});
}

export { collectResponseBody };
