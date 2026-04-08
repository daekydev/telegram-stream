export const SIBNET_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0',
  Referer: 'https://video.sibnet.ru/'
};

export const buildSibnetHeaders = ({ userAgent, referer } = {}) => ({
  ...SIBNET_HEADERS,
  'User-Agent': userAgent || SIBNET_HEADERS['User-Agent'],
  Referer: referer || SIBNET_HEADERS.Referer,
  Origin: 'https://video.sibnet.ru'
});

export const normalizeSibnetUrl = (videoUrl) => {
  if (!videoUrl) return videoUrl;
  if (videoUrl.startsWith('//')) return `https:${videoUrl}`;
  if (videoUrl.startsWith('/v/')) return `https://video.sibnet.ru${videoUrl}`;
  return videoUrl;
};

export const extractSibnetVideoUrlFromHtml = (html) => {
  const patterns = [
    /src:\s*"(https?:\/\/video\.sibnet\.ru\/v\/[^"]+)"/,
    /src:\s*'(https?:\/\/video\.sibnet\.ru\/v\/[^']+)'/,
    /src:\s*"(\/\/video\.sibnet\.ru\/v\/[^"]+)"/,
    /src:\s*"(\/v\/[^"]+)"/,
    /file:\s*"(https?:\/\/video\.sibnet\.ru\/v\/[^"]+)"/,
    /file:\s*"(https?:\/\/[^\"]+\.mp4[^\"]*)"/,
    /file:\s*'(https?:\/\/[^']+\.mp4[^']*)'/,
    /src:\s*"(https?:\/\/[^\"]+\.mp4[^\"]*)"/,
    /src:\s*'(https?:\/\/[^']+\.mp4[^']*)'/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return normalizeSibnetUrl(match[1]);
  }

  const tagMatch = html.match(/<(?:source|video)[^>]+src=[\"']([^\"']+)[\"']/i);
  if (tagMatch?.[1] && tagMatch[1].includes('sibnet') && tagMatch[1].includes('.mp4')) {
    return normalizeSibnetUrl(tagMatch[1]);
  }

  const fallbackMp4 = html.match(/https?:\/\/[^"'\\s]+\.mp4[^"'\\s]*/i);
  if (fallbackMp4?.[0] && fallbackMp4[0].includes('sibnet')) {
    return normalizeSibnetUrl(fallbackMp4[0]);
  }

  return null;
};
