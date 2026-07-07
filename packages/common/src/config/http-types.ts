import type https from "node:https";
import type { ServiceId } from "../domain/primitives";
import { HttpMethod } from "../contracts/signed-request";

type HttpHeaders = Record<string, string>;

interface HttpRequestOptions {
	timeoutMs?: number;
	headers?: HttpHeaders;
	retryCount?: number;
	agent?: https.Agent;
	serviceName?: ServiceId;
	serviceInstanceCount?: number;
}

export type { HttpHeaders, HttpRequestOptions };
export { HttpMethod };
