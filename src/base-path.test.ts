import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Simulate Vite base via env before dynamic import isn't possible; test logic inline.
function appPathFromBase(base: string, subpath = ''): string {
  const APP_BASE = base.replace(/\/$/, '');
  if (!subpath) return APP_BASE || '/';
  const normalized = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return `${APP_BASE}${normalized}`;
}

function stripAppBaseFrom(base: string, pathname: string): string {
  const APP_BASE = base.replace(/\/$/, '');
  if (!APP_BASE) return pathname || '/';
  if (pathname === APP_BASE || pathname === `${APP_BASE}/`) return '/';
  if (pathname.startsWith(`${APP_BASE}/`)) return pathname.slice(APP_BASE.length) || '/';
  return pathname;
}

describe('base-path helpers', () => {
  it('builds subpath URLs under /dukaanbench', () => {
    assert.equal(appPathFromBase('/dukaanbench', '/arena-2'), '/dukaanbench/arena-2');
    assert.equal(appPathFromBase('/dukaanbench', '/api/health'), '/dukaanbench/api/health');
  });

  it('strips base for client routing', () => {
    assert.equal(stripAppBaseFrom('/dukaanbench', '/dukaanbench/arena-2'), '/arena-2');
    assert.equal(stripAppBaseFrom('/dukaanbench', '/dukaanbench'), '/');
  });
});