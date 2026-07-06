import { request as httpsRequest } from "node:https";

import { normalizeError } from "../utils/errors";
import { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";

export interface AuditTlsPaths {
	key: string;
	cert: string;
	ca: string;
}

type AuditTarget = { url: string; tls: AuditTlsPaths };

export class AuditServiceClient {
	private _auditResolver?: () => Promise<AuditTarget | null>;

	private readonly _sanitizer: SensitiveDataSanitizer;

	constructor(sanitizer: SensitiveDataSanitizer) {
		this._sanitizer = sanitizer;
	}

	setAuditResolver(
		resolver: () => Promise<AuditTarget | null>
	): void {
		this._auditResolver = resolver;
	}

	async send(entry: Record<string, unknown>): Promise<void> {
		if (!this._auditResolver) {
			return;
		}
		let auditTarget: AuditTarget | null;
		try {
			auditTarget = await this._auditResolver();
		} catch {
			return;
		}
		if (!auditTarget) {
			return;
		}
		try {
			await this._postToAuditEndpoint(auditTarget, entry);
		} catch (err) {
			const normalized = normalizeError(err);
			console.error(
				"Failed to send log to audit service:",
				normalized.message
			);
		}
	}

	private _buildHttpsOptions(
		url: string,
		body: string,
		tls: AuditTlsPaths
	): Record<string, unknown> {
		const urlObj = new URL(url);
		return {
			hostname: urlObj.hostname,
			port: urlObj.port ? Number(urlObj.port) : 443,
			path: "/api/logs",
			method: "POST" as const,
			headers: {
				"Content-Type": "application/json",
				"Content-Length": Buffer.byteLength(body).toString(),
			},
			...tls,
			rejectUnauthorized: true,
		};
	}

	private _makeHttpsRequest(
		opts: Record<string, unknown>,
		body: string
	): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const req = httpsRequest(opts, (res) => {
				res.on("data", () => {});
				res.on("end", () => resolve());
			});
			req.on("error", reject);
			req.write(body);
			req.end();
		});
	}

	private async _postToAuditEndpoint(
		auditTarget: AuditTarget,
		entry: Record<string, unknown>
	): Promise<void> {
		const body = this._sanitizer.safeStringify(entry);
		const opts = this._buildHttpsOptions(
			auditTarget.url,
			body,
			auditTarget.tls
		);
		await this._makeHttpsRequest(opts, body);
	}
}
