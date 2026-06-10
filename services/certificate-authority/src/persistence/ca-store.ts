import { MongoClient, Collection } from 'mongodb';

import { CaMetadata } from '@trading-model/certificate-utils/types';

export class CaStore {
  private client: MongoClient;
  private collection: Collection | null = null;

  constructor(private uri: string) {
    this.client = new MongoClient(uri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    const db = this.client.db();
    this.collection = db.collection('ca_store');
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  async save(metadata: CaMetadata): Promise<void> {
    if (!this.collection) throw new Error('Not connected');
    await this.collection.insertOne(metadata);
  }

  async getLatest(): Promise<CaMetadata | null> {
    if (!this.collection) throw new Error('Not connected');
    const doc = await this.collection.findOne({}, { sort: { createdAt: -1 } });
    return doc as unknown as CaMetadata | null;
  }
}
