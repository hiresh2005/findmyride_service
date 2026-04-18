import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined in environment variables');
}

const options = {
  dbName: 'findmyride',
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
};

export async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    logger.debug('MongoDB already connected');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, options);
    logger.info('MongoDB connected', { host: mongoose.connection.host });
  } catch (err) {
    logger.error('MongoDB connection failed', { error: err.message });
    throw err;
  }
}

export async function disconnectDB() {
  if (mongoose.connection.readyState === 0) return;

  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}
