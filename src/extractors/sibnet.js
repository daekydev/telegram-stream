import axios from 'axios';

export const SIBNET_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

export function normalizeSibnetUrl(url) {
  if (!url) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `https://video.sibnet.ru${url}`;
  return url;
}

export function buildSibnetHeaders({ referer } = {}) {
  return {
    ...SIBNET_HEADERS,
    Referer: referer || 'https://video.sibnet.ru/'
  };
}

export function extractSibnetVideoUrlFromHtml(html) {
  const patterns = [
    /player\.src\s*=\s*"([^"]+\.mp4[^"]*)"/i,
    /<source[^>]+src="([^"]+\.mp4[^"]*)"/i,
    /"src"\s*:\s*"([^"]+\.mp4[^"]*)"/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return normalizeSibnetUrl(match[1].replace(/\\\//g, '/'));
    }
  }

  return null;
}

export async function extractSibnetVideoUrl(pageUrl) {
  if (!pageUrl) throw new Error('Sibnet URL missing');

  if (pageUrl.includes('/v/') || pageUrl.endsWith('.mp4')) {
    return normalizeSibnetUrl(pageUrl);
  }

  const response = await axios.get(pageUrl, { headers: buildSibnetHeaders({ referer: pageUrl }) });
  const html = response.data;
  const directUrl = extractSibnetVideoUrlFromHtml(html);

  if (!directUrl) {
    throw new Error('Video URL not found');
  }

  return directUrl;
}
