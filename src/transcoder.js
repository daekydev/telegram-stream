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

export async function ensureThreeQualities(input, onProgress = () => {}) {
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

  for (const variant of variants) {
    const probe = await ffprobeAsync(variant.path);
    const videoStream = probe.streams.find((stream) => stream.codec_type === 'video');
    variant.width = videoStream?.width;
    variant.height = videoStream?.height;
    variant.duration = Number(probe.format.duration ?? 0);
    variant.size = Number(probe.format.size ?? 0);
  }

  return variants;
}
