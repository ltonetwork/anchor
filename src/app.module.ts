import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from './config/config.module';
import { LoggerModule } from './logger/logger.module';
import { InfoModule } from './info/info.module';
import { AnchorModule } from './anchor/anchor.module';
import { HashModule } from './hash/hash.module';
import { NodeModule } from './node/node.module';
import { RedisModule } from './redis/redis.module';
import { RequestModule } from './request/request.module';
import { TransactionModule } from './transaction/transaction.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';

export const AppModuleConfig = {
  imports: [
    LoggerModule,
    ConfigModule,
    RequestModule,
    InfoModule,
    HealthModule,
    AnchorModule,
    HashModule,
    NodeModule,
    RedisModule,
    TransactionModule,
    StorageModule,
  ],
  controllers: [AppController],
  providers: [],
};

@Module(AppModuleConfig)
export class AppModule { }
