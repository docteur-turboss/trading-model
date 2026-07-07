export class ActiveReplayCounter {
	private _count = 0;
	get count(): number {
		return this._count;
	}
	increment(): void {
		this._count++;
	}
	decrement(): void {
		if (this._count > 0) {
			this._count--;
		}
	}
}

export const activeReplays = new ActiveReplayCounter();
