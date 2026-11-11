/** Physically based materials for the room, built on the procedural texture sets. */
import {
  Color,
  Texture,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector2,
} from '@iwsdk/core';
import { QUALITY } from './quality.js';
import {
  PBRSet,
  brushedMetalSet,
  detailNormal,
  rubberSet,
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

let rubberCache: PBRSet | null = null;
/** Pebbled rubber play ball with moulded seams. */
export function rubberBall(color: number): MeshStandardMaterial {
  rubberCache ??= rubberSet();
  const base = QUALITY.clearcoat
    ? new MeshPhysicalMaterial({
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
        sheen: 0.4,
        sheenColor: new Color(color).multiplyScalar(0.6),
      })
    : new MeshStandardMaterial();
  base.color = new Color(color);
  const m = withSet(base, rubberCache, 1.2);
  m.roughness = 0.5;
  return m;
}

let metalCache: PBRSet | null = null;
/** Anodised / painted aluminium (the knock-over cans). */
export function canMetal(color: number, label?: Texture): MeshStandardMaterial {
  metalCache ??= brushedMetalSet();
  const m = withSet(new MeshStandardMaterial({ color: new Color(color) }), metalCache, 0.5);
  m.metalnessMap = metalCache.ormMap;
  m.metalness = label ? 0.6 : 1;
  if (label) m.map = label;
  return m;
}

let tileCache: PBRSet | null = null;
export function floorTiles(): MeshStandardMaterial {
  tileCache ??= tileSet(4);
  return withSet(new MeshStandardMaterial(), retile(tileCache, 3, 3), 0.8);
}

const woodCache = new Map<number, PBRSet>();
/**
 * Oak with real grain. One high-resolution neutral set per plank count is shared and tinted per
 * material, so all the wood in the room costs two texture sets. `rough` <= 0.5 reads as varnished.
 */
export function oak(
  _darkHex: string,
  lightHex: string,
  repeatX: number,
  repeatY: number,
  rough: number,
  planks = 0,
  rotation = 0,
): MeshStandardMaterial {
  let set = woodCache.get(planks);
  if (!set) {
    set = woodSet('#9c8358', '#ffffff', { seed: planks * 7 + 3, planks, rough: 0.6, rings: 5 });
    woodCache.set(planks, set);
  }
  const base =
    QUALITY.clearcoat && rough <= 0.5
      ? new MeshPhysicalMaterial({ clearcoat: 0.45, clearcoatRoughness: 0.25 })
      : new MeshStandardMaterial();
  const m = withSet(base, retile(set, repeatX, repeatY, rotation), 0.9);
  m.color = new Color(lightHex);
  m.roughness = Math.min(1, rough / 0.6);
  return m;
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
