import { getItemTexture, getRemoteItemTexture, getItemName, MISSING_TEXTURE } from './config.js';

// Local icons work offline; deployments without downloaded assets can use the public CDN.
export function setItemImage(image, category, itemId) {
    const sources = [...new Set([
        getItemTexture(category, itemId),
        getRemoteItemTexture(category, itemId),
        MISSING_TEXTURE
    ])];
    let index = 0;
    image.alt = getItemName(category, itemId);
    image.title = image.alt;
    image.dataset.category = category;
    image.dataset.itemId = itemId;
    image.onerror = () => {
        index++;
        if (index < sources.length) {
            image.src = sources[index];
        } else {
            image.onerror = null;
        }
    };
    image.src = sources[0];
}
