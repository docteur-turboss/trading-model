import { normalizeError } from "../utils/errors";
import type { LogEntry } from "./log-types";
import type { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";

export class ErrorServiceSender {
	private readonly _env: string | undefined;
	private _handleErrorServiceUrl: string | null = null;

	constructor(
		private readonly _sanitizer: SensitiveDataSanitizer,
		env: string | undefined
	) {
		this._env = env;
	}

	setErrorHandlerService(url: string): void {
		this._handleErrorServiceUrl = url;
	}

	async send(entry: LogEntry): Promise<void> {
		if (this._env !== "production" && this._env !== "staging") {
			return;
		}
		try {
			await fetch(
				process.env.ERROR_URL_WEBHOOK ?? this._handleErrorServiceUrl ?? "/",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: this._sanitizer.safeStringify(entry),
				}
			);
		} catch (err) {
			const normalized = normalizeError(err);
			console.error("Failed to send log to service:", normalized.message);
		}
	}
}
