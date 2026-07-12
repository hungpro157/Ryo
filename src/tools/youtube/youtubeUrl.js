import { YouTubeError } from './errors.js';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);

export function extractVideoId(urlOrId) {
  const input = String(urlOrId || '').trim();
  if (VIDEO_ID.test(input)) return input;

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new YouTubeError('INVALID_URL', 'Invalid YouTube URL or video ID');
  }

  const host = url.hostname.toLowerCase();
  let candidate = '';
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/').filter(Boolean)[0] || '';
  } else if (YOUTUBE_HOSTS.has(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/watch') candidate = url.searchParams.get('v') || '';
    else if (['shorts', 'embed', 'live'].includes(parts[0])) candidate = parts[1] || '';
  }

  if (!VIDEO_ID.test(candidate)) {
    throw new YouTubeError('INVALID_URL', 'Invalid YouTube URL or video ID');
  }
  return candidate;
}

export function findYouTubeUrl(text) {
  const matches = String(text || '').match(/https?:\/\/[^\s<>]+/giu) || [];
  for (const raw of matches) {
    const candidate = raw.replace(/[),.;!?]+$/u, '');
    try {
      extractVideoId(candidate);
      return candidate;
    } catch {}
  }
  return null;
}
