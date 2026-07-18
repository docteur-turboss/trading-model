import type { IncomingMessage } from "node:http";
import { createGunzip, createInflate } from "node:zlib";
import type { z } from "zod";
import type { URLString } from "../domain/primitives";
import type { HttpStatusCode } from "../http-status";
import { createHttpClientError } from "./http-client-errors";
import type { HttpMethod } from "./http-types";

interface ResponseCollectionContext<TResponse> {
	res: IncomingMessage;
	method: HttpMethod;
	urlStr: URLString;
	schema?: z.ZodType<TResponse>;
}

function decompressResponse(res: IncomingMessage): NodeJS.ReadableStream {
	const contentEncoding = (res.headers["content-encoding"] as string) || "";
	if (contentEncoding.includes("gzip")) {
		return res.pipe(createGunzip());
	}
	if (contentEncoding.includes("deflate")) {
		return res.pipe(createInflate());
	}
	return res;
}

function parseResponseBody<TResponse>(
	data: string,
	contentType: string,
	schema?: z.ZodType<TResponse>
): TResponse {
	if (contentType.startsWith("application/json")) {
		const parsed: unknown = JSON.parse(data);
		return schema ? schema.parse(parsed) : (parsed as TResponse);
	}
	const parsed: unknown = data;
	return schema ? schema.parse(parsed) : (parsed as TResponse);
}

function collectResponseBody<TResponse>(
	context: ResponseCollectionContext<TResponse>
): Promise<TResponse | undefined> {
	const { res, method, urlStr, schema } = context;
	return new Promise<TResponse | undefined>((resolve, reject) => {
		let data = "";
		const stream = decompressResponse(res);

		stream.on("data", (chunk: string) => {
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

			if (res.statusCode === 204) {
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

export type { ResponseCollectionContext };
export { collectResponseBody, decompressResponse, parseResponseBody };
