import axios from 'axios';

export class Odnoklassniki {
  constructor() {
    this.name = 'Odnoklassniki';
    this.mainUrl = 'https://odnoklassniki.ru';
    this.baseHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    };
  }

  async extract(url, referer = null) {
    const baseReferer = this.getReferer(url);
    const headers = {
      ...this.baseHeaders,
      ...(referer ? { Referer: referer } : { Referer: baseReferer })
    };

    if (url.includes('/video/')) {
      url = url.replace('/video/', '/videoembed/');
    }

    const response = await this.fetchWithRedirects(url, headers);
    const responseText = this.decodeResponseText(response.data);
    const metadataUrl = this.extractMetadataUrl(responseText);

    let videos = [];
    if (metadataUrl) {
      const metadata = await this.fetchMetadata(metadataUrl, headers);
      videos = this.normalizeVideos(metadata);
    }

    if (!videos.length) {
      videos = this.extractFallbackVideos(responseText);
    }

    videos = this.sortVideosByQuality(videos);
    if (!videos.length) {
      throw new Error('No valid video URLs found.');
    }

    return {
      name: this.name,
      videos,
      referer: baseReferer,
      subtitles: []
    };
  }

  getReferer(url) {
    if (url.includes('ok.ru')) return 'https://ok.ru/';
    return this.mainUrl;
  }

  decodeResponseText(text) {
    return text
      .replace(/\\&quot;/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\u([0-9A-Fa-f]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  }

  extractMetadataUrl(html) {
    const directMatch = html.match(/"metadataUrl":"([^"]+)"/);
    if (directMatch?.[1]) return this.normalizeUrl(directMatch[1]);

    const optionsMatch = html.match(/data-options="([^"]+)"/);
    if (optionsMatch?.[1]) {
      const decoded = this.decodeHtmlEntities(optionsMatch[1]);
      try {
        const parsed = JSON.parse(decoded);
        const metadataUrl = parsed?.flashvars?.metadataUrl || parsed?.metadataUrl;
        if (metadataUrl) return this.normalizeUrl(metadataUrl);
      } catch {
        return null;
      }
    }

    return null;
  }

  async fetchMetadata(metadataUrl, headers) {
    const response = await axios.get(metadataUrl, {
      headers: {
        ...headers,
        Accept: 'application/json,text/plain,*/*'
      }
    });
    return response.data?.metadata || response.data;
  }

  normalizeVideos(metadata) {
    const rawVideos = metadata?.videos || metadata?.movie?.videos || metadata?.meta?.videos || [];
    const list = Array.isArray(rawVideos) ? rawVideos : Object.values(rawVideos || {});

    const normalized = list
      .filter((video) => video?.url || video?.videoSrc || video?.src)
      .map((video) => {
        const url = video.url || video.videoSrc || video.src;
        const quality = (video.name || video.quality || video.label || video.key || 'AUTO').toString().toUpperCase();
        return { quality, url: this.normalizeUrl(url) };
      });

    if (metadata?.hlsManifestUrl) {
      normalized.push({ quality: 'HLS', url: this.normalizeUrl(metadata.hlsManifestUrl) });
    }

    return normalized;
  }

  extractFallbackVideos(responseText) {
    const match = responseText.match(/"videos":(\[.*?\])/);
    let videos = [];
    if (match?.[1]) {
      try {
        videos = JSON.parse(match[1]);
      } catch {
        videos = [];
      }
    }

    const altMatch = responseText.match(/"videoSrc":"(.*?)"/);
    if (altMatch && !videos.some((video) => video.url)) {
      videos.push({ name: 'HD', url: altMatch[1] });
    }

    return videos
      .filter((video) => video?.url)
      .map((video) => ({ quality: (video.name || 'AUTO').toUpperCase(), url: this.normalizeUrl(video.url) }));
  }

  sortVideosByQuality(videos) {
    const qualityOrder = { ULTRA: 8, QUAD: 7, FULL: 6, FHD: 6, HD: 5, SD: 4, LOW: 2, MOBILE: 1, HLS: 0, AUTO: 0 };

    const scoreQuality = (quality) => {
      const upper = quality?.toUpperCase?.() || 'AUTO';
      if (qualityOrder[upper] !== undefined) return qualityOrder[upper];
      const resMatch = upper.match(/(\d{3,4})P/);
      if (resMatch) return Number(resMatch[1]) / 100;
      return -1;
    };

    return videos
      .filter((video) => video?.url)
      .map((video) => ({ ...video, quality: video.quality?.toUpperCase?.() || 'AUTO', type: video.url?.includes('.m3u8') ? 'm3u8' : 'mp4' }))
      .sort((a, b) => scoreQuality(b.quality) - scoreQuality(a.quality));
  }

  normalizeUrl(url) {
    if (!url) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `https://ok.ru${url}`;
    return url.replace(/\\u0026/g, '&');
  }

  decodeHtmlEntities(text) {
    return text.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  async fetchWithRedirects(url, headers, maxRedirects = 5) {
    let redirects = 0;
    while (redirects < maxRedirects) {
      const response = await axios.get(url, {
        headers,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400
      });

      if (![301, 302].includes(response.status)) return response;

      const redirectedUrl = response.headers.location;
      if (!redirectedUrl) throw new Error('Redirect location not found.');

      url = redirectedUrl.startsWith('http') ? redirectedUrl : `https://${redirectedUrl}`;
      redirects++;
    }

    throw new Error(`Max redirects (${maxRedirects}) reached.`);
  }
}
