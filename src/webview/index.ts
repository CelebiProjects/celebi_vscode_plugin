import { showTraceView } from './traceWebview';
import { showLsView } from './lsWebview';
import { showBrowser } from './browserWebview';

export class CelebiWebviewProvider {
    async showTraceView(objectName?: string) {
        return showTraceView(objectName);
    }

    async showLsView(title: string, lsData: string) {
        return showLsView(title, lsData);
    }

    async showBrowser(objectName: string, url: string) {
        return showBrowser(objectName, url);
    }
}
