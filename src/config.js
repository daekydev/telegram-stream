import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const required = ['MONGODB_URI', 'MONGODB_DB', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_TARGET_CHAT_ID'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  env: process.env.NODE_ENV ?? 'production',
  port: Number(process.env.PORT ?? 3000),
  mongoUri: process.env.MONGODB_URI,
  mongoDb: process.env.MONGODB_DB,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramTargetChatId: process.env.TELEGRAM_TARGET_CHAT_ID,
  telegramApiBaseUrl: process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org',
  ffmpegPath: process.env.FFMPEG_PATH,
  ffprobePath: process.env.FFPROBE_PATH,
  tempDir: path.resolve(process.env.TEMP_DIR ?? './tmp'),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? './storage'),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 2048) * 1024 * 1024,
  qualities: [1080, 720, 360]
};
