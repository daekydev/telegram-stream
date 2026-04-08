import path from 'node:path';
import fs from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { execFilePromise } from './process.js';

function sanitizeTitle(title) {
  return (title || 'video').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80);
}

export async function fetchYtDlpMetadata(url) {
  const { stdout } = await execFilePromise(config.ytDlpPath, ['-J', '--no-warnings', url]);
  return JSON.parse(stdout);
}

function pickNativeFormats(metadata) {
  const byHeight = new Map();

  for (const format of metadata.formats ?? []) {
    if (!format.format_id || !format.height) continue;
    if (format.vcodec === 'none') continue;
    if (format.protocol && format.protocol.includes('m3u8')) continue;

    const prev = byHeight.get(format.height);
    if (!prev || (format.tbr ?? 0) > (prev.tbr ?? 0)) {
      byHeight.set(format.height, format);
    }
  }

  return Array.from(byHeight.values()).sort((a, b) => b.height - a.height);
}

export async function downloadFromUrl(url) {
  const metadata = await fetchYtDlpMetadata(url);
  const nativeFormats = pickNativeFormats(metadata);

  const id = uuidv4();
  const baseDir = path.join(config.tempDir, id);
  await fs.mkdir(baseDir, { recursive: true });

  const title = sanitizeTitle(metadata.title);
  const downloaded = [];

  for (const format of nativeFormats.slice(0, 6)) {
    const outPath = path.join(baseDir, `${title}_${format.height}p.mp4`);
    await execFilePromise(config.ytDlpPath, [
      '-f',
      format.format_id,
      '--merge-output-format',
      'mp4',
      '-o',
      outPath,
      '--no-part',
      '--no-warnings',
      url
    ]);
    downloaded.push({
      path: outPath,
      height: format.height,
      source: 'native',
      formatId: format.format_id
    });
  }

  if (downloaded.length === 0) {
    const outPath = path.join(baseDir, `${title}_master.mp4`);
    await execFilePromise(config.ytDlpPath, [
      '-f',
      'bestvideo+bestaudio/best',
      '--merge-output-format',
      'mp4',
      '-o',
      outPath,
      '--no-part',
      '--no-warnings',
      url
    ]);
    downloaded.push({ path: outPath, source: 'master' });
  }

  return {
    sourceKey: `url:${metadata.extractor ?? 'generic'}:${metadata.id ?? url}`,
    title: metadata.title,
    uploader: metadata.uploader,
    webpageUrl: metadata.webpage_url ?? url,
    extractor: metadata.extractor,
    extractedId: metadata.id,
    downloaded,
    workingDir: baseDir
  };
}

export async function importLocalUpload(file) {
  const id = uuidv4();
  const baseDir = path.join(config.tempDir, id);
  await fs.mkdir(baseDir, { recursive: true });

  const targetPath = path.join(baseDir, file.originalname.replace(/[^a-z0-9._-]/gi, '_'));
  await fs.rename(file.path, targetPath);

  return {
    sourceKey: `upload:${id}`,
    title: file.originalname,
    uploader: 'local-upload',
    webpageUrl: null,
    extractor: 'upload',
    extractedId: id,
    downloaded: [{ path: targetPath, source: 'upload' }],
    workingDir: baseDir
  };
}
