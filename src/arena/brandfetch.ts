/** Public Brandfetch Logo API client id (safe to embed in the browser). */
export const BRANDFETCH_CLIENT_ID = import.meta.env.VITE_BRANDFETCH_CLIENT_ID ?? '1idXoMCXLbmM8a2t1P4';

export function brandfetchLogoUrl(domain: string, size = 28): string {
  const retina = Math.max(32, size * 2);
  const params = new URLSearchParams({
    c: BRANDFETCH_CLIENT_ID,
    fallback: 'lettermark',
  });
  return `https://cdn.brandfetch.io/domain/${domain}/w/${retina}/h/${retina}/icon.png?${params.toString()}`;
}