// bg-worker.js
const { removeBackground } = require('@imgly/background-removal-node');

process.on('message', async (message) => {
    try {
        const { bufferArray } = message;
        const uint8Array = new Uint8Array(bufferArray);
        const imageBlob = new Blob([uint8Array], { type: 'image/png' });

        const noBgBlob = await removeBackground(imageBlob, {
            output: { format: 'image/png' }
        });

        const resultBuffer = await noBgBlob.arrayBuffer();
        process.send({ success: true, bufferArray: Array.from(new Uint8Array(resultBuffer)) });
    } catch (error) {
        process.send({ success: false, error: error.message });
    }
});