import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { execFilePromise } from './process.js';
import { Odnoklassniki } from './extractors/odnoklassniki.js';
import { buildSibnetHeaders, extractSibnetVideoUrl } from './extractors/sibnet.js';

function sanitizeTitle(title) {
  return (title || 'video').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80);
}

function qualityToHeight(quality) {
  const q = String(quality || '').toUpperCase();
  const match = q.match(/(\d{3,4})P/);
  if (match) return Number(match[1]);
  if (q.includes('ULTRA') || q.includes('FHD') || q.includes('FULL')) return 1080;
  if (q === 'HD') return 720;
  if (q === 'SD') return 480;
  if (q === 'LOW' || q === 'MOBILE') return 360;
  return null;
}

async function downloadMp4(url, outputPath, headers = {}, onProgress = () => {}) {
  const attempts = [
    { ...headers },
    { ...headers, Referer: undefined, Origin: undefined },
    {}
  ];
  let response;
  let lastError;

  for (const attemptHeaders of attempts) {
    try {
      response = await axios.get(url, {
        responseType: 'stream',
        headers: attemptHeaders,
        maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400
      });
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!response) throw lastError;

  const total = Number(response.headers['content-length'] || 0);
  let downloaded = 0;

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    response.data.on('data', (chunk) => {
      downloaded += chunk.length;
      if (total > 0) {
        onProgress(Math.min(100, Math.round((downloaded / total) * 100)));
      }
    });

    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
    response.data.on('error', reject);
  });
}

async function downloadM3u8(url, outputPath, onProgress = () => {}) {
  await execFilePromise(config.ffmpegPath || 'ffmpeg', [
    '-y',
    '-i',
    url,
    '-c',
    'copy',
    '-bsf:a',
    'aac_adtstoasc',
    outputPath
  ]);
  onProgress(100);
}

function getHostType(url) {
  const u = new URL(url);
  if (u.hostname.includes('ok.ru') || u.hostname.includes('odnoklassniki.ru')) return 'okru';
  if (u.hostname.includes('sibnet')) return 'sibnet';
  return 'unsupported';
}

export async function downloadFromUrl(url, onProgress = () => {}) {
  const sourceType = getHostType(url);
  const id = uuidv4();
  const baseDir = path.join(config.tempDir, id);
  await fsp.mkdir(baseDir, { recursive: true });

  if (sourceType === 'okru') {
    onProgress({ step: 'extract', progress: 5, message: 'OK.ru link çözülüyor...' });
    const ok = new Odnoklassniki();
    const data = await ok.extract(url);
    const title = sanitizeTitle(`okru_${id.slice(0, 8)}`);
    const downloaded = [];

    const selected = data.videos.filter((v) => v.type === 'mp4' || v.type === 'm3u8').slice(0, 3);
    for (let i = 0; i < selected.length; i++) {
      const v = selected[i];
      const height = qualityToHeight(v.quality);
      const outputPath = path.join(baseDir, `${title}_${v.quality}_${i}.mp4`);
      const base = 10 + Math.floor((i / Math.max(1, selected.length)) * 45);
      onProgress({ step: 'download', progress: base, message: `OK.ru kalite indiriliyor: ${v.quality}` });

      if (v.type === 'm3u8') {
        await downloadM3u8(v.url, outputPath, (p) => onProgress({ step: 'download', progress: base + Math.floor(p * 0.15), message: `HLS indiriliyor (${v.quality})` }));
      } else {
        await downloadMp4(v.url, outputPath, {
          Referer: data.referer || 'https://ok.ru/',
          Origin: 'https://ok.ru',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }, (p) =>
          onProgress({ step: 'download', progress: base + Math.floor(p * 0.15), message: `MP4 indiriliyor (${v.quality})` })
        );
      }

      downloaded.push({ path: outputPath, height, source: 'okru', quality: v.quality, remoteUrl: v.url });
    }

    if (!downloaded.length) {
      throw new Error('OK.ru için indirilebilir video bulunamadı');
    }

    return {
      sourceKey: `url:okru:${crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)}`,
      title,
      uploader: 'okru',
      webpageUrl: url,
      extractor: 'okru',
      extractedId: id,
      downloaded,
      workingDir: baseDir
    };
  }

  if (sourceType === 'sibnet') {
    onProgress({ step: 'extract', progress: 5, message: 'Sibnet link çözülüyor...' });
    const directUrl = await extractSibnetVideoUrl(url);
    const title = sanitizeTitle(`sibnet_${id.slice(0, 8)}`);
    const outputPath = path.join(baseDir, `${title}_source.mp4`);

    onProgress({ step: 'download', progress: 10, message: 'Sibnet video indiriliyor...' });
    await downloadMp4(directUrl, outputPath, buildSibnetHeaders({ referer: url }), (p) =>
      onProgress({ step: 'download', progress: 10 + Math.floor(p * 0.5), message: `Sibnet indiriliyor (%${p})` })
    );

    return {
      sourceKey: `url:sibnet:${crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)}`,
      title,
      uploader: 'sibnet',
      webpageUrl: url,
      extractor: 'sibnet',
      extractedId: id,
      downloaded: [{ path: outputPath, source: 'sibnet', quality: 'SOURCE' }],
      workingDir: baseDir
    };
  }

  throw new Error('Şu an sadece ok.ru ve sibnet URL destekleniyor (yt-dlp devre dışı).');
}

export async function importLocalUpload(file) {
  const id = uuidv4();
  const baseDir = path.join(config.tempDir, id);
  await fsp.mkdir(baseDir, { recursive: true });

  const targetPath = path.join(baseDir, file.originalname.replace(/[^a-z0-9._-]/gi, '_'));
  await fsp.rename(file.path, targetPath);

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
