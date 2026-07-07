import { normalizeError } from "../utils/errors";
import type { HttpMethod } from "./http-types";
import type { LogEntry } from "./log-types";
import type { SensitiveDataSanitizer } from "./sensitive-data-sanitizer";

export class ErrorServiceSender {
	private readonly _env: string | undefined;

	constructor(
		private readonly _sanitizer: SensitiveDataSanitizer,
		env: string | undefined
	) {
		this._env = env;
	}

	private _shouldSend(): boolean {
		return this._env === "production" || this._env === "staging";
	}

	async send(entry: LogEntry): Promise<void> {
		if (!this._shouldSend()) {
			return;
		}
		try {
			await this._postEntry(entry);
		} catch (err) {
			console.error(
				"Failed to send log to service:",
				normalizeError(err).message
			);
		}
	}

	private async _postEntry(entry: LogEntry): Promise<void> {
		await fetch(process.env.ERROR_URL_WEBHOOK ?? "/", {
			method: "POST" as HttpMethod,
			headers: { "Content-Type": "application/json" },
			body: this._sanitizer.safeStringify(entry),
		});
	}
}
