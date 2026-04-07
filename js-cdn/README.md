# Telegram Video CDN (JavaScript Rewrite)

Bu klasör, mevcut Python tabanlı sistemi JavaScript/Node.js ile yeniden yazarak Telegram'ı video CDN gibi kullanmak için hazırlanmıştır.

## Özellikler

- URL ile ingest (`/ingest/url`) — `yt-dlp` ile kaynak platformdan video çekme (OK.ru, Sibnet vb.).
- Direkt dosya upload ingest (`/ingest/upload`) — multipart form-data ile video alma.
- 3 kalite standardı: **1080p / 720p / 360p**.
  - Kaynakta mevcut kalite varsa doğrudan kullanır.
  - Eksik kalite varsa `ffmpeg` ile otomatik üretir.
- Telegram'a kalite bazlı ayrı upload.
- Her kalite için Telegram `file_id`, `message_id`, çözünürlük, süre ve boyut bilgisini MongoDB'de kalıcı saklama.
- Web panel (`/`) ile upload + kalıcı link kopyalama.
- Kalıcı izleme linkleri:
  - `/watch/:publicId/:quality` (her istekte Telegram'dan güncel file path alıp redirect eder)
  - `/player/:publicId` (basit web oynatıcı)

## Mimari

1. **Downloader** (`src/downloader.js`)
   - `yt-dlp -J` ile metadata + format envanteri alır.
   - Native kalite dosyalarını indirir; hiç yoksa master kalite indirir.
2. **Transcoder** (`src/transcoder.js`)
   - 1080/720/360 kaliteleri garanti eder.
3. **Uploader** (`src/telegramUploader.js`)
   - Her kaliteyi hedef Telegram chat'ine ayrı video mesajı olarak gönderir.
4. **Persistence** (`src/db.js`)
   - MongoDB'de `sourceKey` bazında idempotent kayıt tutar.
5. **API** (`src/server.js`)
   - Ingest ve kalite sorgulama endpoint'leri sağlar.

## Kurulum

```bash
cd js-cdn
npm install
cp .env.example .env
```

`.env` içinde gerekli değerleri doldurun:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_TARGET_CHAT_ID`
- `MONGODB_URI`
- `MONGODB_DB`
- (opsiyonel) `FFMPEG_PATH`, `FFPROBE_PATH`, `YTDLP_PATH`
- (opsiyonel) `PUBLIC_BASE_URL` (panelde üretilecek kalıcı linkler için alan adı)

## Çalıştırma

```bash
npm start
```

Web panel: `http://localhost:3000/`

## Docker ile Çalıştırma

```bash
cd js-cdn
docker build -t telegram-video-cdn .
docker run --rm -p 8080:8080 --env-file .env telegram-video-cdn
```

Container içinde `yt-dlp` ve `ffmpeg` otomatik kurulur (`Dockerfile`).

## Fly.io Deploy

1. Fly CLI kur:
```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

2. Uygulamayı oluştur (ilk kez):
```bash
cd js-cdn
fly launch --no-deploy
```

3. Secret değerlerini gir:
```bash
fly secrets set \
  MONGODB_URI=\"mongodb+srv://...\" \
  MONGODB_DB=\"telegram_video_cdn\" \
  TELEGRAM_BOT_TOKEN=\"123456:ABC\" \
  TELEGRAM_TARGET_CHAT_ID=\"-1001234567890\" \
  PUBLIC_BASE_URL=\"https://<your-app>.fly.dev\"
```

4. Deploy:
```bash
fly deploy
```

5. Log/health kontrol:
```bash
fly logs
curl https://<your-app>.fly.dev/health
```

## API Kullanımı

### 1) URL ingest

```bash
curl -X POST http://localhost:3000/ingest/url \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://ok.ru/video/123456789"}'
```

### 2) Dosya ingest

```bash
curl -X POST http://localhost:3000/ingest/upload \
  -F "video=@/path/to/video.mp4"
```

### 3) Kayıt sorgulama

```bash
curl http://localhost:3000/videos/url:okru:123456789
```

### 4) Public ID ile kalıcı link

```bash
curl http://localhost:3000/videos/public/<publicId>
# kalıcı kalite linki:
# http://localhost:3000/watch/<publicId>/720
```

## Optimizasyon notları

- `sourceKey` ile aynı kaynağın tekrar ingest edilmesi engellenebilir (upsert/overwrite stratejisi mevcut).
- Telegram tarafında kalite bazlı `file_id` cache edildiği için tekrar dağıtım çok hızlıdır.
- `ffmpeg` preset ve CRF ayarı (`veryfast`, `23`) throughput/quality dengesi için seçildi.
- Worker queue (BullMQ/RabbitMQ) eklenerek paralel transcode-upload daha güvenli ölçeklenebilir.
