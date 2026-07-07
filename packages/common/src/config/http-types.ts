import type https from "node:https";
import { HttpMethod } from "../contracts/signed-request";

interface HttpRequestOptions {
	timeoutMs?: number;
	headers?: Record<string, string>;
	retryCount?: number;
	agent?: https.Agent;
	serviceName?: string;
	serviceInstanceCount?: number;
}

export type { HttpRequestOptions };
export { HttpMethod };
