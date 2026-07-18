import type { LockBackend, LockContext } from "./lock-backends";

export class LockSession {
	private _token = -1;

	get isHeld(): boolean {
		return this._token >= 0;
	}

	get token(): number {
		return this._token;
	}

	set(token: number): void {
		this._token = token;
	}

	invalidate(): void {
		this._token = -1;
	}

	async verifyOwnership(
		backends: LockBackend[],
		context: LockContext
	): Promise<number> {
		if (!this.isHeld) {
			return -1;
		}
		for (const backend of backends) {
			const result = await backend.verifyOwnership(context, this._token);
			if (result >= 0) {
				return result;
			}
		}
		this.invalidate();
		return -1;
	}
}
