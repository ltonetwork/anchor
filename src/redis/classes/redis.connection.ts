import redis from 'ioredis';

export class RedisConnection {
  constructor(
    private connection: redis.Redis,
  ) {
  }

  async set(key: redis.KeyType, value: string): Promise<string> {
    return this.connection.set(key, value);
  }

  async get(key: redis.KeyType): Promise<string> {
    return this.connection.get(key);
  }

  async zadd(key: redis.KeyType, args: string[]): Promise<string> {
    return this.connection.zadd(key, ...args);
  }

  async zaddIncr(key: redis.KeyType, members: string[]): Promise<string> {
    const number = await this.zcard(key);
    return this.connection.zadd(key, String(number), ...members);
  }

  async zrange(key: redis.KeyType, start: number, stop: number): Promise<any> {
    return this.connection.zrange(key, start, stop);
  }

  async zrangePaginate(key: redis.KeyType, limit: number, offset: number): Promise<any> {
    const start = Number(offset);
    const stop = (Number(limit) - 1) + start;
    return this.connection.zrange(key, start, stop);
  }

  async zcard(key: redis.KeyType): Promise<number> {
    return this.connection.zcard(key);
  }

  async close() {
    await this.connection.quit();
  }
}
