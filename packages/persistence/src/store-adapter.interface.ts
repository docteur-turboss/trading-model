export interface IStoreAdapter<TValue> {
	get(key: string): Promise<TValue | null>;
	set(key: string, value: TValue, ttlMs?: number): Promise<void>;
	delete(key: string): Promise<void>;
	clear?(): Promise<void>;
}
