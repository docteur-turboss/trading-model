export class Deque<TData> {
	private _items: Record<number, TData> = {};
	private _front = 0;
	private _back = 0;

	push(value: TData): void {
		this._items[this._back] = value;
		this._back++;
	}

	shift(): TData | undefined {
		if (this._front === this._back) {
			return;
		}
		const item = this._items[this._front];
		delete this._items[this._front];
		this._front++;
		return item;
	}

	peekFront(): TData | undefined {
		return this._items[this._front];
	}

	get length(): number {
		return this._back - this._front;
	}

	clear(): void {
		this._items = {};
		this._front = 0;
		this._back = 0;
	}
}
