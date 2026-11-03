// Media Saver helper: receives a video link from the extension and downloads it with yt-dlp.
// Chrome starts it itself (Native Messaging) for each download and talks over stdin/stdout:
// each message is 4 bytes of length (little-endian) and JSON.
//
// Requests:
//   { action: 'ping' }                                         → { type: 'pong', ytdlp, ffmpeg }
//   { action: 'download', url, quality: 'best'|'compatible' }  → { type: 'progress', percent }…
//                                                                 { type: 'done', file } | { type: 'error', message }

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Paths to yt-dlp and ffmpeg written by install.ps1. Chrome starts the helper with its own PATH,
 * which may predate the yt-dlp install, so PATH isn't relied on.
 */
function loadConfig() {
  try {
    const text = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'host-config.json'),
      'utf8',
    );
    // PowerShell 5.1 writes UTF-8 with a BOM (U+FEFF), and JSON.parse fails on it
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return {};
  }
}

const config = loadConfig();
const YTDLP = config.ytdlp || 'yt-dlp';
const FFMPEG = config.ffmpeg || 'ffmpeg';

// The folder is the channel handle (@handle): it's unique and doesn't change when the channel is renamed.
// The extension names the thumbnail folder the same way (apps/youtube/youtube.content.ts)
const OUTPUT = join(
  homedir(),
  'Downloads',
  'youtube',
  '%(uploader_id,channel)s',
  '%(title)s [%(id)s].%(ext)s',
);

// Formats: best video + best audio, or H.264 + AAC up to 1080p that any player opens
const FORMATS = {
  best: 'bv*+ba/b',
  compatible: 'bv*[vcodec^=avc1][height<=1080]+ba[acodec^=mp4a]/b[ext=mp4]/b',
};

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

function version(command, flag = '--version') {
  const result = spawnSync(command, [flag], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.split(/\r?\n/)[0].trim() : null;
}

function download({ url, quality }) {
  if (!/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(url ?? '')) {
    send({ type: 'error', message: 'not a YouTube link' });
    return process.exit(0);
  }
  const args = [
    ...(config.ffmpeg ? ['--ffmpeg-location', config.ffmpeg] : []),
    '-f',
    FORMATS[quality] ?? FORMATS.best,
    '--merge-output-format',
    'mp4',
    '-o',
    OUTPUT,
    '--no-playlist',
    '--newline',
    // --print below turns on quiet mode and hides progress, so turn it back on explicitly
    '--progress',
    '--progress-template',
    'download:PROGRESS %(progress._percent_str)s',
    '--print',
    'after_move:FILE %(filepath)s',
    '--',
    url,
  ];
  const child = spawn(YTDLP, args, { windowsHide: true });
  let lastError = '';
  let file;
  let lastPercent = -1;

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      const progress = line.match(/^PROGRESS\s+([\d.]+)%/);
      if (progress) {
        // At most every 1%, so as not to flood the extension with messages
        const percent = Math.floor(Number(progress[1]));
        if (percent !== lastPercent) send({ type: 'progress', percent });
        lastPercent = percent;
      }
      const done = line.match(/^FILE (.+)$/);
      if (done) file = done[1].trim();
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    const error = chunk.split(/\r?\n/).find((l) => l.startsWith('ERROR'));
    if (error) lastError = error.replace(/^ERROR:\s*/, '');
  });
  child.on('error', () => {
    send({ type: 'error', message: 'yt-dlp not found — install it (see README)' });
    process.exit(0);
  });
  child.on('close', (code) => {
    if (code === 0) send({ type: 'done', file });
    else send({ type: 'error', message: lastError || `yt-dlp exited with code ${code}` });
    process.exit(0);
  });
}

let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  if (buffer.length < 4) return;
  const length = buffer.readUInt32LE(0);
  if (buffer.length < 4 + length) return;
  let message;
  try {
    message = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
  } catch {
    send({ type: 'error', message: 'the helper received a malformed message' });
    return process.exit(0);
  }
  buffer = buffer.subarray(4 + length);

  if (message.action === 'ping') {
    // ffmpeg's flag has a single dash
    send({ type: 'pong', ytdlp: version(YTDLP), ffmpeg: version(FFMPEG, '-version') });
    process.exit(0);
  } else if (message.action === 'download') {
    download(message);
  } else {
    send({ type: 'error', message: `unknown command ${message.action}` });
    process.exit(0);
  }
});
