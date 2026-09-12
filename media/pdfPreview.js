(function () {
    const base = new URL('vendor/pdfjs/', document.currentScript.src).href;
    let library;
    let generation = 0;
    let activeTask;

    window.clearPdfPreviews = function () {
        generation++;
        if (activeTask) void activeTask.destroy().catch(() => {});
        activeTask = undefined;
    };

    window.renderPdfPreviews = async function (container) {
        const version = generation;
        // Render sequentially to bound memory when a task has many PDF plots.
        for (const card of container.querySelectorAll('.pdfPlot')) {
            if (version !== generation) return;
            const status = card.querySelector('.pdfStatus');
            let task;
            try {
                library ||= import(base + 'pdf.mjs').then(pdfjs => {
                    pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.mjs';
                    return pdfjs;
                });
                const pdfjs = await library;
                if (version !== generation) return;
                task = pdfjs.getDocument({
                    url: card.dataset.previewUrl,
                    cMapUrl: base + 'cmaps/', cMapPacked: true,
                    standardFontDataUrl: base + 'standard_fonts/',
                    isEvalSupported: false, useWasm: false,
                });
                activeTask = task;
                const pdf = await task.promise;
                const page = await pdf.getPage(1);
                const size = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: 1600 / Math.max(size.width, size.height) });
                const canvas = document.createElement('canvas');
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                if (version !== generation || !card.isConnected) return;
                const image = card.querySelector('img');
                image.src = canvas.toDataURL('image/png');
                image.dataset.url = image.src;
                image.hidden = false;
                status.textContent = pdf.numPages > 1 ? 'Page 1 of ' + pdf.numPages : '';
            } catch (error) {
                if (version === generation && card.isConnected) {
                    status.textContent = 'PDF preview unavailable. Open the PDF below.';
                    status.title = String(error.message || error);
                }
            } finally {
                if (task) await task.destroy().catch(() => {});
                if (activeTask === task) activeTask = undefined;
            }
        }
    };
})();
