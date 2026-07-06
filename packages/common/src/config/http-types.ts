import https from "node:https";

type HttpMethod = "GET" | "POST" | "DELETE";

interface HttpRequestOptions {
	timeoutMs?: number;
	headers?: Record<string, string>;
	retryCount?: number;
	agent?: https.Agent;
	serviceName?: string;
	serviceInstanceCount?: number;
}

export type { HttpMethod, HttpRequestOptions };
