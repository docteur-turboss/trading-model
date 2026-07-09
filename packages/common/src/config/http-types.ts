import type https from "node:https";
import { HttpMethod } from "../contracts/signed-request";
import type { ServiceId } from "../domain/primitives";

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
