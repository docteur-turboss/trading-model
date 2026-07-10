import type { JsonObject } from "../domain/primitives";
import type { TlsPaths } from "../domain/tls-paths";
import { normalizeError } from "../utils/errors";
import { HttpClient } from "./http-client";
import type { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";

interface AuditTarget {
	url: string;
	tls: TlsPaths;
}
type AuditResolver = () => Promise<AuditTarget | null>;

export class AuditServiceClient {
	private readonly _sanitizer: SensitiveDataSanitizer;
	private readonly _auditResolver: AuditResolver;

	constructor(
		sanitizer: SensitiveDataSanitizer,
		auditResolver?: AuditResolver
	) {
		this._sanitizer = sanitizer;
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
		const body = this._sanitizer.safeStringify(entry);
		const client = HttpClient.createWithTls(auditTarget.tls);
		await client.post(`${auditTarget.url}/api/logs`, body);
	}
}
