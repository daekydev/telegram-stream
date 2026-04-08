import axios from 'axios';
import {
  buildSibnetHeaders,
  extractSibnetVideoUrlFromHtml,
  normalizeSibnetUrl,
  SIBNET_HEADERS
} from './sibnet-utils.js';

export const extractSibnetVideoUrl = async (pageUrl) => {
  if (!pageUrl) {
    throw new Error('Sibnet URL missing');
  }

  if (pageUrl.includes('/v/') || pageUrl.endsWith('.mp4')) {
    return normalizeSibnetUrl(pageUrl);
  }

  const response = await axios.get(pageUrl, {
    headers: buildSibnetHeaders({ referer: pageUrl })
  });

  const html = response.data;
  const directUrl = extractSibnetVideoUrlFromHtml(html);

  if (!directUrl) {
    throw new Error('Video URL not found');
  }

  return directUrl;
};

export {
  SIBNET_HEADERS,
  buildSibnetHeaders,
  extractSibnetVideoUrlFromHtml,
  normalizeSibnetUrl
};
