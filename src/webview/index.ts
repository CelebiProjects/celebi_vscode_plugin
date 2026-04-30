/**
 * Celebi webview provider — public API.
 *
 * Delegates to the three independent webview modules:
 * trace, ls (directory listing), and browser (embedded iframe).
 */
import { showTraceView } from './traceWebview';
import { showLsView } from './lsWebview';
import { showBrowser } from './browserWebview';

export class CelebiWebviewProvider {
    /** Show a tree visualization webview for the given object. */
    async showTraceView(objectName?: string) {
        return showTraceView(objectName);
    }

    /** Show a directory listing (ls) webview. */
    async showLsView(title: string, lsData: string) {
        return showLsView(title, lsData);
    }

    /** Show a webview with an embedded <iframe> pointing to the given URL. */
    async showBrowser(objectName: string, url: string) {
        return showBrowser(objectName, url);
    }
}
