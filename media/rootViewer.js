(function () {
    const script = document.getElementById('root-viewer-script');
    const loading = document.getElementById('loading');
    const errorBox = document.getElementById('error');
    const vscode = acquireVsCodeApi();
    let timer;

    function showError(error) {
        loading.hidden = true;
        errorBox.hidden = false;
        errorBox.textContent = error instanceof Error ? error.message : String(error);
        console.error('[Celebi ROOT viewer]', error);
        vscode.postMessage({ type: 'rootDiagnostic', message: errorBox.textContent });
    }

    try {
        const jsroot = globalThis.JSROOT;
        if (!jsroot) throw new Error('The bundled JSROOT runtime could not be loaded.');
        // ROOT canvases are intentionally rendered on a white background,
        // independent of the VS Code color theme.
        jsroot.settings.DarkMode = false;
        jsroot.settings.Palette = 57;
        // Stable proxy URLs are safe to cache and avoid redundant header reads.
        jsroot.settings.UseStamp = false;

        const hierarchy = new jsroot.HierarchyPainter('ROOT File Hierarchy');
        hierarchy.no_select = true;
        hierarchy.show_overflow = true;
        hierarchy.prepareGuiDiv('hierarchy', 'tabs');
        const timeout = new Promise((_, reject) => { timer = setTimeout(() =>
            reject(new Error('Timed out while opening the ROOT file. The server may be slow or unavailable.')), 120000); });
        const open = async () => {
            await hierarchy.createBrowser('fix');
            const file = await jsroot.openFile(script.dataset.fileUri);
            hierarchy.h = hierarchy.fileHierarchy(file);
            hierarchy.h._isopen = true;
            await hierarchy.refreshHtml();
            hierarchy.initializeBrowser();
            vscode.postMessage({ type: 'rootDiagnostic', message: 'Loaded ROOT hierarchy: ' + file.fFileName });
        };
        Promise.race([open(), timeout]).then(() => {
            loading.hidden = true;
        }).catch(showError).finally(() => clearTimeout(timer));
    } catch (error) {
        showError(error);
    }
})();
