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
- `TELEGRAM_API_BASE_URL` (local Bot API için: `http://telegram-bot-api:8081`)
- `TELEGRAM_API_ID` (my.telegram.org `api_id`, local Bot API server için gerekli)
- `TELEGRAM_API_HASH` (my.telegram.org `api_hash`, local Bot API server için gerekli)
- `MONGODB_URI`
- `MONGODB_DB`
- (opsiyonel) `FFMPEG_PATH`, `FFPROBE_PATH`
- (opsiyonel) `PUBLIC_BASE_URL`

## Çalıştırma

```bash
npm start
```

Web panel: `http://localhost:3000/`

## Tek Sunucuda Full Kurulum (Önerilen, 2GB upload için)

Tüm servisler aynı repoda ve aynı sunucuda çalışır:
- `app` (panel + API)
- `telegram-bot-api` (`--local` mode, büyük dosya için)
- `mongo`

Sadece `.env` içine şu 4 alanı gerçek değerlerle girmen yeterli:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_TARGET_CHAT_ID`
- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Sonra tek komut:

```bash
cp .env.example .env
docker compose up --build -d
```

Panel: `http://SUNUCU_IP:8080`

## Desteklenen URL Kaynakları

- `ok.ru` (çoğu durumda çoklu kalite linkleri alınır)
- `sibnet` (tek kalite gelir, sistem kaynak kalite + 2 düşük kalite üretir)

> Not: URL ingest tarafında `yt-dlp` kullanılmaz, özel extractor sınıfları kullanılır.
> Not 2: OK.ru için native kalite dosyaları direkt yüklenir (transcode yok). Sibnet için kaynak kalite + 2 düşük kalite üretilir.

## Docker (Sadece app container)

```bash
docker build -t telegram-video-cdn .
docker run --rm -p 8080:8080 --env-file .env telegram-video-cdn
```

> Bu modda local Bot API/Mongo ayrıca kurulmalı. Tek sunucu için `docker compose` yöntemi önerilir.

## Local Bot API notu

Compose içinde `telegram-bot-api` servisi `--local` ile çalışır; bu sayede büyük dosya upload senaryosu için uygundur.

## Resmi Hosted Bot API limiti

- `api.telegram.org` kullanırsan bot upload limiti pratikte 50MB civarıdır.
- Bu uygulama resmi API modunda 50MB üzeri dosyalarda açıklayıcı hata verir.

## Fly.io Deploy

Bu repo `telegram-stream.fly.dev` (app) + `telegram-stream-botapi` (local Bot API) olarak çalışacak şekilde hazırlanmıştır.

### 1) Local Bot API app'i deploy et

```bash
fly apps create telegram-stream-botapi
fly secrets set TELEGRAM_API_ID="1234567" TELEGRAM_API_HASH="your_hash" -a telegram-stream-botapi
fly volumes create botapi_data --region iad --size 10 -a telegram-stream-botapi
fly deploy -c fly.botapi.toml -a telegram-stream-botapi
```

### 2) Ana app'i deploy et

```bash
fly secrets set \
  MONGODB_URI="mongodb+srv://..." \
  MONGODB_DB="telegram_video_cdn" \
  TELEGRAM_BOT_TOKEN="123456:ABC" \
  TELEGRAM_TARGET_CHAT_ID="-1001234567890" \
  TELEGRAM_API_BASE_URL="http://telegram-stream-botapi.internal:8081" \
  PUBLIC_BASE_URL="https://telegram-stream.fly.dev" \
  -a telegram-stream
fly deploy -c fly.toml -a telegram-stream
```

### Hangi değeri gireceğim? (`TELEGRAM_API_BASE_URL`)

- **Bot API app kurduysan**: `http://telegram-stream-botapi.internal:8081`
- **Bot API app kurmadıysan**: `https://api.telegram.org`

Eğer `ENOTFOUND telegram-stream-botapi.internal` hatası alırsan botapi app'i deploy edilmemiştir veya aynı Fly organization içinde değildir.

## API Akışı (Job tabanlı)

- `POST /ingest/url` → `jobId` döner
- `POST /ingest/upload` → `jobId` döner
- `GET /jobs/:jobId` → progress/status/result döner

## Not

Eski Python kodları (`app/`, `run.py`) repoda tutuluyor; fakat aktif servis Node.js tarafıdır.
