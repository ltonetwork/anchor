import { Injectable } from '@nestjs/common';
import { AnchorIndexerService } from './anchor-indexer.service';
import { EncoderService } from '../encoder/encoder.service';
import { LoggerService } from '../logger/logger.service';
import { ConfigService } from '../config/config.service';
import { NodeService } from '../node/node.service';
import { StorageService } from '../storage/storage.service';
import { Transaction } from '../transaction/interfaces/transaction.interface';
import { Block } from '../transaction/interfaces/block.interface';
import delay from 'delay';

@Injectable()
export class AnchorMonitorService {
  public processing: boolean;
  public lastBlock: number;
  public transactionTypes: Array<number>;
  public anchorToken: string;

  constructor(
    private readonly logger: LoggerService,
    private readonly config: ConfigService,
    private readonly encoder: EncoderService,
    private readonly node: NodeService,
    private readonly storage: StorageService,
    private readonly indexer: AnchorIndexerService,
  ) {
    this.transactionTypes = [12, 15];
    this.anchorToken = '\u2693';
  }

  async start() {
    try {
      this.lastBlock = this.config.getNodeStartingBlock() === 'last' ?
        await this.node.getLastBlockHeight() :
        this.config.getNodeStartingBlock() as number;

      await this.process();
    } catch (e) {
      this.processing = false;
      throw e;
    }
  }

  async process() {
    if (!this.processing) {
      await this.checkNewBlock();
    }

    await delay(this.config.getMonitorInterval());
    return this.process();
  }

  async checkNewBlock() {
    this.processing = true;

    const currentHeight = await this.node.getLastBlockHeight();
    let lastHeight = (await this.storage.getProcessingHeight() || this.lastBlock) + 1;

    for (; lastHeight <= currentHeight; lastHeight++) {
      const block = await this.node.getBlock(lastHeight);
      await this.processBlock(block);
      await this.storage.saveProcessingHeight(lastHeight);
    }

    this.processing = false;
  }

  async processBlock(block: Block) {
    this.logger.debug(`anchor: processing block ${block.height}`);

    for (const transaction of block.transactions) {
      await this.processTransaction(transaction);
    }
  }

  async processTransaction(transaction: Transaction) {
    await this.indexer.index(transaction);

    const skip = !transaction ||
      this.transactionTypes.indexOf(transaction.type) === -1;

    if (skip) {
      return;
    }

    // Process old data transactions
    if (transaction.type == 12 && !!transaction.data) {
      for (const item of transaction.data) {
        if (item.key === this.anchorToken) {
          const value = item.value.replace('base64:', '');
          const hexHash = this.encoder.hexEncode(this.encoder.base64Decode(value));
          this.logger.info(`anchor: save hash ${hexHash} with transaction ${transaction.id}`);
          await this.storage.saveAnchor(hexHash, transaction.id);
        }
      }
    } else if(transaction.type == 15 && !!transaction.anchors) {
      transaction.anchors.forEach(async (anchor) => {
        const hexHash = this.encoder.hexEncode(this.encoder.base58Decode(anchor));
        this.logger.info(`anchor: save hash ${hexHash} with transaction ${transaction.id}`);
        await this.storage.saveAnchor(hexHash, transaction.id);
      });
    }
  }
}
