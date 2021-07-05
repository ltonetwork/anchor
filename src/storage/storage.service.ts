import { ModuleRef } from '@nestjs/core';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { StorageInterface } from './interfaces/storage.interface';
import { StorageTypeEnum } from '../config/enums/storage.type.enum';
import storageServices from './types';
import PascalCase from 'pascal-case';
import { Transaction } from '../transaction/interfaces/transaction.interface';
import { LoggerService } from '../logger/logger.service';
import { MethodObject, VerificationMethod } from '../verification-method/model/verification-method.model';
import { Role, RoleData } from '../trust-network/interfaces/trust-network.interface';

@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private storage: StorageInterface;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    private readonly moduleRef: ModuleRef,
  ) { }

  async onModuleInit() {
    if (this.config.getStorageType() === StorageTypeEnum.Redis) {
      const name = PascalCase(`${StorageTypeEnum.Redis}_storage_service`);
      this.storage = this.moduleRef.get(storageServices[name]);
    } else {
      const name = PascalCase(`${StorageTypeEnum.LevelDB}_storage_service`);
      this.storage = this.moduleRef.get(storageServices[name]);
    }
  }

  async onModuleDestroy() {}

  getAnchor(hash: string): Promise<any> {
    return this.storage.getObject(`lto:anchor:${hash.toLowerCase()}`);
  }

  saveAnchor(hash: string, transaction: object) {
    return this.storage.addObject(`lto:anchor:${hash.toLowerCase()}`, transaction);
  }

  getPublicKey(address: string) {
    return this.storage.getValue(`lto:pubkey:${address}`);
  }

  savePublicKey(address: string, publicKey: string) {
    return this.storage.setValue(`lto:pubkey:${address}`, publicKey);
  }

  async getVerificationMethods(address: string): Promise<VerificationMethod[]> {
    const result: VerificationMethod[] = [];
    const methods = await this.storage.getObject(`lto:verification:${address}`);

    for (const key in methods) {
      const data: MethodObject = methods[key];

      if (!data.revokedAt) {
        const method = new VerificationMethod(data.relationships, data.sender, data.recipient, data.createdAt);
  
        result.push(method);
      };
    }

    return result;
  }

  async saveVerificationMethod(address: string, verificationMethod: VerificationMethod): Promise<void> {
    const data = await this.storage.getObject(`lto:verification:${address}`);
    const newData = verificationMethod.json();

    data[newData.recipient] = newData;

    return this.storage.addObject(`lto:verification:${address}`, data);
  }

  async getTrustNetworkRoles(address: string): Promise<RoleData> {
    const result: RoleData = {
      roles: [],
      issues_roles: [],
      issues_authorization: [],
    };

    const configRoles = this.config.getTrustNetworkRoles();
    const roles = await this.storage.getObject(`lto:roles:${address}`);

    for (const role in roles) {
      const configData = configRoles[role];
      
      if (configData) {
        result.roles.push(role);

        configData.issues?.forEach(eachIssues => {
          if (result.issues_roles.findIndex(each => each.role === eachIssues.role) === -1) {
            result.issues_roles.push(eachIssues);
          }
        });

        configData.authorization?.forEach(eachAuthorization => {
          if (result.issues_authorization.findIndex(each => each === eachAuthorization) === -1) {
            result.issues_authorization.push(eachAuthorization);
          }
        });
      }
    }

    return result;
  }

  async saveTrustNetworkRole(recipient: string, sender: string, data: Role): Promise<void> {
    const roles = await this.storage.getObject(`lto:roles:${recipient}`);

    roles[data.role] = { sender, type: data.type };

    return this.storage.addObject(`lto:roles:${recipient}`, roles);
  }

  async saveAssociation(transaction: Transaction) {
    await this.storage.sadd(`lto:assoc:${transaction.sender}:childs`, transaction.party);
    await this.storage.sadd(`lto:assoc:${transaction.party}:parents`, transaction.sender);

    this.logger.debug(`storage-service: Add assoc for ${transaction.sender} child ${transaction.party}`);
  }

  async removeAssociation(transaction: Transaction) {
    await this.storage.srem(`lto:assoc:${transaction.sender}:childs`, transaction.party);
    await this.storage.srem(`lto:assoc:${transaction.party}:parents`, transaction.sender);

    await this.recurRemoveAssociation(transaction.party);
    this.logger.debug(`storage-service: removed assoc for ${transaction.sender} child ${transaction.party}`);
  }

  async recurRemoveAssociation(address: string) {
    const childAssocs = await this.storage.getArray(`lto:assoc:${address}:childs`);
    for (const child of childAssocs) {
      await this.storage.srem(`lto:assoc:${address}:childs`, child);
      await this.storage.srem(`lto:assoc:${child}:parents`, address);
      await this.recurRemoveAssociation(child);
      this.logger.debug(`storage-service: Remove assoc for ${address} child ${child}`);
    }
  }

  async getAssociations(address: string): Promise<any> {
    return {
      children: await this.storage.getArray(`lto:assoc:${address}:childs`),
      parents: await this.storage.getArray(`lto:assoc:${address}:parents`),
    };
  }

  incrTxStats(type: string, day: number): Promise<void> {
    return this.storage.incrValue(`lto:txstats:${type}:${day}`);
  }

  async getTxStats(type: string, from: number, to: number): Promise<{period: string, count: number}[]> {
    const length = to - from + 1;
    const keys = Array.from({length}, (v, i) => `lto:txstats:${type}:${from + i}`);
    const values = await this.storage.getMultipleValues(keys);

    const periods = Array.from({length}, (v, i) => new Date((from + i) * 86400000));
    return periods
      .map((period: Date, index: number) => ({period: this.formatPeriod(period), count: Number(values[index])}));
  }

  private formatPeriod(date: Date): string {
    const year = String(date.getUTCFullYear());
    const month = ('0' + (date.getUTCMonth() + 1)).substr(-2);
    const day = ('0' + date.getUTCDate()).substr(-2);

    return `${year}-${month}-${day} 00:00:00`;
  }

  countTx(type: string, address: string): Promise<number> {
    return this.storage.countTx(type, address);
  }

  indexTx(type: string, address: string, transactionId: string, timestamp: number): Promise<void> {
    return this.storage.indexTx(type, address, transactionId, timestamp);
  }

  getTx(type: string, address: string, limit: number, offset: number): Promise<string[]> {
    return this.storage.getTx(type, address, limit, offset);
  }

  async getProcessingHeight(): Promise<number | null> {
    let height;
    try {
      height = await this.storage.getValue(`lto:processing-height`);
    } catch (e) { }
    return height ? Number(height) : null;
  }

  saveProcessingHeight(height: string | number): Promise<void> {
    return this.storage.setValue(`lto:processing-height`, String(height));
  }

  clearProcessHeight(): Promise<void> {
    return this.storage.delValue(`lto:processing-height`);
  }
}
