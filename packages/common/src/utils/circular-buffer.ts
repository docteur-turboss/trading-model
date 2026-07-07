export class CircularBuffer<T> {
	private readonly _items: T[] = [];
	private readonly _maxSize: number;

	constructor(maxSize: number) {
		this._maxSize = maxSize;
	}

	add(item: T): void {
		this._items.push(item);
		if (this._items.length > this._maxSize) {
			this._items.shift();
		}
	}

	getAll(): T[] {
		return this._items;
	}

	drain(): T[] {
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
