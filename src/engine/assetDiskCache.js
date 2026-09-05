/**
 * Disk cache for downloaded assets (Cache API) — not RAM/VRAM.
 * MemoryGuardian never touches this; only clearAssetDiskCache() does.
 *
 * Small if: if cache has URL → use it; else fetch once and store.
 */

export const ASSET_CACHE_NAME = 'city-assets-v1';

function absoluteUrl(url) {
  try {
    return new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost/').href;
  } catch {
    return url;
  }
}

/**
 * Fetch a URL, preferring Cache API. First hit downloads and stores; later hits read disk.
 * @param {string} url
 * @returns {Promise<Response>}
 */
export async function cachedFetch(url) {
  const abs = absoluteUrl(url);
  if (typeof caches === 'undefined') {
    return fetch(abs);
  }
  const cache = await caches.open(ASSET_CACHE_NAME);
  const hit = await cache.match(abs);
  if (hit) return hit;

  const res = await fetch(abs);
  if (res.ok) {
    try {
      await cache.put(abs, res.clone());
    } catch {
      /* quota / opaque — ignore; still return network response */
    }
  }
  return res;
}

/** Wipe the whole asset disk cache. Does not touch MemoryGuardian residency. */
export async function clearAssetDiskCache() {
  if (typeof caches === 'undefined') return false;
  return caches.delete(ASSET_CACHE_NAME);
}

export async function assetDiskCacheCount() {
  if (typeof caches === 'undefined') return 0;
  const keys = await caches.keys();
  if (!keys.includes(ASSET_CACHE_NAME)) return 0;
  const cache = await caches.open(ASSET_CACHE_NAME);
  const reqs = await cache.keys();
  return reqs.length;
}
