/** Physically based materials for the room, built on the procedural texture sets. */
import {
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector2,
} from '@iwsdk/core';
import { QUALITY } from './quality.js';
import {
  PBRSet,
  brushedMetalSet,
  detailNormal,
  retile,
  tileSet,
  woodSet,
} from './textures.js';

function withSet(m: MeshStandardMaterial, set: PBRSet, normal = 1) {
  m.map = set.map;
  m.normalMap = set.normalMap;
  m.normalScale = new Vector2(normal, normal);
  m.roughnessMap = set.ormMap;
  m.roughness = 1;
  return m;
}

/** Moulded plastic / painted toy surface. Glossy ones get a clear coat on the high tier. */
export function plastic(color: number, roughness = 0.8): MeshStandardMaterial {
  const glossy = roughness <= 0.5;
  const m =
    QUALITY.clearcoat && glossy
      ? new MeshPhysicalMaterial({
          color: new Color(color),
          roughness,
          clearcoat: 0.7,
          clearcoatRoughness: 0.12,
        })
      : new MeshStandardMaterial({ color: new Color(color), roughness });
  m.normalMap = detailNormal();
  const s = glossy ? 0.12 : 0.3;
  m.normalScale = new Vector2(s, s);
  return m;
}

export function rubberBall(color: number): MeshStandardMaterial {
  if (!QUALITY.clearcoat) return plastic(color, 0.3);
  const m = new MeshPhysicalMaterial({
    color: new Color(color),
    roughness: 0.34,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    sheen: 0.3,
    sheenColor: new Color(color).multiplyScalar(0.6),
  });
  m.normalMap = detailNormal();
  m.normalScale = new Vector2(0.1, 0.1);
  return m;
}

let metalCache: PBRSet | null = null;
/** Anodised / painted aluminium (the knock-over cans). */
export function canMetal(color: number): MeshStandardMaterial {
  metalCache ??= brushedMetalSet();
  const m = withSet(new MeshStandardMaterial({ color: new Color(color) }), metalCache, 0.5);
  m.metalnessMap = metalCache.ormMap;
  m.metalness = 0.6;
  return m;
}

let tileCache: PBRSet | null = null;
export function floorTiles(): MeshStandardMaterial {
  tileCache ??= tileSet(4);
  return withSet(new MeshStandardMaterial(), retile(tileCache, 3, 3), 0.8);
}

const woodCache = new Map<string, PBRSet>();
/** Oak with real grain. `rough` at or under 0.5 is treated as varnished. */
export function oak(
  darkHex: string,
  lightHex: string,
  repeatX: number,
  repeatY: number,
  rough: number,
  planks = 0,
): MeshStandardMaterial {
  const key = `${darkHex}|${lightHex}|${planks}|${rough}`;
  let set = woodCache.get(key);
  if (!set) {
    set = woodSet(darkHex, lightHex, { seed: woodCache.size * 7 + 3, planks, rough, rings: 5 });
    woodCache.set(key, set);
  }
  const base =
    QUALITY.clearcoat && rough <= 0.5
      ? new MeshPhysicalMaterial({ clearcoat: 0.45, clearcoatRoughness: 0.25 })
      : new MeshStandardMaterial();
  return withSet(base, retile(set, repeatX, repeatY), 0.9);
}

export function skylightGlass(): MeshStandardMaterial {
  return new MeshPhysicalMaterial({
    color: new Color(0xd6ecff),
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    opacity: 0.16,
    envMapIntensity: 1.6,
    depthWrite: false,
  });
}
