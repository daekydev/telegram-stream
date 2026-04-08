# Telegram Video CDN (JavaScript)

Bu repo artık JavaScript/Node.js tabanlı Telegram video CDN uygulamasını root dizinde çalıştıracak şekilde düzenlendi.

## Özellikler

- URL ile ingest (`/ingest/url`) — özel extractor ile **yalnızca OK.ru ve Sibnet** desteği.
- Direkt dosya upload ingest (`/ingest/upload`) — multipart form-data ile video alma.
- 3 kalite standardı: **1080p / 720p / 360p**.
  - Kaynakta mevcut kalite varsa doğrudan kullanır.
  - Eksik kalite varsa `ffmpeg` ile otomatik üretir.
- Telegram'a kalite bazlı ayrı upload.
- Her kalite için Telegram `file_id`, `message_id`, çözünürlük, süre ve boyut bilgisini MongoDB'de kalıcı saklama.
- Web panel (`/`) ile upload + kalıcı link kopyalama.
- Web panelde job ilerleme yüzdesi (% tamamlandı) takibi.
- Transcode aşamasında kalite bazlı ilerleme (örn. 720p %42) gösterimi.
- Kalıcı izleme linkleri:
  - `/watch/:publicId/:quality`
  - `/player/:publicId`

## Kurulum

```bash
npm install
cp .env.example .env
```

`.env` içinde gerekli değerleri doldurun:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_TARGET_CHAT_ID`
- `MONGODB_URI`
- `MONGODB_DB`
- (opsiyonel) `FFMPEG_PATH`, `FFPROBE_PATH`
- (opsiyonel) `PUBLIC_BASE_URL`

## Çalıştırma

```bash
npm start
```

Web panel: `http://localhost:3000/`

## Desteklenen URL Kaynakları

- `ok.ru` (çoğu durumda çoklu kalite linkleri alınır)
- `sibnet` (tek kalite gelir, sistem kaynak kalite + 2 düşük kalite üretir)

> Not: URL ingest tarafında `yt-dlp` kullanılmaz, özel extractor sınıfları kullanılır.
> Not 2: OK.ru için native kalite dosyaları direkt yüklenir (transcode yok). Sibnet için kaynak kalite + 2 düşük kalite üretilir.

## Docker ile Çalıştırma

```bash
docker build -t telegram-video-cdn .
docker run --rm -p 8080:8080 --env-file .env telegram-video-cdn
```

Docker image içinde sadece gerekli sistem bağımlılıkları (`ffmpeg`) yüklenir.

## Fly.io Deploy

```bash
fly launch --no-deploy
fly secrets set \
  MONGODB_URI="mongodb+srv://..." \
  MONGODB_DB="telegram_video_cdn" \
  TELEGRAM_BOT_TOKEN="123456:ABC" \
  TELEGRAM_TARGET_CHAT_ID="-1001234567890" \
  PUBLIC_BASE_URL="https://<your-app>.fly.dev"
fly deploy
```

## API Akışı (Job tabanlı)

- `POST /ingest/url` → `jobId` döner
- `POST /ingest/upload` → `jobId` döner
- `GET /jobs/:jobId` → progress/status/result döner

## Not

Eski Python kodları (`app/`, `run.py`) repoda tutuluyor; fakat aktif servis Node.js tarafıdır.
