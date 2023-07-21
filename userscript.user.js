// ==UserScript==
// @name         r/place Hytale Overlay
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  r/place overlay with an autoplacer.
// @author       Antonio32A
// @credits      oralekin, exdeejay (xDJ_), 101arrowz
// @match        https://garlic-bread.reddit.com/embed*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=hytale.com
// @require      https://cdn.jsdelivr.net/npm/toastify-js
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @resource     TOASTIFY_STYLE https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// @connect      githubusercontent.com
// ==/UserScript==

const METADATA_URL = "https://raw.githubusercontent.com/Antonio32A/HytalePlace/main/metadata.json";

let metadata;
let overlay;
let imageData;

const COLORS = {
    0xFF4500: {
        name: "Red",
        index: 2
    },
    0xFFA800: {
        name: "Orange",
        index: 3
    },
    0xFFD635: {
        name: "Yellow",
        index: 4
    },
    0x00A368: {
        name: "Green",
        index: 6
    },
    0x3690EA: {
        name: "Blue",
        index: 13
    },
    0xB44AC0: {
        name: "Purple",
        index: 19
    },
    0x000000: {
        name: "Black",
        index: 27
    },
    0xFFFFFF: {
        name: "White",
        index: 31
    }
};

if (window.top !== window.self) {
    window.addEventListener("load", () => {
        // FIXME This is a hacky way to wait for the canvas to load
        const loadInterval = setInterval(() => {
            const canvas = getCanvasElement();
            if (canvas.width < 500) return;
            onReady();
            clearInterval(loadInterval);
        }, 100);
    }, false);
}

const onReady = async () => {
    GM_addStyle(GM_getResourceText("TOASTIFY_STYLE"));
    await update();
    setInterval(update, 60 * 1000);
    setInterval(attemptPlacingPixel, 3000);

    window.addEventListener("keypress", event => {
        if (event.key !== "p") return;
        toggleAutoplace();
    });
};

const toggleAutoplace = async () => {
    const newState = !(await GM_getValue("autoplace", false));
    await GM_setValue("autoplace", newState);
    showMessage("Autoplace is now " + (newState ? "enabled" : "disabled"), 2000);
};

const update = async () => {
    metadata = await fetchMetadata();
    const newImageData = await fetchImage();
    const newOverlay = await createImageElement(newImageData);
    if (overlay) {
        overlay.remove();
    }

    overlay = newOverlay;
    imageData = newImageData;
    getCanvasContainerElement().appendChild(overlay);
};

const attemptPlacingPixel = async () => {
    if (!(await GM_getValue("autoplace", false))) return;
    const mismatchedPixels = findMismatchedPixels(imageData);
    if (mismatchedPixels.length === 0) {
        showMessage("No mismatched pixels found!", 1000);
        return;
    }

    const nextTileAvailableIn = getStatusPillElement().nextTileAvailableIn;
    if (nextTileAvailableIn > 0) {
        showMessage("Next tile available in " + nextTileAvailableIn + " seconds", 1000);
        return;
    }

    const randomPixel = mismatchedPixels[Math.floor(Math.random() * mismatchedPixels.length)];
    const { x, y, targetColor } = randomPixel;
    showMessage(`Placing pixel at (${x}, ${y}), ${mismatchedPixels.length - 1} left`, 5000);

    // We could also call applyPosition here, but selectPixel seems to do some extra stuff such as request
    // the pixel history which is probably better to prevent bans.
    getCameraElement().selectPixel({ x, y });
    const colorPicker = getColorPickerElement();
    colorPicker.selectColor(targetColor.index);
    // It takes a bit for the pixel to actually apply, so we wait a bit before confirming
    await new Promise(resolve => setTimeout(resolve, 1500));
    colorPicker.confirmPixel();
};

const createImageElement = async image => {
    const dithered = applyDitherEffect(image);
    const canvas = getCanvasElement();
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width * 3;
    tempCanvas.height = canvas.height * 3;
    tempCanvas.getContext("2d").putImageData(dithered, metadata.x * 3, metadata.y * 3);

    const dataURL = tempCanvas.toDataURL();
    const imageElement = document.createElement("img");
    imageElement.src = dataURL;
    await blockUntilLoaded(imageElement);
    imageElement.style = "position: absolute;"
        + "left: 0;"
        + "top: 0;"
        + "image-rendering: pixelated;"
        + `width: ${canvas.width}px;`
        + `height: ${canvas.height}px;`;
    return imageElement;
};

