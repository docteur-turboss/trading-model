export class AsyncDeduper<T> {
	private _promise: Promise<T> | null = null;

	async run(factory: () => Promise<T>): Promise<T> {
		if (this._promise) {
			return this._promise;
		}
		this._promise = factory().finally(() => {
			this._promise = null;
		});
		return this._promise;
	}

	get pending(): Promise<T> | null {
		return this._promise;
	}

	clear(): void {
		this._promise = null;
	}
}
