export function renderPanelHtml(baseUrl) {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Telegram Video CDN Panel</title>
  <style>
    :root { --bg:#0f172a; --card:#111827; --card2:#1f2937; --text:#e5e7eb; --muted:#9ca3af; --accent:#22c55e; --accent2:#38bdf8; }
    * { box-sizing: border-box; }
    body { margin:0; background:linear-gradient(120deg,#0f172a,#111827); color:var(--text); font-family:Inter,Arial,sans-serif; }
    .wrap { max-width:1000px; margin:0 auto; padding:20px; }
    .grid { display:grid; grid-template-columns:1fr; gap:14px; }
    .card { background:rgba(17,24,39,.92); border:1px solid #263043; border-radius:16px; padding:16px; box-shadow:0 10px 30px rgba(0,0,0,.3); }
    h1 { margin: 6px 0 18px; font-size: clamp(22px,3.8vw,34px); }
    h2 { margin: 0 0 10px; font-size: 18px; }
    input, button, select { width:100%; border:none; border-radius:12px; padding:12px 14px; font-size:15px; }
    input, select { background:#0b1220; color:var(--text); border:1px solid #273042; }
    button { margin-top:8px; background:linear-gradient(90deg,var(--accent),var(--accent2)); color:#041112; font-weight:700; cursor:pointer; }
    button:hover { opacity:.92; }
    .progress { width:100%; height:12px; background:#0b1220; border-radius:99px; overflow:hidden; border:1px solid #273042; }
    .progress > div { height:100%; width:0%; background:linear-gradient(90deg,#22c55e,#06b6d4); transition: width .3s ease; }
    .meta { font-size:13px; color:var(--muted); margin:8px 0; }
    .links a { display:block; color:#93c5fd; margin:6px 0; word-break:break-all; }
    pre { background:#0b1220; color:#d1d5db; padding:12px; border-radius:10px; overflow:auto; max-height:280px; border:1px solid #273042; }
    @media (min-width: 860px) { .grid { grid-template-columns:1fr 1fr; } .full{ grid-column:1/-1; } }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>📼 Telegram Video CDN Panel</h1>

    <div class="grid">
      <div class="card">
        <h2>1) URL ile Yükle (OK.ru / Sibnet)</h2>
        <input id="urlInput" placeholder="https://ok.ru/video/... veya sibnet linki" />
        <button onclick="ingestUrl()">URL Yükle</button>
      </div>

      <div class="card">
        <h2>2) Dosya Yükle</h2>
        <input id="fileInput" type="file" accept="video/*" />
        <button onclick="ingestFile()">Dosyayı Yükle</button>
      </div>

      <div class="card full">
        <h2>İlerleme</h2>
        <div class="progress"><div id="bar"></div></div>
        <div class="meta" id="statusText">Bekleniyor...</div>
      </div>

      <div class="card">
        <h2>3) Kayıt Sorgula (Public ID)</h2>
        <input id="publicIdInput" placeholder="publicId" />
        <button onclick="lookup()">Linkleri Getir</button>
      </div>

      <div class="card">
        <h2>Kalıcı Linkler</h2>
        <div id="links" class="links"></div>
      </div>

      <div class="card full">
        <h2>Sonuç JSON</h2>
        <pre id="result"></pre>
      </div>
    </div>
  </div>

<script>
const baseUrl = ${JSON.stringify(baseUrl)};
let pollTimer = null;

function setProgress(pct, msg){
  document.getElementById('bar').style.width = Math.max(0, Math.min(100, pct)) + '%';
  document.getElementById('statusText').textContent = (msg || 'İşleniyor...') + ' (' + Math.round(pct) + '%)';
}

function writeResult(data) {
  document.getElementById('result').textContent = JSON.stringify(data, null, 2);
}

function showLinks(doc) {
  const linksEl = document.getElementById('links');
  linksEl.innerHTML = '';
  if (!doc?.publicId) return;

  const addLink = (text, url) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.textContent = text + ': ' + url;
    linksEl.appendChild(a);

    const btn = document.createElement('button');
    btn.textContent = 'Kopyala';
    btn.onclick = () => navigator.clipboard.writeText(url);
    linksEl.appendChild(btn);
  };

  addLink('Player', baseUrl + '/player/' + doc.publicId);
  for (const q of [1080, 720, 360]) {
    addLink(q + 'p', baseUrl + '/watch/' + doc.publicId + '/' + q);
  }
}

async function watchJob(jobId){
  if (pollTimer) clearInterval(pollTimer);

  const tick = async () => {
    const res = await fetch('/jobs/' + encodeURIComponent(jobId));
    const job = await res.json();
    writeResult(job);
    let statusMsg = job.message || job.status;
    if (job.transcode?.quality) {
      statusMsg += ' • ' + job.transcode.quality + 'p (' + (job.transcode.qualityProgress || 0) + '%)';
    }
    setProgress(job.progress || 0, statusMsg);

    if (job.status === 'done') {
      clearInterval(pollTimer);
      if (job.result) showLinks(job.result);
      return;
    }

    if (job.status === 'error') {
      clearInterval(pollTimer);
      setProgress(job.progress || 0, 'Hata: ' + (job.error || 'bilinmeyen'));
    }
  };

  await tick();
  pollTimer = setInterval(tick, 1200);
}

async function ingestUrl() {
  const url = document.getElementById('urlInput').value.trim();
  const res = await fetch('/ingest/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  const data = await res.json();
  writeResult(data);
  if (data.jobId) watchJob(data.jobId);
}

async function ingestFile() {
  const file = document.getElementById('fileInput').files[0];
  const form = new FormData();
  form.append('video', file);
  const res = await fetch('/ingest/upload', { method: 'POST', body: form });
  const data = await res.json();
  writeResult(data);
  if (data.jobId) watchJob(data.jobId);
}

async function lookup() {
  const id = document.getElementById('publicIdInput').value.trim();
  const res = await fetch('/videos/public/' + encodeURIComponent(id));
  const data = await res.json();
  writeResult(data);
  showLinks(data);
}
</script>
</body>
</html>`;
}

export function renderPlayerHtml(baseUrl, publicId) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Player ${publicId}</title>
<style>
  body{margin:0;padding:18px;background:#0b1220;color:#e5e7eb;font-family:Inter,Arial,sans-serif}
  .box{max-width:960px;margin:auto;background:#111827;border:1px solid #223049;border-radius:16px;padding:16px}
  video{width:100%;max-height:72vh;border-radius:12px;background:#000}
  select,button{padding:10px 12px;border:none;border-radius:10px;margin-right:8px}
  button{background:#22c55e;font-weight:700;cursor:pointer}
</style>
</head>
<body>
<div class="box">
  <h2>Video Player: ${publicId}</h2>
  <div>
    <select id="q"><option value="1080">1080p</option><option value="720" selected>720p</option><option value="360">360p</option></select>
    <button onclick="loadVideo()">Yükle</button>
  </div>
  <p id="link"></p>
  <video id="v" controls></video>
</div>
<script>
const baseUrl = ${JSON.stringify(baseUrl)};
const publicId = ${JSON.stringify(publicId)};
function loadVideo(){
  const q = document.getElementById('q').value;
  const url = baseUrl + '/watch/' + publicId + '/' + q;
  document.getElementById('v').src = url;
  document.getElementById('link').textContent = url;
}
loadVideo();
</script>
</body></html>`;
}
