import { AssetType, defineAssets } from '@iwsdk/core';

export default defineAssets({
  gorillaTagMap: {
    url: '/gorilla-tag-map.glb',
    type: AssetType.GLTF,
    priority: 'critical',
  },
});
