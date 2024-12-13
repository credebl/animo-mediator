import { createClient, RedisClientType } from 'redis'
import { LOG_LEVEL, REDIS_URL } from '../constants'
import { Logger } from 'src/logger'

export class RedisService {
  private client: RedisClientType
  private logger = new Logger(LOG_LEVEL)

  constructor() {
    this.logger.info(`Initialize the Redis client`)
    // Initialize the Redis client
    this.client = createClient({ url: REDIS_URL })

    // Connect to Redis
    this.client.connect().catch((err) => {
      console.error('Failed to connect to Redis:', err)
    })
    this.logger.info(`Connected to Redis client`)
  }

  // Store a data
  public async storeData(key: string, socketId: string): Promise<void> {
    try {
      await this.client.set(key, socketId)
    } catch (error) {
      console.error('Error storing data:', error)
      throw new Error('Error storing data')
    }
  }

  // Retrieve a socketId by key
  public async getData(key: string): Promise<string | null> {
    try {
      return await this.client.get(key)
    } catch (error) {
      console.error('Error retrieving data:', error)
      throw new Error('Error retrieving data')
    }
  }

  // Remove a data
  public async removeData(key: string): Promise<void> {
    try {
      await this.client.del(key)
    } catch (error) {
      console.error('Error removing data:', error)
      throw new Error('Error removing data')
    }
  }

  // Close the Redis data
  public async close(): Promise<void> {
    await this.client.quit()
  }

}