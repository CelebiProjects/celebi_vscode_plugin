(function () {
    // Validate transport responses before JSROOT receives a DataView. In
    // particular, remote-export can return HTTP 200 with the text NOTFOUND.
    globalThis.CelebiRootFileSource = class extends JSROOT.FileProxy {
        constructor(url) {
            super();
            this.url = url;
            this.size = 0;
            this.cached = null;
            this.controller = new AbortController();
        }

        getFileName() { return this.url; }
        getFileSize() { return this.size; }
        closeFile() {
            this.controller.abort();
            this.cached = null;
        }

        async openFile() {
            await this.readBuffer(0, 400);
            return true;
        }

        async readBuffer(start, length) {
            if (this.controller.signal.aborted) throw new Error('ROOT file reading was cancelled.');
            if (this.cached && start + length <= this.cached.byteLength) {
                return new DataView(this.cached, start, length);
            }
            const response = await fetch(this.url, {
                headers: { Range: `bytes=${start}-${start + length - 1}` },
                signal: this.controller.signal,
            });
            if (response.status !== 200 && response.status !== 206) {
                throw new Error(`Could not read the ROOT file (HTTP ${response.status}). Reopen the task results and try again.`);
            }
            const buffer = await response.arrayBuffer();
            const offset = response.status === 200 ? start : 0;
            if (start === 0 || response.status === 200) {
                const signature = new TextDecoder().decode(buffer.slice(0, 8));
                if (signature === 'NOTFOUND') {
                    throw new Error('The ROOT file is no longer available on the server or runner. Refresh the task results and check that the output file still exists.');
                }
                if (!signature.startsWith('root')) {
                    throw new Error('The server returned data that is not a ROOT file. Check that the output file is available.');
                }
            }
            if (buffer.byteLength < offset + length) {
                throw new Error(`Incomplete ROOT file response: needed bytes ${start}-${start + length - 1}, received ${buffer.byteLength} bytes.`);
            }
            if (response.status === 206) {
                const range = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(response.headers.get('Content-Range') || '');
                if (!range || Number(range[1]) !== start || Number(range[2]) !== start + buffer.byteLength - 1) {
                    throw new Error('The server returned an invalid byte range for the ROOT file.');
                }
                if (range[3] !== '*') this.size = Number(range[3]);
            } else {
                // Keep a full response so a server without range support is
                // downloaded only once, including later histogram reads.
                this.size = buffer.byteLength;
            }
            if (start === 0 || response.status === 200) this.cached = buffer;
            return new DataView(buffer, offset, length);
        }
    };
})();
