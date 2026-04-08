import fs from 'node:fs';
import TelegramBot from 'node-telegram-bot-api';
import { config } from './config.js';

export const bot = new TelegramBot(config.telegramBotToken, { polling: false });

export async function uploadVariantsToTelegram({ title, sourceKey, variants }) {
  const results = [];

  for (const variant of variants) {
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
  return `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
}
