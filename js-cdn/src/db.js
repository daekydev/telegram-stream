import { MongoClient } from 'mongodb';
import { config } from './config.js';

let client;
let db;

export async function connectDb() {
  if (db) return db;
  client = new MongoClient(config.mongoUri, {
    maxPoolSize: 20
  });
  await client.connect();
  db = client.db(config.mongoDb);

  await db.collection('videos').createIndex({ sourceKey: 1 }, { unique: true });
  await db.collection('videos').createIndex({ publicId: 1 }, { unique: true });
  await db.collection('videos').createIndex({ createdAt: -1 });

  return db;
}

export async function upsertVideo(doc) {
  const database = await connectDb();
  const now = new Date();

  await database.collection('videos').updateOne(
    { sourceKey: doc.sourceKey },
    {
      $set: {
        ...doc,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );

  return database.collection('videos').findOne({ sourceKey: doc.sourceKey });
}

export async function getVideoBySourceKey(sourceKey) {
  const database = await connectDb();
  return database.collection('videos').findOne({ sourceKey });
}

export async function getVideoByPublicId(publicId) {
  const database = await connectDb();
  return database.collection('videos').findOne({ publicId });
}

export async function closeDb() {
  if (client) {
    await client.close();
  }
}
