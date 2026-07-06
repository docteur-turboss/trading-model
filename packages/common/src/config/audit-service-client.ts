import { request as httpsRequest } from "node:https";

import type { TlsPaths } from "../domain/tls-paths";
import { normalizeError } from "../utils/errors";
import type { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";

type AuditTarget = { url: string; tls: TlsPaths };
type AuditResolver = () => Promise<AuditTarget | null>;

export class AuditServiceClient {
	private readonly _sanitizer: SensitiveDataSanitizer;
	private readonly _auditResolver?: AuditResolver;

	constructor(
		sanitizer: SensitiveDataSanitizer,
		auditResolver?: AuditResolver
	) {
		this._sanitizer = sanitizer;
		this._auditResolver = auditResolver;
	}

	async send(entry: Record<string, unknown>): Promise<void> {
		if (!this._auditResolver) {
			return;
		}
		try {
			const auditTarget = await this._auditResolver();
			if (!auditTarget) {
				return;
			}
			await this._postToAuditEndpoint(auditTarget, entry);
		} catch (err) {
			console.error(
				"Failed to send log to audit service:",
				normalizeError(err).message,
			);
		}
	}

	private _buildHttpsOptions(
		url: string,
		body: string,
		tls: TlsPaths
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
			key: tls.keyPath,
			cert: tls.certPath,
			ca: tls.caPath,
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
