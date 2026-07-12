import type { SignCertificateResponse } from "@trading-model/crypto/ca/ca-client";
import type { CaWssMessageType } from "./auth-handler";

interface PendingRequest {
	resolve: (value: SignCertificateResponse) => void;
	reject: (reason: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export interface CaSignResponse {
	type: CaWssMessageType.SignResponse | CaWssMessageType.Response;
	id: string;
	success: boolean;
	data?: SignCertificateResponse;
	error?: { message?: string };
}

export class PendingRequestManager {
	private readonly _pending = new Map<string, PendingRequest>();

	create(id: string): Promise<SignCertificateResponse> {
		return new Promise<SignCertificateResponse>((resolve, reject) => {
			const timer = setTimeout(() => {
				this._pending.delete(id);
				reject(new Error("WSS request timed out"));
			}, 30_000);

			this._pending.set(id, { resolve, reject, timer });
		});
	}

	private _resolvePending(pending: PendingRequest, msg: CaSignResponse): void {
		if (msg.success && msg.data) {
			pending.resolve(msg.data);
		} else {
			pending.reject(new Error(msg.error?.message ?? "WSS request failed"));
		}
	}

	handleResponse(msg: CaSignResponse): void {
		const pending = this._pending.get(msg.id);
		if (!pending) {
			return;
		}
		clearTimeout(pending.timer);
		this._pending.delete(msg.id);
		this._resolvePending(pending, msg);
	}

	cancel(id: string, err?: Error): void {
		const pending = this._pending.get(id);
		if (pending) {
			clearTimeout(pending.timer);
			if (err) {
				pending.reject(err);
			}
			this._pending.delete(id);
		}
	}

	rejectAll(reason: Error): void {
		for (const [id, pending] of this._pending) {
			clearTimeout(pending.timer);
			pending.reject(reason);
			this._pending.delete(id);
		}
	}
}
