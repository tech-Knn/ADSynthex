// lib/db/mongodb.ts
// MongoDB Connection Manager 
import { MongoClient, Db, Collection } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in environment variables');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
    console.log('[MongoDB] Creating new connection in development mode');
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
  console.log('[MongoDB] Creating new connection in production mode');
}

/**
 * Get the MongoDB database instance
 */
export async function getDatabase(): Promise<Db> {
  const client = await clientPromise;
  return client.db('adsynthex');
}

/**
 * Get a specific collection
 */
export async function getCollection(collectionName: string): Promise<Collection> {
  const db = await getDatabase();
  return db.collection(collectionName);
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const db = await getDatabase();
    await db.command({ ping: 1 });
    console.log('[MongoDB] ✓ Connection successful');
    return true;
  } catch (error) {
    console.error('[MongoDB] ✗ Connection failed:', error);
    return false;
  }
}

export default clientPromise;
