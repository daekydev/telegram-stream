export function renderPanelHtml(baseUrl) {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Telegram Video CDN Panel</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 950px; margin: 2rem auto; padding: 0 1rem; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 1rem; margin-bottom: 1rem; }
    input, button, select { padding: .6rem; margin: .25rem 0; width: 100%; }
    button { cursor: pointer; }
    pre { background: #f7f7f7; padding: .75rem; overflow: auto; }
    .links a { display:block; margin:.3rem 0; }
  </style>
</head>
<body>
  <h1>Telegram Video CDN Panel</h1>

  <div class="card">
    <h2>1) URL ile Yükle</h2>
    <input id="urlInput" placeholder="https://ok.ru/video/..." />
    <button onclick="ingestUrl()">URL Yükle</button>
  </div>

  <div class="card">
    <h2>2) Dosya Yükle</h2>
    <input id="fileInput" type="file" accept="video/*" />
    <button onclick="ingestFile()">Dosyayı Yükle</button>
  </div>

  <div class="card">
    <h2>3) Kayıt Sorgula (Public ID)</h2>
    <input id="publicIdInput" placeholder="publicId" />
    <button onclick="lookup()">Linkleri Getir</button>
  </div>

  <div class="card">
    <h2>Sonuç</h2>
    <div id="links" class="links"></div>
    <pre id="result"></pre>
  </div>

<script>
const baseUrl = ${JSON.stringify(baseUrl)};

function writeResult(data) {
  document.getElementById('result').textContent = JSON.stringify(data, null, 2);
}

function showLinks(doc) {
  const linksEl = document.getElementById('links');
  linksEl.innerHTML = '';
  if (!doc?.publicId) return;

  const playerUrl = baseUrl + '/player/' + doc.publicId;
  const p = document.createElement('a');
  p.href = playerUrl;
  p.target = '_blank';
  p.textContent = 'Kalıcı Oynatıcı Linki: ' + playerUrl;
  linksEl.appendChild(p);

  for (const q of [1080, 720, 360]) {
    const url = baseUrl + '/watch/' + doc.publicId + '/' + q;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.textContent = q + 'p Kalıcı Link: ' + url;
    linksEl.appendChild(a);

    const c = document.createElement('button');
    c.textContent = q + 'p linkini kopyala';
    c.onclick = () => navigator.clipboard.writeText(url);
    linksEl.appendChild(c);
  }
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
  showLinks(data);
}

async function ingestFile() {
  const file = document.getElementById('fileInput').files[0];
  const form = new FormData();
  form.append('video', file);
  const res = await fetch('/ingest/upload', { method: 'POST', body: form });
  const data = await res.json();
  writeResult(data);
  showLinks(data);
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
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Player ${publicId}</title></head>
<body style="font-family:Arial; max-width:900px; margin:2rem auto;">
  <h2>Video Player: ${publicId}</h2>
  <select id="q"><option value="1080">1080p</option><option value="720" selected>720p</option><option value="360">360p</option></select>
  <button onclick="loadVideo()">Yükle</button>
  <p id="link"></p>
  <video id="v" controls style="width:100%;max-height:70vh"></video>
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
