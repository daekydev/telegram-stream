import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
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
const jobs = new Map();

function updateJob(jobId, patch) {
  const prev = jobs.get(jobId) || {};
  jobs.set(jobId, {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString()
  });
}

function createJob(type) {
  const jobId = uuidv4();
  jobs.set(jobId, {
    id: jobId,
    type,
    status: 'queued',
    progress: 0,
    message: 'Kuyruğa alındı',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  return jobId;
}

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
    const jobId = createJob('url');
    void processFromUrl(url, (evt) => updateJob(jobId, { status: 'processing', ...evt }))
      .then((doc) => updateJob(jobId, { status: 'done', progress: 100, result: doc }))
      .catch((error) => updateJob(jobId, { status: 'error', error: error.message }));

    return res.status(202).json({ jobId, statusUrl: `/jobs/${jobId}` });
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
    const jobId = createJob('upload');
    void processFromUpload(req.file, (evt) => updateJob(jobId, { status: 'processing', ...evt }))
      .then((doc) => updateJob(jobId, { status: 'done', progress: 100, result: doc }))
      .catch((error) => updateJob(jobId, { status: 'error', error: error.message }));

    return res.status(202).json({ jobId, statusUrl: `/jobs/${jobId}` });
  } catch (error) {
    req.log.error({ err: error }, 'upload ingest failed');
    return res.status(500).json({ error: error.message });
  }
});

app.get('/jobs/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job_not_found' });
  return res.json(job);
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
