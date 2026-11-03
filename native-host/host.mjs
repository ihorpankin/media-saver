// Хелпер Media Saver: принимает от расширения ссылку на ролик и скачивает его через yt-dlp.
// Chrome запускает его сам (Native Messaging) на каждое скачивание и общается через stdin/stdout:
// каждое сообщение — 4 байта длины (little-endian) и JSON.
//
// Запросы:
//   { action: 'ping' }                                         → { type: 'pong', ytdlp, ffmpeg }
//   { action: 'download', url, quality: 'best'|'compatible' }  → { type: 'progress', percent }…
//                                                                 { type: 'done', file } | { type: 'error', message }

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Пути к yt-dlp и ffmpeg, которые записал install.ps1. Chrome запускает хелпер со своим PATH,
 * а он может быть старше установки yt-dlp — поэтому на PATH не полагаемся.
 */
function loadConfig() {
  try {
    const text = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'host-config.json'),
      'utf8',
    );
    // PowerShell 5.1 пишет UTF-8 с BOM (U+FEFF) — JSON.parse на нём падает
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return {};
  }
}

const config = loadConfig();
const YTDLP = config.ytdlp || 'yt-dlp';
const FFMPEG = config.ffmpeg || 'ffmpeg';

// Папка — адрес канала (@handle): он уникален и не меняется при переименовании канала.
// Так же называет папку расширение для превью (apps/youtube/youtube.content.ts)
const OUTPUT = join(
  homedir(),
  'Downloads',
  'youtube',
  '%(uploader_id,channel)s',
  '%(title)s [%(id)s].%(ext)s',
);

// Форматы: лучшее видео + лучший звук, или H.264 + AAC до 1080p, которые откроет любой плеер
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
    // --print ниже включает тихий режим и прячет прогресс — возвращаем его явно
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
        // Не чаще шага в 1%, чтобы не заваливать расширение сообщениями
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
    // У ffmpeg флаг с одним дефисом
    send({ type: 'pong', ytdlp: version(YTDLP), ffmpeg: version(FFMPEG, '-version') });
    process.exit(0);
  } else if (message.action === 'download') {
    download(message);
  } else {
    send({ type: 'error', message: `unknown command ${message.action}` });
    process.exit(0);
  }
});
