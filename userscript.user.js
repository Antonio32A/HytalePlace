// ==UserScript==
// @name         r/place HypixelPlace Overlay
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  try to take over the canvas! Made by r/httyd
// @author       oralekin, exdeejay (xDJ_), 101arrowz, Antonio32A
// @match        https://hot-potato.reddit.com/embed*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @grant        GM_xmlhttpRequest
// @connect      githubusercontent.com
// ==/UserScript==
(() => {
    // OTHER MEMBERS OF R/PLACE:
    // Change the following URL to your own transparent PNG template.
    // Make sure the above @connect comment points to your domain.
    // Multiple copies of this script can be used at the same time.
    // The overlay should update live if you update the image on your server.
    const URL = "https://raw.githubusercontent.com/Antonio32A/HypixelPlace/main/overlay.png";

    const getData = async () => {
        const blob = new Blob([new Uint8Array(await new Promise(resolve =>
            GM_xmlhttpRequest({
                method: "GET",
                url: URL,
                responseType: "arraybuffer",
                headers: { "Cache-Control": "no-cache" },
                onload: response => resolve(response.response)
            })
        ))], { type: "image/png" });
        const dataURL = await new Promise(resolve => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.readAsDataURL(blob);
        });

        const tempImage = document.createElement("img");
        tempImage.src = dataURL;
        await new Promise(resolve => (tempImage.onload = resolve));

        const cnv = document.createElement("canvas");
        cnv.width = tempImage.width;
        cnv.height = tempImage.height;
        const tmpCtx = cnv.getContext("2d");
        tmpCtx.drawImage(tempImage, 0, 0);
        return tmpCtx.getImageData(0, 0, cnv.width, cnv.height);
    };

    const dither = (src) => {
        const dithered = new ImageData(src.width * 3, src.height * 3);
        for (let y = 0; y < src.height; ++y) {
            for (let x = 0; x < src.width; ++x) {
                const srcPx = (y * src.width + x) * 4;
                const tgtPx = ((y * 3 + 1) * dithered.width + (x * 3 + 1)) * 4;
                dithered.data[tgtPx] = src.data[srcPx];
                dithered.data[tgtPx + 1] = src.data[srcPx + 1];
                dithered.data[tgtPx + 2] = src.data[srcPx + 2];
                dithered.data[tgtPx + 3] = src.data[srcPx + 3];
            }
        }
        return dithered;
    };

    const getImage = async () => {
        const dithered = dither(await getData());
        const cnv = document.createElement("canvas");
        cnv.width = dithered.width;
        cnv.height = dithered.height;
        cnv.getContext("2d").putImageData(dithered, 0, 0);

        const blob = await new Promise(resolve => cnv.toBlob(resolve, "image/png"));
        const dataURL = await new Promise(resolve => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.readAsDataURL(blob);
        });

        const tempImage = document.createElement("img");
        tempImage.src = dataURL;
        await new Promise(resolve => (tempImage.onload = resolve));
        tempImage.style = "position: absolute;"
            + "left: 0;"
            + "top: 0;"
            + "image-rendering: pixelated;"
            + `width: ${tempImage.width / 3}px;`
            + `height: ${tempImage.height / 3}px;`;
        return tempImage;
    };

    let oldImage;

    const addImage = async () => {
        const newImage = await getImage();
        if (oldImage) {
            oldImage.remove();
        }

        document.getElementsByTagName("mona-lisa-embed")[0]
            .shadowRoot.children[0]
            .getElementsByTagName("mona-lisa-canvas")[0]
            .shadowRoot.children[0].appendChild(newImage);
    };

    if (window.top !== window.self) {
        window.addEventListener("load", () => {
            addImage();
            setInterval(addImage, 60 * 1000);
        }, false);
    }
})();