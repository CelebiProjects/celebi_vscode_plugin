/**
 * HTML template for the detail webview, mirroring celebi_ui's
 * DetailPanel.js + FilePreview.js sections:
 *   header (name + type badge) → impression select → impression id
 *   → README → Job Status → Predecessors → Successors → Object Info
 *   → Contents count → Results grid (+lightbox) | File info + preview
 */
import * as vscode from 'vscode';

export function getDetailHtml(webview: vscode.Webview, scriptUri: vscode.Uri): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} http: https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Celebi Detail</title>
<style>
    body {
        margin: 0; padding: 0.75rem 1rem;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
    }
    h2 { margin: 0; font-size: 1.15rem; display: flex; align-items: center; gap: 0.5rem; }
    h4 { margin: 0 0 0.4rem; text-transform: uppercase;
         letter-spacing: 0.03em; color: var(--vscode-descriptionForeground); }
    .detailHeader { display: flex; justify-content: space-between; align-items: center;
                    padding-bottom: 0.5rem; border-bottom: 1px solid var(--vscode-panel-border); }
    .typeLabel { font-size: 0.7rem; font-weight: 600; color: #fff; padding: 2px 8px;
                 border-radius: 10px; text-transform: capitalize; }
    .section { margin: 1rem 0; }
    .collapseHeader { cursor: pointer; user-select: none; }
    .collapseArrow { display: inline-block; width: 1rem; color: var(--vscode-descriptionForeground); }
    .readmeBox { border: 1px solid var(--vscode-panel-border); border-radius: 4px;
                 padding: 0.6rem 0.75rem; white-space: pre-wrap; }
    .statusBadge { display: inline-block; padding: 2px 10px; border-radius: 10px;
                   font-weight: 600; color: #fff; }
    .statusDone { background: #21ba45; }
    .statusFailed { background: #db2828; }
    .statusPending { background: #fbbd08; }
    .runnerBadge { display: inline-block; margin-left: 0.5rem; padding: 2px 8px;
                   border-radius: 10px; background: var(--vscode-badge-background);
                   color: var(--vscode-badge-foreground); }
    code { font-family: var(--vscode-editor-font-family); }
    .workflowId { margin-left: 0.5rem; }
    .statusDetails { margin-left: 0.5rem; color: var(--vscode-descriptionForeground); }
    .relationTag { display: inline-block; margin: 0.2rem 0.3rem 0 0; padding: 2px 8px;
                   border: 1px solid var(--vscode-panel-border); border-radius: 10px;
                   cursor: pointer; }
    .relationTag:hover { background: var(--vscode-list-hoverBackground); }
    .paramList { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
    .paramKey { color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); }
    .commandsPre { background: var(--vscode-textCodeBlock-background);
                   padding: 0.6rem 0.75rem; border-radius: 6px; overflow-x: auto;
                   font-family: var(--vscode-editor-font-family);
                   line-height: 1.6; margin: 0.25rem 0 0; white-space: pre-wrap; }
    .resultGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                  gap: 0.75rem; margin-top: 0.5rem; }
    .resultItem { display: flex; flex-direction: column; gap: 0.25rem; position: relative; }
    .resultStatusIcon { position: absolute; top: 0.25rem; right: 0.25rem; z-index: 1;
                        min-width: 1.1rem; height: 1.1rem; line-height: 1.1rem;
                        text-align: center; border-radius: 3px; padding: 0 0.15rem;
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground); }
    .resultStatusIcon.inYuki { background: rgba(33, 186, 69, 0.18); color: #21ba45; }
    .resultStatusIcon.notYuki { background: rgba(251, 189, 8, 0.18); color: #b58900; }
    .resultImage { width: 100%; cursor: zoom-in; border: 1px solid var(--vscode-panel-border);
                   border-radius: 4px; }
    .resultFile { display: flex; align-items: center; gap: 0.4rem; }
    .resultFileLink { color: var(--vscode-textLink-foreground); text-decoration: none;
                      word-break: break-all; }
    .imagePreview { max-width: 100%; }
    .codePreview { background: var(--vscode-textCodeBlock-background); padding: 0.6rem 0.75rem;
                   border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
    .unsupported { color: var(--vscode-descriptionForeground); font-style: italic; }
    .emptyState { text-align: center; margin-top: 3rem; color: var(--vscode-descriptionForeground); }
    #lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999;
                display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
    #lightbox[hidden] { display: none; }
    #lightbox img { max-width: 90vw; max-height: 90vh; object-fit: contain; }
</style>
</head>
<body>
<div id="emptyState" class="emptyState"><p>Select a node from the tree to explore</p></div>

<div id="detail" hidden>
  <div class="detailHeader">
    <h2><span id="nodeName"></span><span id="typeLabel" class="typeLabel"></span></h2>
    <select id="impressionSelect" hidden></select>
  </div>

  <div class="section" id="impressionIdSection" hidden>
    <h4>Impression ID</h4>
    <code id="impressionId" class="impressionId"></code>
  </div>

  <div class="section" id="readmeSection" hidden>
    <h4 class="collapseHeader"><span class="collapseArrow" id="readmeArrow">▾</span> README</h4>
    <div id="readmeBox" class="readmeBox"></div>
  </div>

  <div class="section" id="statusSection" hidden>
    <h4>Job Status</h4>
    <div class="statusRow">
      <span id="statusBadge" class="statusBadge"></span>
      <span id="runnerBadge" class="runnerBadge" hidden></span>
      <code id="workflowId" class="workflowId"></code>
      <span id="statusDetails" class="statusDetails"></span>
    </div>
  </div>

  <div class="section" id="predecessorsSection" hidden>
    <h4 class="collapseHeader"><span class="collapseArrow" id="predecessorsArrow">▾</span> <span id="predecessorsTitle">Predecessors</span></h4>
    <div id="predecessorsBox"></div>
  </div>

  <div class="section" id="successorsSection" hidden>
    <h4 class="collapseHeader"><span class="collapseArrow" id="successorsArrow">▾</span> <span id="successorsTitle">Successors</span></h4>
    <div id="successorsBox"></div>
  </div>

  <div class="section" id="objectInfoSection" hidden>
    <h4>Object Info</h4>
    <div id="paramList" class="paramList"></div>
    <div id="infoRows"></div>
    <div id="codeFilesBox"></div>
    <div id="commandsBox"></div>
  </div>

  <div class="section" id="contentsSection" hidden>
    <h4>Contents</h4>
    <p id="contentsCount"></p>
  </div>

  <div class="section" id="resultsSection" hidden>
    <h4>Results</h4>
    <div id="resultsStatus"></div>
    <div id="resultGrid" class="resultGrid"></div>
  </div>

  <div class="section" id="fileInfoSection" hidden>
    <h4>File Info</h4>
    <div id="fileInfoRows"></div>
  </div>

  <div class="section" id="previewSection" hidden>
    <h4>Preview</h4>
    <div id="previewBox"></div>
  </div>
</div>

<div id="lightbox" hidden><img id="lightboxImg" alt=""></div>

<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
