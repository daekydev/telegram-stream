import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import { config } from './config.js';

if (config.ffmpegPath) ffmpeg.setFfmpegPath(config.ffmpegPath);
if (config.ffprobePath) ffmpeg.setFfprobePath(config.ffprobePath);

function ffprobeAsync(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

async function probeVideo(filePath) {
  const probe = await ffprobeAsync(filePath);
  const videoStream = probe.streams.find((stream) => stream.codec_type === 'video');
  return {
    width: videoStream?.width,
    height: videoStream?.height,
    duration: Number(probe.format.duration ?? 0),
    size: Number(probe.format.size ?? 0)
  };
}

async function transcodeToHeight(inputPath, outputPath, height, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset veryfast',
        '-crf 23',
        '-movflags +faststart',
        `-vf scale=-2:${height}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`
      ])
      .format('mp4')
      .on('progress', (progress) => {
        onProgress(Math.min(100, Math.max(0, Number(progress.percent || 0))));
      })
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

function pickBestSource(downloaded, targetHeight) {
  const withHeight = downloaded.filter((item) => item.height).sort((a, b) => a.height - b.height);
  if (withHeight.length === 0) return downloaded[0];

  const exact = withHeight.find((item) => item.height === targetHeight);
  if (exact) return exact;

  const above = withHeight.find((item) => item.height > targetHeight);
  if (above) return above;

  return withHeight[withHeight.length - 1];
}

function mapQualityToHeight(quality) {
  const q = String(quality || '').toUpperCase();
  const match = q.match(/(\d{3,4})P/);
  if (match) return Number(match[1]);
  if (q.includes('FULL') || q.includes('FHD') || q.includes('ULTRA')) return 1080;
  if (q === 'HD') return 720;
  if (q === 'SD') return 480;
  if (q === 'LOW' || q === 'MOBILE') return 360;
  return null;
}

function targetsForSibnet(sourceHeight) {
  const ladder = [1080, 720, 480, 360, 240];
  const base = ladder.find((h) => sourceHeight >= h) || sourceHeight;
  const lowers = ladder.filter((h) => h < base).slice(0, 2);
  return [base, ...lowers];
}

async function finalizeVariants(variants) {
  for (const variant of variants) {
    const info = await probeVideo(variant.path);
    variant.width = info.width;
    variant.height = info.height;
    variant.duration = info.duration;
    variant.size = info.size;
  }
  return variants;
}

async function handleOkru(input, onProgress) {
  const variants = [];
  const total = Math.min(3, input.downloaded.length);

  for (let i = 0; i < total; i++) {
    const source = input.downloaded[i];
    variants.push({
      quality: source.height || mapQualityToHeight(source.quality) || 0,
      path: source.path,
      generated: false,
      from: source.source
    });
    onProgress({ quality: variants[i].quality, index: i, total, percent: 100, message: `${variants[i].quality}p hazır (OK.ru native)` });
  }

  return finalizeVariants(variants);
}

async function handleSibnet(input, onProgress) {
  const source = input.downloaded[0];
  const sourceInfo = await probeVideo(source.path);
  const sourceHeight = sourceInfo.height || 720;
  const targets = targetsForSibnet(sourceHeight);

  const variants = [];
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (target === targets[0]) {
      variants.push({ quality: target, path: source.path, generated: false, from: source.source });
      onProgress({ quality: target, index: i, total: targets.length, percent: 100, message: `${target}p kaynak kalite hazır` });
      continue;
    }

    const outPath = path.join(input.workingDir, `${target}p.mp4`);
    await transcodeToHeight(source.path, outPath, target, (percent) =>
      onProgress({ quality: target, index: i, total: targets.length, percent, message: `${target}p transcode devam ediyor` })
    );
    variants.push({ quality: target, path: outPath, generated: true, from: source.source });
    onProgress({ quality: target, index: i, total: targets.length, percent: 100, message: `${target}p transcode tamamlandı` });
  }

  return finalizeVariants(variants);
}

export async function ensureThreeQualities(input, onProgress = () => {}) {
  if (input.extractor === 'okru') {
    return handleOkru(input, onProgress);
  }

  if (input.extractor === 'sibnet') {
    return handleSibnet(input, onProgress);
  }

  const variants = [];

  for (const quality of config.qualities) {
    const index = variants.length;
    const source = pickBestSource(input.downloaded, quality);
    if (!source) {
      throw new Error(`No input source available for ${quality}p`);
    }

    if (source.height === quality) {
      variants.push({ quality, path: source.path, generated: false, from: source.source });
      onProgress({ quality, index, total: config.qualities.length, percent: 100, message: `${quality}p hazır (native)` });
      continue;
    }

    const outPath = path.join(input.workingDir, `${quality}p.mp4`);
    await transcodeToHeight(source.path, outPath, quality, (percent) =>
      onProgress({
        quality,
        index,
        total: config.qualities.length,
        percent,
        message: `${quality}p transcode devam ediyor`
      })
    );
    variants.push({ quality, path: outPath, generated: true, from: source.source });
    onProgress({ quality, index, total: config.qualities.length, percent: 100, message: `${quality}p transcode tamamlandı` });
  }

  return finalizeVariants(variants);
}
