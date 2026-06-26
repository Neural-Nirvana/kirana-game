export function appBasePath(): string {
  return (process.env.KIRANA_BASE_PATH ?? '').replace(/\/$/, '');
}

export function appRoute(path: string): string {
  const base = appBasePath();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function cookiePath(): string {
  const base = appBasePath();
  return base || '/';
}