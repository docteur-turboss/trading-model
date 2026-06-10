import { MongoClient, Collection } from 'mongodb';

import { SignedCertificate } from '@trading-model/certificate-utils/types';

export class CertificateStore {
  private client: MongoClient;
  private collection: Collection | null = null;

  constructor(private uri: string) {
    this.client = new MongoClient(uri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    const db = this.client.db();
    this.collection = db.collection('certificates');
    await this.collection.createIndex({ serialNumber: 1 }, { unique: true });
    await this.collection.createIndex({ serviceId: 1 });
    await this.collection.createIndex({ expiresAt: 1 });
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  async save(cert: SignedCertificate): Promise<void> {
    if (!this.collection) throw new Error('Not connected');
    await this.collection.insertOne(cert);
  }

  async getBySerial(serialNumber: string): Promise<SignedCertificate | null> {
    if (!this.collection) throw new Error('Not connected');
    const doc = await this.collection.findOne({ serialNumber });
    return doc as unknown as SignedCertificate | null;
  }

  async getByServiceId(serviceId: string): Promise<SignedCertificate | null> {
    if (!this.collection) throw new Error('Not connected');
    const doc = await this.collection.findOne({ serviceId }, { sort: { issuedAt: -1 } });
    return doc as unknown as SignedCertificate | null;
  }

  async getExpiring(marginMs: number): Promise<SignedCertificate[]> {
    if (!this.collection) throw new Error('Not connected');
    const threshold = new Date(Date.now() + marginMs);
    const docs = await this.collection.find({ expiresAt: { $lte: threshold } }).toArray();
    return docs as unknown as SignedCertificate[];
  }
}
