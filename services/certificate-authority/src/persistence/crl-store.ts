import { MongoClient, Collection } from 'mongodb';

import { RevokedCertificate } from '@trading-model/certificate-utils/types';

export class CrlStore {
  private client: MongoClient;
  private collection: Collection | null = null;

  constructor(private uri: string) {
    this.client = new MongoClient(uri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    const db = this.client.db();
    this.collection = db.collection('crl');
    await this.collection.createIndex({ serialNumber: 1 }, { unique: true });
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  async add(entry: RevokedCertificate): Promise<void> {
    if (!this.collection) throw new Error('Not connected');
    await this.collection.insertOne(entry);
  }

  async getAll(): Promise<RevokedCertificate[]> {
    if (!this.collection) throw new Error('Not connected');
    const docs = await this.collection.find().toArray();
    return docs as unknown as RevokedCertificate[];
  }

  async isRevoked(serialNumber: string): Promise<boolean> {
    if (!this.collection) throw new Error('Not connected');
    const entry = await this.collection.findOne({ serialNumber });
    return entry !== null;
  }
}
