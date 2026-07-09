export class CircularBuffer<TItem> {
	private readonly _items: TItem[] = [];
	private readonly _maxSize: number;

	constructor(maxSize: number) {
		this._maxSize = maxSize;
	}

	add(item: TItem): void {
		this._items.push(item);
		if (this._items.length > this._maxSize) {
			this._items.shift();
		}
	}

	getAll(): TItem[] {
		return this._items;
	}

	drain(): TItem[] {
		const items = this._items.splice(0, this._maxSize);
		return items;
	}

	get size(): number {
		return this._items.length;
	}

	get maxSize(): number {
		return this._maxSize;
	}

	clear(): void {
		this._items.length = 0;
	}
}
