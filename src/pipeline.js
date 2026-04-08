import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { downloadFromUrl, importLocalUpload } from './downloader.js';
import { ensureThreeQualities } from './transcoder.js';
import { uploadVariantsToTelegram } from './telegramUploader.js';
import { upsertVideo } from './db.js';

async function cleanupDirectory(dirPath) {
  if (!dirPath) return;
  await fs.rm(dirPath, { recursive: true, force: true });
}

function toPublicId(sourceKey) {
  return crypto.createHash('sha1').update(sourceKey).digest('base64url').slice(0, 14);
}

export async function processFromUrl(url, onProgress = () => {}) {
  onProgress({ step: 'init', progress: 1, message: 'İşlem başlatıldı' });
  const input = await downloadFromUrl(url, onProgress);
  try {
    onProgress({ step: 'transcode', progress: 60, message: 'Kaliteler hazırlanıyor...' });
    const variants = await ensureThreeQualities(input, ({ quality, index, total, percent, message }) => {
      const perQualitySpan = 20 / total;
      const start = 60 + index * perQualitySpan;
      const mapped = Math.min(80, Math.round(start + (perQualitySpan * percent) / 100));
      onProgress({
        step: 'transcode',
        progress: mapped,
        transcode: {
          quality,
          qualityIndex: index + 1,
          totalQualities: total,
          qualityProgress: Math.round(percent)
        },
        message
      });
    });
    onProgress({ step: 'upload', progress: 78, message: 'Telegram yükleme başlıyor...' });
    const uploaded = await uploadVariantsToTelegram({
      title: input.title,
      sourceKey: input.sourceKey,
      variants
    });
    onProgress({ step: 'persist', progress: 96, message: 'MongoDB kaydı yapılıyor...' });

    const doc = await upsertVideo({
      publicId: toPublicId(input.sourceKey),
      sourceKey: input.sourceKey,
      sourceType: 'url',
      source: {
        url,
        title: input.title,
        uploader: input.uploader,
        extractor: input.extractor,
        extractedId: input.extractedId,
        webpageUrl: input.webpageUrl
      },
      variants: uploaded
    });
    onProgress({ step: 'done', progress: 100, message: 'Tamamlandı' });
    return doc;
  } finally {
    await cleanupDirectory(input.workingDir);
  }
}

export async function processFromUpload(file, onProgress = () => {}) {
  onProgress({ step: 'init', progress: 1, message: 'Yükleme işleniyor...' });
  const input = await importLocalUpload(file);
  try {
    onProgress({ step: 'transcode', progress: 35, message: 'Kaliteler hazırlanıyor...' });
    const variants = await ensureThreeQualities(input, ({ quality, index, total, percent, message }) => {
      const perQualitySpan = 35 / total;
      const start = 35 + index * perQualitySpan;
      const mapped = Math.min(70, Math.round(start + (perQualitySpan * percent) / 100));
      onProgress({
        step: 'transcode',
        progress: mapped,
        transcode: {
          quality,
          qualityIndex: index + 1,
          totalQualities: total,
          qualityProgress: Math.round(percent)
        },
        message
      });
    });
    onProgress({ step: 'upload', progress: 75, message: 'Telegram yükleme başlıyor...' });
    const uploaded = await uploadVariantsToTelegram({
      title: input.title,
      sourceKey: input.sourceKey,
      variants
    });
    onProgress({ step: 'persist', progress: 95, message: 'MongoDB kaydı yapılıyor...' });

    const doc = await upsertVideo({
      publicId: toPublicId(input.sourceKey),
      sourceKey: input.sourceKey,
      sourceType: 'upload',
      source: {
        title: input.title,
        extractor: input.extractor,
        extractedId: input.extractedId
      },
      variants: uploaded
    });
    onProgress({ step: 'done', progress: 100, message: 'Tamamlandı' });
    return doc;
  } finally {
    await cleanupDirectory(input.workingDir);
  }
}
