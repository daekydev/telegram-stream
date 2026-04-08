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

export async function processFromUrl(url) {
  const input = await downloadFromUrl(url);
  try {
    const variants = await ensureThreeQualities(input);
    const uploaded = await uploadVariantsToTelegram({
      title: input.title,
      sourceKey: input.sourceKey,
      variants
    });

    return upsertVideo({
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
  } finally {
    await cleanupDirectory(input.workingDir);
  }
}

export async function processFromUpload(file) {
  const input = await importLocalUpload(file);
  try {
    const variants = await ensureThreeQualities(input);
    const uploaded = await uploadVariantsToTelegram({
      title: input.title,
      sourceKey: input.sourceKey,
      variants
    });

    return upsertVideo({
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
  } finally {
    await cleanupDirectory(input.workingDir);
  }
}
