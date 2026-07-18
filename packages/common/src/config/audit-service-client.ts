import { type JsonObject, URLString } from "../domain/primitives";
import type { TlsPaths } from "../domain/tls-paths";
import { normalizeError } from "../utils/errors";
import { HttpClient } from "./http-client";

interface AuditTarget {
	url: URLString;
	tls: TlsPaths;
}
type AuditResolver = () => Promise<AuditTarget | null>;

export class AuditServiceClient {
	private readonly _safeStringify: (value: unknown) => string;
	private readonly _auditResolver: AuditResolver;

	constructor(
		safeStringify: (value: unknown) => string,
		auditResolver?: AuditResolver
	) {
		this._safeStringify = safeStringify;
		this._auditResolver = auditResolver ?? (() => Promise.resolve(null));
	}

	async send(entry: JsonObject): Promise<void> {
		try {
			const auditTarget = await this._auditResolver();
			if (!auditTarget) {
				return;
			}
			await this._postToAuditEndpoint(auditTarget, entry);
		} catch (err) {
			console.error(
				"Failed to send log to audit service:",
				normalizeError(err).message
			);
		}
	}

	private async _postToAuditEndpoint(
		auditTarget: AuditTarget,
		entry: JsonObject
	): Promise<void> {
		const body = this._safeStringify(entry);
		const client = HttpClient.createWithTls(auditTarget.tls);
		await client.post(URLString.of(`${auditTarget.url}/api/logs`), body);
	}
}
