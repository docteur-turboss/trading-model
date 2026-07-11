export class AsyncDeduper<_TResult> {
	private _promise: Promise<_TResult> | null = null;

	run(factory: () => Promise<_TResult>): Promise<_TResult> {
		if (this._promise !== null) {
			return this._promise;
		}
		this._promise = factory().finally(() => {
			this._promise = null;
		});
		return this._promise;
	}

	get pending(): Promise<_TResult> | null {
		return this._promise;
	}

	clear(): void {
		this._promise = null;
	}
}
