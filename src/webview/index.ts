/**
 * Celebi webview provider — public API.
 *
 * Delegates to the independent webview modules:
 * trace, ls (directory listing), readme (Markdown), and browser (embedded iframe).
 */
import { showTraceView } from './traceWebview';
import { showLsView } from './lsWebview';
import { showReadmeView } from './readmeWebview';
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

    /** Show a README webview with pre-rendered Markdown HTML. */
    async showReadmeView(title: string, htmlContent: string) {
        return showReadmeView(title, htmlContent);
    }

    /** Show a webview with an embedded <iframe> pointing to the given URL. */
    async showBrowser(objectName: string, url: string) {
        return showBrowser(objectName, url);
    }
}
