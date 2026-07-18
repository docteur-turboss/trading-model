import type { PaginationResult } from "../domain/pagination";

export interface MongoRepository<TDoc> {
	insert(doc: TDoc): Promise<void>;
	insertBatch(docs: TDoc[]): Promise<void>;
	findById(id: string): Promise<TDoc | null>;
	ensureIndexes(): Promise<void>;
	query(query: Record<string, unknown>): Promise<PaginationResult<TDoc>>;
}
