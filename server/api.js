// API realtime: Server-Sent Events (máy chủ -> trình duyệt) + POST JSON (trình duyệt -> máy chủ).
// Không cần thư viện ngoài; hoạt động trên máy tính và điện thoại qua mạng LAN/Internet.
import { Hub, HubError } from './Hub.js';
import { ProfileStore } from './ProfileStore.js';

const MAX_BODY = 16 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HubError('Dữ liệu quá lớn', 413));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new HubError('JSON không hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

export function createApi({ dataFile, config } = {}) {
  const profiles = new ProfileStore(dataFile);
  const hub = new Hub({ profiles, config });

  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/')) return false;
    try {
      if (url.pathname === '/api/health') {
        json(res, 200, { ok: true, rooms: hub.rooms.size, online: [...hub.clients.values()].filter((c) => c.streams.size).length });
      } else if (url.pathname === '/api/stream' && req.method === 'GET') {
        const profile = profiles.get(url.searchParams.get('token'));
        if (!profile) throw new HubError('Phiên không hợp lệ', 401);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write('retry: 1500\n\n');
        const stream = {
          send: (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        };
        const detach = hub.attachStream(profile, stream);
        const ping = setInterval(() => res.write(': ping\n\n'), 20000);
        req.on('close', () => {
          clearInterval(ping);
          detach();
        });
      } else if (url.pathname === '/api/cmd' && req.method === 'POST') {
        const body = await readJson(req);
        if (body.cmd === 'hello') {
          // Tài khoản khách: token lưu ở trình duyệt; không có token hợp lệ thì tạo hồ sơ mới.
          let profile = profiles.get(body.token);
          if (!profile) profile = profiles.create(String(body.name || '').trim().slice(0, 18), body.characterId);
          hub.client(profile);
          json(res, 200, { token: profile.token, profile: profiles.publicView(profile) });
          return true;
        }
        const profile = profiles.get(req.headers['x-token'] || body.token);
        if (!profile) throw new HubError('Phiên không hợp lệ, hãy tải lại trang', 401);
        const result = await hub.command(profile, body.cmd, body);
        json(res, 200, { ok: true, ...result });
      } else {
        throw new HubError('Không tìm thấy API', 404);
      }
    } catch (err) {
      if (!(err instanceof HubError)) console.error('[api]', err);
      if (!res.headersSent) json(res, err.status || 500, { ok: false, error: err instanceof HubError ? err.message : 'Lỗi máy chủ' });
    }
    return true;
  }

  return { handle, hub, profiles };
}
