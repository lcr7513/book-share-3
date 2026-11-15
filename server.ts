import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Persistent Data Storage Path
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface TrackedFile {
  id: string;
  name: string;
  driveUrl: string;
  driveFileId: string;
  category: string;
  size: string;
  downloadCount: number;
  createdAt: string;
  lastDownloadedAt?: string;
  description?: string;
  customTargetUrl?: string;
}

interface DownloadLog {
  id: string;
  fileId: string;
  fileName: string;
  timestamp: string;
  referrer: string;
  device: string;
  ip: string;
  status: 'success' | 'redirected';
}

interface StorageSchema {
  files: TrackedFile[];
  logs: DownloadLog[];
}

/**
 * Format date in Korea Standard Time (KST, Asia/Seoul, UTC+9)
 */
function getKoreanTimestamp(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const getPart = (t: string) => parts.find((p) => p.type === t)?.value || '';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  } catch (e) {
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(date.getTime() + kstOffset);
    return kstDate.toISOString().replace('T', ' ').slice(0, 19);
  }
}

function getKoreanCreatedAt(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true,
    });
    return formatter.format(date);
  } catch (e) {
    return getKoreanTimestamp(date);
  }
}

const INITIAL_STORE: StorageSchema = {
  files: [
    {
      id: 'file-ai-inquiry',
      name: 'AI를_활용한_사회문제탐구.pdf',
      driveUrl: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view?usp=sharing',
      driveFileId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      category: 'pdf',
      size: '4.2 MB',
      downloadCount: 15,
      createdAt: '2026. 11. 11. 오후 7:00:00',
      lastDownloadedAt: '2026-11-12 15:50:12',
      description: '인공지능을 활용한 사회문제 해결 탐구 학습 자료 및 학생 과제 양식',
    },
    {
      id: 'file-1',
      name: '2026학년도_학교_교육과정_운영계획_및_학사일정.pdf',
      driveUrl: 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view?usp=sharing',
      driveFileId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      category: 'pdf',
      size: '3.4 MB',
      downloadCount: 42,
      createdAt: '2026. 11. 01. 오전 9:30:00',
      lastDownloadedAt: '2026-11-12 14:22:15',
      description: '학부모 및 교직원용 학사일정 및 연간 교육 계획 안내 문서',
    },
  ],
  logs: [
    {
      id: 'log-101',
      fileId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      fileName: 'AI를_활용한_사회문제탐구.pdf',
      timestamp: '2026-11-12 15:50:12',
      referrer: '학생 다운로드 링크',
      device: 'Mobile (Android / Chrome)',
      ip: '211.234.***.***',
      status: 'success',
    },
  ],
};

let memoryStore: StorageSchema | null = null;
const sseClients = new Set<Response>();

function loadStoreFromDisk(): StorageSchema {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const data = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.files) && Array.isArray(parsed.logs)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error reading store:', err);
  }
  const initialCopy: StorageSchema = JSON.parse(JSON.stringify(INITIAL_STORE));
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(initialCopy, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error initializing store:', err);
  }
  return initialCopy;
}

function getStore(): StorageSchema {
  if (!memoryStore) {
    memoryStore = loadStoreFromDisk();
  }
  return memoryStore;
}

function broadcastSync(): void {
  if (sseClients.size === 0) return;
  const store = getStore();
  const payload = `event: sync\ndata: ${JSON.stringify({
    files: store.files,
    logs: store.logs,
  })}\n\n`;

  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function persistAndBroadcast(): void {
  const store = getStore();
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing store:', err);
  }
  broadcastSync();
}

// Initialize authoritative store on startup
getStore();

function detectDevice(userAgent: string): string {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);
  const platform = isMobile ? 'Mobile' : 'Desktop';
  const browser = userAgent.includes('KAKAOTALK')
    ? 'KakaoTalk'
    : userAgent.includes('Whale')
    ? 'Whale'
    : userAgent.includes('Edg')
    ? 'Edge'
    : userAgent.includes('Chrome')
    ? 'Chrome'
    : userAgent.includes('Safari')
    ? 'Safari'
    : 'Browser';
  return `${platform} (${browser})`;
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '203.241.***.***';
}

