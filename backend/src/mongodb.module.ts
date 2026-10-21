import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { MongoClient, Db } from 'mongodb';

export const MONGODB_CONNECTION = 'MONGODB_CONNECTION';

@Injectable()
export class MongoConnectionService implements OnModuleDestroy {
  private client: MongoClient | null = null;

  async connect(): Promise<Db> {
    const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/swafcode';
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
    await this.client.connect();
    return this.client.db();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }
}

@Global()
@Module({
  providers: [
    MongoConnectionService,
    {
      provide: MONGODB_CONNECTION,
      inject: [MongoConnectionService],
      useFactory: (service: MongoConnectionService) => service.connect(),
    },
    {
      provide: Db,
      useExisting: MONGODB_CONNECTION,
    },
  ],
  exports: [MONGODB_CONNECTION, Db, MongoConnectionService],
})
export class MongoModule {}
