import fs from 'node:fs';
import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';

const isOfficialBotApi = config.telegramApiBaseUrl.includes('api.telegram.org');
const OFFICIAL_SEND_LIMIT = 50 * 1024 * 1024;

export const bot = new TelegramBot(config.telegramBotToken, {
  polling: false,
  baseApiUrl: config.telegramApiBaseUrl
});

export async function uploadVariantsToTelegram({ title, sourceKey, variants }) {
  const results = [];

  for (const variant of variants) {
    if (isOfficialBotApi && variant.size > OFFICIAL_SEND_LIMIT) {
      throw new Error(
        `Variant ${variant.quality}p is ${Math.round(variant.size / 1024 / 1024)}MB. Official Bot API limit is 50MB. ` +
          'Use a local Telegram Bot API server (TELEGRAM_API_BASE_URL) to send larger files.'
      );
    }

    const caption = `${title}\n${variant.quality}p\nsource:${sourceKey}`.slice(0, 1024);
    const msg = await bot.sendVideo(
      config.telegramTargetChatId,
      fs.createReadStream(variant.path),
      {
        caption,
        supports_streaming: true,
        width: variant.width,
        height: variant.height,
        duration: Math.round(variant.duration || 0)
      },
      {
        filename: `${sourceKey.replace(/[^a-z0-9_-]/gi, '_')}_${variant.quality}p.mp4`,
        contentType: 'video/mp4'
      }
    );

    results.push({
      quality: variant.quality,
      telegram: {
        messageId: msg.message_id,
        fileId: msg.video?.file_id,
        fileUniqueId: msg.video?.file_unique_id,
        chatId: String(msg.chat.id)
      },
      media: {
        width: variant.width,
        height: variant.height,
        duration: variant.duration,
        size: variant.size
      },
      generated: variant.generated,
      derivedFrom: variant.from
    });
  }

  return results;
}

export async function getFileUrl(fileId) {
  const file = await bot.getFile(fileId);
  const base = config.telegramApiBaseUrl.replace(/\/+$/, '');
  return `${base}/file/bot${config.telegramBotToken}/${file.file_path}`;
}
