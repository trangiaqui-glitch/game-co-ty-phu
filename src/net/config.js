// Địa chỉ máy chủ online khi giao diện được host tĩnh (GitHub Pages không chạy được server.js).
// Điền URL máy chủ Node đã deploy, ví dụ: 'https://co-ty-phu-3d.onrender.com' (không có dấu / ở cuối).
export const ONLINE_SERVER = '';

/**
 * Chọn máy chủ: ?server=<url> (lưu lại cho lần sau) > ONLINE_SERVER (khi chạy trên github.io) > cùng tên miền.
 */
export function resolveServerBase() {
  const KEY = 'co-ty-phu-3d:server';
  const param = new URLSearchParams(location.search).get('server');
  try {
    if (param !== null) {
      if (param) localStorage.setItem(KEY, param.replace(/\/+$/, ''));
      else localStorage.removeItem(KEY);
    }
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
  } catch {
    if (param) return param.replace(/\/+$/, '');
  }
  if (location.hostname.endsWith('github.io') || location.protocol === 'file:') return ONLINE_SERVER;
  return '';
}
