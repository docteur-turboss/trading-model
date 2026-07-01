export class Deque<T> {
  private items: Record<number, T> = {};
  private front = 0;
  private back = 0;

  push(value: T): void {
    this.items[this.back] = value;
    this.back++;
  }

  shift(): T | undefined {
    if (this.front === this.back) return undefined;
    const item = this.items[this.front];
    delete this.items[this.front];
    this.front++;
    return item;
  }

  peekFront(): T | undefined {
    return this.items[this.front];
  }

  get length(): number {
    return this.back - this.front;
  }

  clear(): void {
    this.items = {};
    this.front = 0;
    this.back = 0;
  }
}
