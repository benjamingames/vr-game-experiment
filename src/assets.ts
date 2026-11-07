import { AssetType, defineAssets } from '@iwsdk/core';

export default defineAssets({
  girlHandRight: {
    url: '/hands/girl-hand-right.glb',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  girlHandLeft: {
    url: '/hands/girl-hand-left.glb',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  boyHandRight: {
    url: '/hands/boy-hand-right.glb',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  boyHandLeft: {
    url: '/hands/boy-hand-left.glb',
    type: AssetType.GLTF,
    priority: 'critical',
  },
  girlHandAlbedo: {
    url: '/hands/OculusRealisticHandLight_Albedo.png',
    type: AssetType.Texture,
    priority: 'critical',
  },
  girlHandNormal: {
    url: '/hands/OculusRealisticHandLight_Normal.png',
    type: AssetType.Texture,
    priority: 'critical',
  },
  boyHandAlbedo: {
    url: '/hands/OculusRealisticHandDark_Albedo.png',
    type: AssetType.Texture,
    priority: 'critical',
  },
  boyHandNormal: {
    url: '/hands/OculusRealisticHandDark_Normal.png',
    type: AssetType.Texture,
    priority: 'critical',
  },
});
