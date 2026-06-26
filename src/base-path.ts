/** Vite injects BASE_URL (always ends with /). Empty string in dev without KIRANA_BASE_PATH. */
const viteBase = import.meta.env.BASE_URL ?? '/';
export const APP_BASE = viteBase === '/' ? '' : viteBase.replace(/\/$/, '');

export function appPath(subpath = ''): string {
  if (!subpath) return APP_BASE || '/';
  const normalized = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return `${APP_BASE}${normalized}`;
}

export function apiPath(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return appPath(normalized);
}

export function stripAppBase(pathname: string): string {
  if (!APP_BASE) return pathname || '/';
  if (pathname === APP_BASE || pathname === `${APP_BASE}/`) return '/';
  if (pathname.startsWith(`${APP_BASE}/`)) {
    const stripped = pathname.slice(APP_BASE.length);
    return stripped || '/';
  }
  return pathname;
}