import mongoose from 'mongoose'

export async function connectDb(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/realmathon'

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    })
    console.log('Connected to MongoDB')
  } catch (err) {
    console.error('MongoDB connection failed. Is the database running?')
    console.error(`  URI: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`)
    throw err
  }
}

export async function pingDb(): Promise<boolean> {
  try {
    const db = mongoose.connection.db
    if (!db) return false
    await db.admin().ping()
    return true
  } catch {
    return false
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}