const findMismatchedPixels = imageData => {
    const result = [];
    const ctx = getCanvasElement().getContext("2d");
    const currentCanvasImage = ctx.getImageData(metadata.x, metadata.y, imageData.width, imageData.height);
    for (let i = 0; i < currentCanvasImage.data.length; i += 4) {
        const targetAlpha = imageData.data[i + 3];
        if (targetAlpha !== 255) continue;

        const targetRed = imageData.data[i];
        const targetGreen = imageData.data[i + 1];
        const targetBlue = imageData.data[i + 2];
        const targetColor = COLORS[(targetRed << 16) + (targetGreen << 8) + targetBlue];

        const currentRed = currentCanvasImage.data[i];
        const currentGreen = currentCanvasImage.data[i + 1];
        const currentBlue = currentCanvasImage.data[i + 2];
        const currentColor = COLORS[(currentRed << 16) + (currentGreen << 8) + currentBlue];

        if (currentColor === targetColor) continue;
        const x = metadata.x + (i / 4) % imageData.width;
        const y = metadata.y + Math.floor(i / 4 / imageData.width);
        result.push({ x, y, targetColor, currentColor });
    }

    return result;
};

const getDataURL = blob => new Promise(resolve => {
    const fileReader = new FileReader();
    fileReader.onload = () => resolve(fileReader.result);
    fileReader.readAsDataURL(blob);
});

const blockUntilLoaded = image => new Promise(resolve => image.onload = resolve);

const fetchImage = async () => {
    const bytes = await new Promise(resolve =>
        GM_xmlhttpRequest({
            method: "GET",
            url: metadata.image,
            responseType: "arraybuffer",
            headers: { "Cache-Control": "no-cache" },
            onload: response => resolve(response.response)
        })
    );
    const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
    return await getBlobAsImageData(blob);
};

const fetchMetadata = async () => new Promise(resolve =>
    GM_xmlhttpRequest({
        method: "GET",
        url: METADATA_URL,
        responseType: "json",
        headers: { "Cache-Control": "no-cache" },
        onload: response => resolve(response.response)
    })
);

const getBlobAsImageData = async blob => {
    // This is a horribly inefficient solution to creating an ImageData object from a blob/image bytes,
    // but seems to be the only way to do it
    const dataURL = await getDataURL(blob);
    const tempImage = document.createElement("img");
    tempImage.src = dataURL;
    await blockUntilLoaded(tempImage);

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = tempImage.width;
    tempCanvas.height = tempImage.height;
    const tempContext = tempCanvas.getContext("2d");
    tempContext.drawImage(tempImage, 0, 0);
    return tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
};

const applyDitherEffect = imageData => {
    const newImageData = new ImageData(imageData.width * 3, imageData.height * 3);
    for (let y = 0; y < imageData.height; ++y) {
        for (let x = 0; x < imageData.width; ++x) {
            const sourcePixel = (y * imageData.width + x) * 4;
            const targetPixel = ((y * 3 + 1) * newImageData.width + (x * 3 + 1)) * 4;
            newImageData.data[targetPixel] = imageData.data[sourcePixel]; // red
            newImageData.data[targetPixel + 1] = imageData.data[sourcePixel + 1]; // green
            newImageData.data[targetPixel + 2] = imageData.data[sourcePixel + 2]; // blue
            newImageData.data[targetPixel + 3] = imageData.data[sourcePixel + 3]; // alpha
        }
    }

    return newImageData;
};

const showMessage = (message, duration) => Toastify({
    text: message,
    duration,
    gravity: "bottom",
    position: "right"
}).showToast();

const getCanvasElement = () => getCanvasContainerElement().children[0];

const getCanvasContainerElement = () =>
    getCameraElement().getElementsByTagName("garlic-bread-canvas")[0].shadowRoot.children[0];

const getColorPickerElement = () =>
    document.getElementsByTagName("garlic-bread-embed")[0]
        .shadowRoot.children[0]
        .getElementsByTagName("garlic-bread-color-picker")[0];

const getCameraElement = () =>
    getShareContainerElement().getElementsByTagName("garlic-bread-camera")[0];

const getStatusPillElement = () =>
    getShareContainerElement()
        .getElementsByClassName("bottom-controls")[0]
        .getElementsByTagName("garlic-bread-status-pill")[0];

const getShareContainerElement = () =>
    document.getElementsByTagName("garlic-bread-embed")[0]
        .shadowRoot.children[0]
        .getElementsByTagName("garlic-bread-share-container")[0];
