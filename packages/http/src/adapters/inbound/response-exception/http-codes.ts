import type { HttpStatusCode } from "@trading-model/contracts/http-status";

export interface ResponseObject {
	status: HttpStatusCode;
	data: unknown;
	/** Media type of `data` when it is not JSON (a Buffer for binary content). */
	contentType?: string;
	headers?: Readonly<Record<string, string>>;
}
