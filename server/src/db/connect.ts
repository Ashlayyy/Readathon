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
    console.error('  Local: docker compose up -d')
    console.error(`  URI: ${uri}`)
    throw err
  }
}
