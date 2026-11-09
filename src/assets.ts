import { AssetType, defineAssets } from '@iwsdk/core';

export default defineAssets({
  gorillaTagMap: {
    url: `${import.meta.env.BASE_URL}gorilla-tag-map.glb`,
    type: AssetType.GLTF,
    priority: 'critical',
  },
});
