// Máy chủ game (không cần cài thêm gói nào): node server.js [port]
// - Phục vụ file tĩnh của game.
// - API multiplayer realtime tại /api (xem server/api.js).
// Mở từ máy khác / điện thoại cùng mạng: http://<IP-LAN>:<port>
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './server/api.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const DATA_FILE = process.env.DATA_FILE || join(ROOT, 'data', 'profiles.json');
// Thư mục không phục vụ qua web (mã máy chủ, dữ liệu người chơi).
const PRIVATE = ['server', 'data', 'node_modules', '.git'].map((d) => join(ROOT, d) + sep);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ktx2': 'image/ktx2',
  '.hdr': 'application/octet-stream',
  '.md': 'text/markdown; charset=utf-8',
};

const config = {};
if (process.env.TURN_TIMEOUT_MS) config.turnTimeoutMs = Number(process.env.TURN_TIMEOUT_MS);
if (process.env.AI_DELAY_MS) config.aiDelayMs = Number(process.env.AI_DELAY_MS);
const api = createApi({ dataFile: DATA_FILE, config });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (await api.handle(req, res, url)) return;
    let path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT) || PRIVATE.some((p) => (path + sep).startsWith(p))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if ((await stat(path).catch(() => null))?.isDirectory()) path = join(path, 'index.html');
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Không tìm thấy');
  }
});

server.listen(PORT, () => {
  console.log(`Cờ Tỷ Phú 3D đang chạy tại http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  Thiết bị khác cùng mạng: http://${a.address}:${PORT}`);
    }
  }
});
