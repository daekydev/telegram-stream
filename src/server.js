import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { connectDb, getVideoByPublicId, getVideoBySourceKey } from './db.js';
import { processFromUrl, processFromUpload } from './pipeline.js';
import { getFileUrl } from './telegramUploader.js';
import { renderPanelHtml, renderPlayerHtml } from './panelHtml.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(pinoHttp({ logger }));

await fs.mkdir(config.tempDir, { recursive: true });
await fs.mkdir(config.uploadDir, { recursive: true });

const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: config.maxUploadBytes }
});
const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${config.port}`;

app.get('/health', async (_, res) => {
  await connectDb();
  res.json({ ok: true });
});

app.get('/', (_req, res) => {
  res.type('html').send(renderPanelHtml(baseUrl));
});

app.post('/ingest/url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    const doc = await processFromUrl(url);
    return res.status(201).json(doc);
  } catch (error) {
    req.log.error({ err: error }, 'url ingest failed');
    return res.status(500).json({ error: error.message });
  }
});

app.post('/ingest/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'video file is required (form-data key: video)' });
  }

  try {
    const doc = await processFromUpload(req.file);
    return res.status(201).json(doc);
  } catch (error) {
    req.log.error({ err: error }, 'upload ingest failed');
    return res.status(500).json({ error: error.message });
  }
});

app.get('/videos/:sourceKey', async (req, res) => {
  const sourceKey = req.params.sourceKey;
  const doc = await getVideoBySourceKey(sourceKey);

  if (!doc) {
    return res.status(404).json({ error: 'not_found' });
  }

  return res.json(doc);
});

app.get('/videos/public/:publicId', async (req, res) => {
  const doc = await getVideoByPublicId(req.params.publicId);
  if (!doc) return res.status(404).json({ error: 'not_found' });
  return res.json(doc);
});

app.get('/watch/:publicId/:quality', async (req, res) => {
  const publicId = req.params.publicId;
  const quality = Number(req.params.quality);
  const doc = await getVideoByPublicId(publicId);

  if (!doc) {
    return res.status(404).json({ error: 'not_found' });
  }

  const variant = doc.variants.find((v) => v.quality === quality);
  if (!variant?.telegram?.fileId) {
    return res.status(404).json({ error: 'quality_not_found' });
  }

  const fileUrl = await getFileUrl(variant.telegram.fileId);
  return res.redirect(fileUrl);
});

app.get('/player/:publicId', (req, res) => {
  res.type('html').send(renderPlayerHtml(baseUrl, req.params.publicId));
});

app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'internal_error' });
});

app.listen(config.port, () => {
  logger.info(`telegram-video-cdn is running on :${config.port}`);
  logger.info(`tempDir=${path.resolve(config.tempDir)}`);
});