function createLogId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function getDirectUrl(fileId: string, driveUrl: string = ''): string {
  if (driveUrl.includes('docs.google.com/document')) {
    return `https://docs.google.com/document/d/${fileId}/export?format=pdf`;
  }
  if (driveUrl.includes('docs.google.com/presentation')) {
    return `https://docs.google.com/presentation/d/${fileId}/export?format=pptx`;
  }
  if (driveUrl.includes('docs.google.com/spreadsheets')) {
    return `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
  }
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}

// -------------------------------------------------------------
// REST API & Real-Time SSE Routes
// -------------------------------------------------------------

// 0. Server-Sent Events (SSE) for instant multi-device real-time sync
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const store = getStore();
  res.write(
    `event: sync\ndata: ${JSON.stringify({
      files: store.files,
      logs: store.logs,
    })}\n\n`
  );

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// 0.5 Atomic sync endpoint (files + logs in single response)
app.get('/api/sync', (_req: Request, res: Response) => {
  const store = getStore();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, files: store.files, logs: store.logs });
});

// 1. GET all tracked files
app.get('/api/files', (_req: Request, res: Response) => {
  const store = getStore();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, files: store.files });
});

// 2. GET single tracked file by ID or driveFileId (for Student page)
app.get('/api/file/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const store = getStore();
  const file = store.files.find((f) => f.id === id || f.driveFileId === id);
  if (!file) {
    return res.status(404).json({ success: false, message: '해당 파일을 찾을 수 없습니다.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, file });
});

// 3. POST create new tracked file
app.post('/api/files', (req: Request, res: Response) => {
  const { name, driveUrl, driveFileId, category, size, description } = req.body;
  if (!driveFileId || !name) {
    return res.status(400).json({ success: false, message: '파일명과 파일 ID는 필수입니다.' });
  }

  const store = getStore();
  const nowStr = getKoreanCreatedAt(new Date());

  const newFile: TrackedFile = {
    id: `file-${Date.now()}`,
    name,
    driveUrl: driveUrl || '',
    driveFileId,
    category: category || 'pdf',
    size: size || '2.0 MB',
    downloadCount: 0,
    createdAt: nowStr,
    description: description || '영구 저장된 추적 파일',
  };

  store.files.unshift(newFile);
  persistAndBroadcast();

  res.json({ success: true, file: newFile, files: store.files, logs: store.logs });
});

// 4. DELETE a tracked file
app.delete('/api/files/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const store = getStore();
  store.files = store.files.filter((f) => f.id !== id && f.driveFileId !== id);
  persistAndBroadcast();
  res.json({ success: true, message: '파일이 영구 삭제되었습니다.', files: store.files, logs: store.logs });
});

// 5. POST record a download (increment count & log with KST timestamp)
app.post('/api/download/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const store = getStore();
  const file = store.files.find((f) => f.id === id || f.driveFileId === id);

  if (!file) {
    return res.status(404).json({ success: false, message: '해당 파일을 찾을 수 없습니다.' });
  }

  const timestamp = getKoreanTimestamp(new Date());

  file.downloadCount += 1;
  file.lastDownloadedAt = timestamp;

  const userAgent = req.headers['user-agent'] || '';

  const newLog: DownloadLog = {
    id: createLogId(),
    fileId: file.driveFileId,
    fileName: file.name,
    timestamp,
    referrer: (req.headers.referer as string) || '웹 앱 다운로드 버튼',
    device: detectDevice(userAgent),
    ip: extractClientIp(req),
    status: 'success',
  };

  store.logs.unshift(newLog);
  persistAndBroadcast();

  const directUrl = getDirectUrl(file.driveFileId, file.driveUrl);
  res.json({ success: true, file, files: store.files, logs: store.logs, directUrl });
});

// 6. GET direct stream/download link (Student direct link with instant count and fast CDN redirect)
// e.g. /api/download/:fileId/direct?skipCount=1
app.get('/api/download/:fileId/direct', (req: Request, res: Response) => {
  const { fileId } = req.params;
  const skipCount = req.query.skipCount === '1' || req.query.skipCount === 'true';

  const store = getStore();
  const file = store.files.find((f) => f.driveFileId === fileId || f.id === fileId);

  const timestamp = getKoreanTimestamp(new Date());

  let fileName = file ? file.name : `파일_${fileId}.pdf`;
  if (!fileName.includes('.')) {
    fileName = `${fileName}.pdf`;
  }

  // Record count and log if not explicitly skipped
  if (!skipCount) {
    if (file) {
      file.downloadCount += 1;
      file.lastDownloadedAt = timestamp;
    }

    const userAgent = req.headers['user-agent'] || '';

    const newLog: DownloadLog = {
      id: createLogId(),
      fileId: file ? file.driveFileId : fileId,
      fileName,
      timestamp,
      referrer: (req.headers.referer as string) || '학생 직접 다운로드 링크 (QR / 직링크)',
      device: detectDevice(userAgent),
      ip: extractClientIp(req),
      status: 'success',
    };

    store.logs.unshift(newLog);
    persistAndBroadcast();
  }

  const actualFileId = file ? file.driveFileId : fileId;
  const actualDriveUrl = file ? file.driveUrl : '';
  const directUrl = getDirectUrl(actualFileId, actualDriveUrl);

  // Prevent browser caching of redirect so repeat downloads always hit server counter
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res.redirect(302, directUrl);
});

// 7. GET logs
app.get('/api/logs', (_req: Request, res: Response) => {
  const store = getStore();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, logs: store.logs });
});

// 8. DELETE logs
app.delete('/api/logs', (_req: Request, res: Response) => {
  const store = getStore();
  store.logs = [];
  persistAndBroadcast();
  res.json({ success: true, message: '로그가 초기화되었습니다.', files: store.files, logs: store.logs });
});

// -------------------------------------------------------------
// Vite Middleware / Static Serving
// -------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
