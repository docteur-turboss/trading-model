import type { HttpStatusCode } from "@trading-model/contracts/http-status";

/** Status and payload of a response to send to the client. */
export interface ResponseObject {
	status: HttpStatusCode;
	data: unknown;
	/** Media type of `data` when it is not JSON (a Buffer for binary content). */
	contentType?: string;
	headers?: Readonly<Record<string, string>>;
}
