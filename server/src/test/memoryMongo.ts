import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { connectDb, disconnectDb } from '../db/connect.js'

export type MemoryMongo = {
  cleanup: () => Promise<void>
  clearDatabase: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Starts an isolated MongoDB instance and connects the application's shared
 * Mongoose connection to it. Always call `stop()` in the suite's `after` hook.
 */
export async function startMemoryMongo(): Promise<MemoryMongo> {
  const savedUri = process.env.MONGODB_URI
  const mongod = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongod.getUri()
  await connectDb()

  async function clearDatabase(): Promise<void> {
    await Promise.all(
      Object.values(mongoose.connection.collections).map((collection) =>
        collection.deleteMany({}),
      ),
    )
  }

  async function stop(): Promise<void> {
    await disconnectDb()
    await mongod.stop()
    if (savedUri === undefined) delete process.env.MONGODB_URI
    else process.env.MONGODB_URI = savedUri
  }

  return { cleanup: clearDatabase, clearDatabase, stop }
}
