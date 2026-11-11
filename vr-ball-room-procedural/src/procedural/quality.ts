/**
 * Quality tier. "high" targets desktop / PC VR GPUs; "low" targets standalone headsets and phones.
 * Auto-detected, overridable with ?quality=high|low (remembered in localStorage).
 */
export type QualityTier = 'high' | 'low';

const KEY = 'vrbr-quality';

function detect(): { tier: QualityTier; forced: boolean } {
  try {
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'high' || q === 'low') {
      localStorage.setItem(KEY, q);
      return { tier: q, forced: true };
    }
    if (q === 'auto') localStorage.removeItem(KEY);
    const saved = localStorage.getItem(KEY);
    if (saved === 'high' || saved === 'low') return { tier: saved, forced: true };
  } catch {
    // storage unavailable: fall through to auto-detect
  }
  const ua = navigator.userAgent;
  const standalone = /OculusBrowser|Quest|Pico|Android|iPhone|iPad|Mobile/i.test(ua);
  return { tier: standalone ? 'low' : 'high', forced: false };
}

const d = detect();
const hi = d.tier === 'high';

export const QUALITY = {
  tier: d.tier,
  forced: d.forced,
  high: hi,
  texSize: hi ? 512 : 256,
  anisotropy: hi ? 8 : 2,
  shadowMapSize: hi ? 4096 : 1024,
  probeSize: hi ? 256 : 128,
  skyOctaves: hi ? 6 : 4,
  clearcoat: hi,
  practicalLightShadows: hi,
  dustCount: hi ? 900 : 200,
  grassBlades: hi ? 60000 : 6000,
  treeCount: hi ? 16 : 10,
};

/** Switches tier and reloads (textures and geometry are generated once at startup). */
export function setQualityTier(tier: QualityTier | 'auto') {
  try {
    if (tier === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, tier);
  } catch {
    // ignore
  }
  const url = new URL(location.href);
  url.searchParams.delete('quality');
  location.replace(url.toString());
}
