# Celebi 插件精简改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Celebi VS Code 扩展精简为纯查看器：原生树显示 repository（对象+文件合并），详情 webview 显示对象详情与 impression 结果，数据流对齐 celebi_ui。

**Architecture:** 树数据由一次性 Python 脚本产出（镜像 celebi_ui `electron/ipc/filesystem.js`），TS 侧照抄 celebi_ui 的 `celebi-fs.js` 构建/合并树；结果经 `YukiClient`（Node fetch）直连 DITE HTTP API；单一详情 webview 镜像 celebi_ui 的 DetailPanel + FilePreview；所有命令/模块除树与详情外全部删除。

**Tech Stack:** TypeScript (ES2020, CommonJS, strict)、VS Code Extension API、ts-jest、Node global fetch。

**Spec:** `docs/superpowers/specs/2026-08-16-celebi-plugin-lean-repository-results-design.md`

## Global Constraints

- 分支：`feat/repository-results`；提交信息用 conventional commits，并以 `Co-Authored-By: Claude <noreply@anthropic.com>` 结尾
- tsconfig：`strict`、target ES2020、module commonjs、`"types": ["node", "vscode"]`、`src/test` 从主编译排除
- 编译验证：`npm run compile`（先经 `scripts/build-package.js` 从 `scripts/package/*.json` 重新生成 package.json，再做 `tsc -p .`）
- 单测：`npx jest`（Task 8 起可用 `npm test`）；jest 运行于 node 环境，**测试不得 import `vscode`**
- 树排除规则：隐藏文件/目录（`.` 开头）、`dot_` 前缀、`impression_data/`、`~undo-tree~` 后缀
- yuki 请求超时 10s；baseUrl 优先级：`.celebi/hosts.json` serverurl → `celebi.diteServerUrl` → `http://127.0.0.1:3315`
- 所有镜像自 celebi_ui 的常量/行为必须逐字对齐：扩展名列表（IMAGE/CODE/TEXT）、图标颜色映射、状态徽章配色、结果排序（plot 在前）
- 每个任务结束时 `npm run compile`（Task 8 前）或对应验证命令必须通过，且每一步之间编译不能断

---

## File Structure

**Create:**
- `src/tree/treeBuilder.ts` — 纯 TS 移植 celebi_ui `celebi-fs.js`：`buildObjectTree`/`mergeFilesIntoTree`/`buildTypeMap`/`findNodeByPath`/`findParent` + `TreeNode`/`ObjectRecord`/`FileRecord` 类型
- `src/yuki/client.ts` — DITE HTTP 客户端（可注入 fetch），镜像 `yuki-api.js` 的结果相关方法
- `src/celebiScript.ts` — 内嵌镜像自 celebi_ui 的一次性 Python 脚本 + 解释器解析 + `runCelebiPython`
- `src/projectMeta.ts` — 读 `.celebi/config.json`（project_uuid）、`.celebi/hosts.json`（serverurl）、对象 `.celebi/config(.local).json`、工作区文件预览读取
- `src/webview/detailMessages.ts` — webview 消息协议类型 + 编解码纯函数
- `src/webview/detailHtml.ts` — 详情 webview 的 HTML/CSS/JS 模板（镜像 DetailPanel + FilePreview）
- `src/webview/detailWebview.ts` — 单例 webview panel provider
- `src/test/treeBuilder.test.ts`、`src/test/yukiClient.test.ts`、`src/test/celebiScript.test.ts`、`src/test/projectMeta.test.ts`、`src/test/detailMessages.test.ts`、`src/test/detailHtml.test.ts`、`src/test/treeItem.test.ts`

**Modify:**
- `src/treeItem.ts` — 重写为新节点模型（kind: object/directory/file + celebiType + node.data）+ 纯函数 `iconFor`
- `src/tree/treeProvider.ts` — 重写：脚本 + treeBuilder 全量建树
- `src/webview/baseWebview.ts` — 只保留 `escapeHtml`，删 `getErrorHtml`
- `src/extension.ts` — 重写激活逻辑（树 + 详情 webview + refreshTree + watcher）
- `jest.config.js` — ts-jest tsconfig 覆盖，补 jest 类型
- `scripts/package/base.json`、`commands.json`、`menus.json`、`configuration.json`、`views.json` — 精简

**Delete（Task 9 一次清扫）:**
- `src/message/messageHtml.ts`、`src/message/messagePanel.ts`、`src/message/messageStore.ts`
- `src/webview/lsWebview.ts`、`src/webview/traceWebview.ts`、`src/webview/browserWebview.ts`、`src/webview/readmeWebview.ts`、`src/webview/index.ts`、`src/webview/baseWebview.ts`（重写后无任何引用）
- `src/tree/objectActions.ts`、`src/tree/parser.ts`
- `src/commands/`（目录整体）
- `src/formatOutput.ts`、`src/pythonRunner.ts`
- `src/test/messagePanel.test.ts`

---

### Task 1: Tree builder 纯函数模块

**Files:**
- Create: `src/tree/treeBuilder.ts`
- Create: `src/test/treeBuilder.test.ts`
- Modify: `jest.config.js`

**Interfaces:**
- Consumes: 无（第一个任务）
- Produces（后续任务依赖的精确签名）:
```ts
export type CelebiType = 'task' | 'algorithm' | 'data' | 'directory';
export type NodeKind = 'directory' | 'object' | 'file';
export interface TreeNode {
    id: string;
    name: string;
    type: NodeKind;
    icon: string;
    iconColor: string;
    celebiType: CelebiType | null;
    data: Record<string, unknown>;
    children: TreeNode[];
}
export interface ObjectRecord { path: string; type: string; [key: string]: unknown }
export interface FileRecord { name: string; size?: { raw?: number; human_readable?: string }; lastModified?: string; absolutePath?: string }
export function buildObjectTree(objects: ObjectRecord[]): TreeNode
export function mergeFilesIntoTree(root: TreeNode, files: FileRecord[]): void
export function buildTypeMap(node: TreeNode, map?: Record<string, string>): Record<string, string>
export function findNodeByPath(node: TreeNode, targetPath: string): TreeNode | null
export function findParent(node: TreeNode, targetId: string, parent?: TreeNode | null): TreeNode | null
```

- [ ] **Step 1: 修改 jest.config.js，允许 jest 测试使用 jest 全局类型**

```js
/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { types: ["node", "jest"] } }],
  },
};
```

- [ ] **Step 2: 写失败测试** `src/test/treeBuilder.test.ts`（移植并扩充 celebi_ui 的 `celebi-fs.test.js`）

```ts
import {
    buildObjectTree, mergeFilesIntoTree, buildTypeMap, findNodeByPath, findParent,
    TreeNode,
} from '../tree/treeBuilder';

const sampleObjects = [
    { path: 'tasks/analysis_1', type: 'task', environment: 'python3' },
    { path: 'algorithms/reco', type: 'algorithm' },
    { path: 'data/input', type: 'data' },
];

const sampleFiles = [
    { name: 'tasks/analysis_1/script.py', size: { raw: 1024, human_readable: '1 KB' }, lastModified: '2026-01-01T00:00:00Z' },
    { name: 'tasks/analysis_1/output.root', size: { raw: 2048, human_readable: '2 KB' }, lastModified: '2026-01-01T00:00:00Z' },
    { name: 'impression_data/tasks/analysis_1/plot.png', size: { raw: 10 }, lastModified: null },
    { name: '.hidden', size: { raw: 0, human_readable: '0 B' }, lastModified: null },
];

describe('buildObjectTree', () => {
    test('creates root node', () => {
        const tree = buildObjectTree(sampleObjects);
        expect(tree.id).toBe('__root__');
        expect(tree.type).toBe('directory');
    });

    test('creates directory hierarchy', () => {
        const tree = buildObjectTree(sampleObjects);
        const tasks = tree.children.find((c) => c.name === 'tasks');
        expect(tasks).toBeDefined();
        expect(tasks!.type).toBe('directory');
    });

    test('creates object nodes with correct types and icons', () => {
        const tree = buildObjectTree(sampleObjects);
        const tasks = tree.children.find((c) => c.name === 'tasks')!;
        const analysis = tasks.children.find((c) => c.name === 'analysis_1')!;
        expect(analysis.type).toBe('object');
        expect(analysis.celebiType).toBe('task');
        expect(analysis.icon).toBe('cog');
        expect(analysis.iconColor).toBe('orange');
    });

    test('sorts directories before other nodes', () => {
        const tree = buildObjectTree(sampleObjects);
        const types = tree.children.map((c) => c.type);
        expect(types.indexOf('directory')).toBeLessThan(types.indexOf('object'));
    });
});

describe('mergeFilesIntoTree', () => {
    test('merges files into matching object nodes via suffix matching', () => {
        const tree = buildObjectTree(sampleObjects);
        mergeFilesIntoTree(tree, sampleFiles);
        const tasks = tree.children.find((c) => c.name === 'tasks')!;
        const analysis = tasks.children.find((c) => c.name === 'analysis_1')!;
        const fileNames = analysis.children.filter((c) => c.type === 'file').map((c) => c.name);
        expect(fileNames).toContain('script.py');
        expect(fileNames).toContain('output.root');
    });

    test('skips hidden files and impression_data', () => {
        const tree = buildObjectTree([]);
        mergeFilesIntoTree(tree, sampleFiles);
        const hidden = tree.children.find((c) => c.name === '.hidden');
        expect(hidden).toBeUndefined();
        const impression = tree.children.find((c) => c.name === 'impression_data');
        expect(impression).toBeUndefined();
    });

    test('does not duplicate an existing file', () => {
        const tree = buildObjectTree([]);
        mergeFilesIntoTree(tree, [sampleFiles[0]]);
        mergeFilesIntoTree(tree, [sampleFiles[0]]);
        const all: string[] = [];
        const walk = (n: TreeNode) => { all.push(n.id); n.children.forEach(walk); };
        walk(tree);
        expect(all.filter((id) => id === 'tasks/analysis_1/script.py')).toHaveLength(1);
    });
});

describe('buildTypeMap / findNodeByPath / findParent', () => {
    const tree = buildObjectTree(sampleObjects);
    mergeFilesIntoTree(tree, sampleFiles);

    test('buildTypeMap maps ids to celebi types', () => {
        const map = buildTypeMap(tree);
        expect(map['tasks/analysis_1']).toBe('task');
        expect(map['algorithms/reco']).toBe('algorithm');
        expect(map['tasks']).toBeUndefined();
    });

    test('findNodeByPath returns node for object id', () => {
        expect(findNodeByPath(tree, 'tasks/analysis_1')?.name).toBe('analysis_1');
        expect(findNodeByPath(tree, 'nope')).toBeNull();
    });

    test('findParent returns the parent node', () => {
        const analysis = findNodeByPath(tree, 'tasks/analysis_1')!;
        expect(findParent(tree, 'tasks/analysis_1')?.id).toBe('tasks');
        expect(findParent(tree, 'tasks')?.id).toBe('__root__');
        expect(findParent(tree, '__root__')).toBeNull();
        expect(analysis).toBeDefined();
    });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx jest src/test/treeBuilder.test.ts`
Expected: FAIL — "Cannot find module '../tree/treeBuilder'"

- [ ] **Step 4: 实现** `src/tree/treeBuilder.ts`（逐字移植 celebi_ui `celebi-fs.js`，加 buildTypeMap 支持可选 map 参数）

```ts
/**
 * Pure tree-building utilities, ported 1:1 from celebi_ui src/adapters/celebi-fs.js.
 *
 * buildObjectTree turns Celebi object records into a nested tree;
 * mergeFilesIntoTree attaches workspace files to matching object/directory
 * nodes by path-suffix matching.
 */

/** Celebi object types used for icon/colour selection. */
export type CelebiType = 'task' | 'algorithm' | 'data' | 'directory';

/** Structural node kind: plain directory, Celebi object, or workspace file. */
export type NodeKind = 'directory' | 'object' | 'file';

export interface TreeNode {
    id: string;
    name: string;
    type: NodeKind;
    icon: string;
    iconColor: string;
    celebiType: CelebiType | null;
    data: Record<string, unknown>;
    children: TreeNode[];
}

/** One record from the Python `sub_objects_recursively` scan. */
export interface ObjectRecord {
    path: string;
    type: string;
    [key: string]: unknown;
}

/** One record from the Python `os.walk` file scan. */
export interface FileRecord {
    name: string;
    size?: { raw?: number; human_readable?: string };
    lastModified?: string;
    absolutePath?: string;
}

function getCelebiTypeStyle(type: string): { icon: string; iconColor: string } {
    switch (type) {
        case 'task':
            return { icon: 'cog', iconColor: 'orange' };
        case 'algorithm':
            return { icon: 'calculator', iconColor: 'blue' };
        case 'data':
            return { icon: 'database', iconColor: 'green' };
        default:
            return { icon: 'folder', iconColor: 'yellow' };
    }
}

function sortNodes(node: TreeNode): void {
    node.children.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
    });
    for (const child of node.children) {
        if (child.type === 'directory' || child.children.length > 0) {
            sortNodes(child);
        }
    }
}

/** Build a tree from Celebi object records. */
export function buildObjectTree(objects: ObjectRecord[]): TreeNode {
    const root: TreeNode = {
        id: '__root__',
        name: '.',
        type: 'directory',
        icon: 'folder open',
        iconColor: 'yellow',
        data: {},
        children: [],
    };

    if (!objects || !Array.isArray(objects)) return root;

    const sorted = [...objects].sort((a, b) => {
        const depthA = a.path.split('/').length;
        const depthB = b.path.split('/').length;
        return depthA - depthB;
    });

    for (const obj of sorted) {
        const parts = obj.path.split('/');
        let current = root;
        let pathSoFar = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
            const isLast = i === parts.length - 1;

            if (isLast) {
                const style = getCelebiTypeStyle(obj.type);
                current.children.push({
                    id: obj.path,
                    name: part,
                    type: 'object',
                    icon: style.icon,
                    iconColor: style.iconColor,
                    celebiType: (obj.type || null) as CelebiType | null,
                    data: obj,
                    children: [],
                });
            } else {
                let dir = current.children.find(
                    (c) => (c.type === 'directory' || c.type === 'object') && c.name === part
                );
                if (!dir) {
                    dir = {
                        id: pathSoFar,
                        name: part,
                        type: 'directory',
                        icon: 'folder',
                        iconColor: 'yellow',
                        celebiType: null,
                        data: {},
                        children: [],
                    };
                    current.children.push(dir);
                }
                current = dir;
            }
        }
    }

    sortNodes(root);
    return root;
}

/**
 * Merge workspace files into the object tree.
 * Files are placed under their matching object/directory by suffix-matching.
 */
export function mergeFilesIntoTree(root: TreeNode, files: FileRecord[]): void {
    if (!files || !Array.isArray(files)) return;

    const nodeMap = new Map<string, TreeNode>();
    walkMap(root);

    function walkMap(node: TreeNode): void {
        nodeMap.set(node.id, node);
        for (const child of node.children || []) walkMap(child);
    }

    for (const file of files) {
        if (file.name.startsWith('impression_data/')) continue;

        const parts = file.name.split('/');
        if (parts[parts.length - 1].startsWith('.')) continue;
        if (parts.some((p) => p.startsWith('dot_'))) continue;

        const dirParts = parts.slice(0, -1);
        let matchedNode: TreeNode | null = null;
        for (let i = 0; i < dirParts.length; i++) {
            const suffixPath = dirParts.slice(i).join('/');
            if (nodeMap.has(suffixPath)) {
                matchedNode = nodeMap.get(suffixPath)!;
                break;
            }
        }

        let current = matchedNode || root;
        let startIdx = 0;
        if (matchedNode) {
            const matchedParts = matchedNode.id === '__root__' ? [] : matchedNode.id.split('/');
            startIdx = matchedParts.length;
        }

        let pathSoFar = current.id === '__root__' ? '' : current.id;
        for (let i = startIdx; i < parts.length; i++) {
            const part = parts[i];
            pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
            const isLast = i === parts.length - 1;

            if (isLast) {
                const alreadyExists = current.children.some(
                    (c) => c.type === 'file' && c.name === part
                );
                if (!alreadyExists) {
                    current.children.push({
                        id: file.name,
                        name: part,
                        type: 'file',
                        icon: 'file outline',
                        iconColor: 'grey',
                        data: file as unknown as Record<string, unknown>,
                        children: [],
                    });
                }
            } else {
                let dir = current.children.find(
                    (c) => (c.type === 'directory' || c.type === 'object') && c.name === part
                );
                if (!dir) {
                    dir = {
                        id: pathSoFar,
                        name: part,
                        type: 'directory',
                        icon: 'folder',
                        iconColor: 'yellow',
                        celebiType: null,
                        data: {},
                        children: [],
                    };
                    current.children.push(dir);
                }
                current = dir;
            }
        }
    }

    sortNodes(root);
}

/** Find a tree node by its path/id (exact match only). */
export function findNodeByPath(node: TreeNode, targetPath: string): TreeNode | null {
    if (node.id === targetPath) return node;
    for (const child of node.children || []) {
        const found = findNodeByPath(child, targetPath);
        if (found) return found;
    }
    return null;
}

/** Find the parent of a node in the tree. */
export function findParent(node: TreeNode, targetId: string, parent: TreeNode | null = null): TreeNode | null {
    if (node.id === targetId) return parent;
    for (const child of node.children || []) {
        const found = findParent(child, targetId, node);
        if (found) return found;
    }
    return null;
}

/** Build a map of id -> celebiType from the tree. */
export function buildTypeMap(node: TreeNode, map: Record<string, string> = {}): Record<string, string> {
    if (node.celebiType) {
        map[node.id] = node.celebiType;
    }
    for (const child of node.children || []) {
        buildTypeMap(child, map);
    }
    return map;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx jest src/test/treeBuilder.test.ts`
Expected: PASS（全部 10 个用例）

- [ ] **Step 6: 编译 + 提交**

Run: `npm run compile`
Expected: 无错误

```bash
git add jest.config.js src/tree/treeBuilder.ts src/test/treeBuilder.test.ts
git commit -m "feat: add tree builder ported from celebi_ui celebi-fs

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Yuki HTTP 客户端

**Files:**
- Create: `src/yuki/client.ts`
- Create: `src/test/yukiClient.test.ts`

**Interfaces:**
- Consumes: 无（fetch 经构造函数注入）
- Produces（后续任务依赖的精确签名）:
```ts
export interface ImpressionFile {
    name: string;
    path: string;
    type: string;
    is_plot: boolean;
    is_image: boolean;
    url: string;
    project_uuid: string;
    impression: string;
}
export interface ImpressionStatus { status: string; details: string }
export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;
export interface FetchInit { method?: string; headers?: Record<string, string>; signal?: AbortSignal }
export interface FetchResponse { status: number; json(): Promise<unknown>; text(): Promise<string> }
export function normalizeBaseUrl(url: string): string
export class YukiClient {
    constructor(baseUrl: string, fetchImpl?: FetchLike)
    updateBaseUrl(url: string): void
    get baseUrl(): string
    fetchImpressionResults(projectUuid: string, impression: string, kind?: string): Promise<ImpressionFile[]>
    fetchImpressionStatus(projectUuid: string, impression: string): Promise<ImpressionStatus>
    fetchImpressionWorkflow(projectUuid: string, impression: string): Promise<string>
}
```

- [ ] **Step 1: 写失败测试** `src/test/yukiClient.test.ts`

```ts
import { YukiClient, normalizeBaseUrl, ImpressionFile } from '../yuki/client';

function jsonResponse(body: unknown, status = 200) {
    return {
        status,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    };
}

describe('normalizeBaseUrl', () => {
    test('keeps http(s) URLs and trims trailing slashes', () => {
        expect(normalizeBaseUrl('http://127.0.0.1:3315/')).toBe('http://127.0.0.1:3315');
        expect(normalizeBaseUrl('https://dite.example.com')).toBe('https://dite.example.com');
    });
    test('prepends http:// for bare host:port', () => {
        expect(normalizeBaseUrl('127.0.0.1:3315')).toBe('http://127.0.0.1:3315');
    });
    test('falls back to default for empty input', () => {
        expect(normalizeBaseUrl('')).toBe('http://127.0.0.1:3315');
    });
});

describe('YukiClient.fetchImpressionResults', () => {
    test('hits /file-status and normalizes plot files with /export fallback URLs', async () => {
        const calls: string[] = [];
        const fetchImpl = (url: string) => {
            calls.push(url);
            if (url.includes('/collect/')) return Promise.resolve(jsonResponse(null));
            return Promise.resolve(jsonResponse([
                { name: 'plot.png', path: 'figs/plot.png', is_plot: true },
                { name: 'out.root', path: 'out.root' },
            ]));
        };
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        const items = await client.fetchImpressionResults('proj-uuid', 'impr-1');
        expect(calls[0]).toBe('http://127.0.0.1:3315/collect/proj-uuid/impr-1');
        expect(calls[1]).toBe('http://127.0.0.1:3315/file-status/proj-uuid/impr-1/none?kind=stageout');
        expect(items).toHaveLength(2);
        expect(items[0].name).toBe('plot.png');
        expect(items[0].is_plot).toBe(true);
        expect(items[0].url).toBe('http://127.0.0.1:3315/export/proj-uuid/impr-1/figs/plot.png');
        expect(items[1].is_plot).toBe(false);
    });

    test('plots are sorted before other files', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse([
            { name: 'b.root' },
            { name: 'a.png' },
        ]));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        const items = await client.fetchImpressionResults('p', 'i');
        expect(items.map((f) => f.name)).toEqual(['a.png', 'b.root']);
    });

    test('coerces {items}/{files}/{impression_data} response shapes', async () => {
        for (const shape of [
            { items: [{ name: 'x.root' }] },
            { files: [{ name: 'x.root' }] },
            { impression_data: [{ name: 'x.root' }] },
        ]) {
            const fetchImpl = () => Promise.resolve(jsonResponse(shape));
            const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
            const items = await client.fetchImpressionResults('p', 'i');
            expect(items).toHaveLength(1);
            expect(items[0].name).toBe('x.root');
        }
    });

    test('returns [] when the server errors', async () => {
        const fetchImpl = () => Promise.reject(new Error('ECONNREFUSED'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchImpressionResults('p', 'i')).toEqual([]);
    });
});

describe('YukiClient status and workflow', () => {
    test('fetchImpressionStatus handles JSON with status_legacy', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse({ status_legacy: 'finished', details: 'all good' }));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchImpressionStatus('p', 'i')).toEqual({ status: 'finished', details: 'all good' });
    });

    test('fetchImpressionStatus handles plain string responses', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse('running'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchImpressionStatus('p', 'i')).toEqual({ status: 'running', details: '' });
    });

    test('fetchImpressionStatus returns empty on error', async () => {
        const fetchImpl = () => Promise.reject(new Error('down'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchImpressionStatus('p', 'i')).toEqual({ status: '', details: '' });
    });

    test('fetchImpressionWorkflow trims plain text', async () => {
        const fetchImpl = () => Promise.resolve(jsonResponse('machine1 wf-42\n'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchImpressionWorkflow('p', 'i')).toBe('machine1 wf-42');
    });

    test('fetchImpressionWorkflow returns empty on error', async () => {
        const fetchImpl = () => Promise.reject(new Error('down'));
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        expect(await client.fetchImpressionWorkflow('p', 'i')).toBe('');
    });
});

describe('YukiClient timeout', () => {
    test('aborts after 10s', async () => {
        jest.useFakeTimers();
        const fetchImpl = (_url: string, init?: { signal?: AbortSignal }) =>
            new Promise((_, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            });
        const client = new YukiClient('http://127.0.0.1:3315', fetchImpl as never);
        const promise = client.fetchImpressionStatus('p', 'i');
        jest.advanceTimersByTime(10_001);
        expect(await promise).toEqual({ status: '', details: '' });
        jest.useRealTimers();
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest src/test/yukiClient.test.ts`
Expected: FAIL — "Cannot find module '../yuki/client'"

- [ ] **Step 3: 实现** `src/yuki/client.ts`（镜像 `yuki-api.js` 的结果方法；fetch 可注入便于测试）

```ts
/**
 * DITE/yuki HTTP client, ported from celebi_ui src/adapters/yuki-api.js.
 * Only the impression-result methods are kept (no runner/workflow management).
 *
 * The transport is injectable so tests can substitute a stub; the real
 * implementation delegates to Node's global fetch.
 */
const DEFAULT_TIMEOUT = 10000;

/** Minimal fetch signature we rely on (kept loose to avoid @types/node fetch variance). */
export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;
export interface FetchInit {
    method?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
}
export interface FetchResponse {
    status: number;
    json(): Promise<unknown>;
    text(): Promise<string>;
}

export interface ImpressionFile {
    name: string;
    path: string;
    type: string;
    is_plot: boolean;
    is_image: boolean;
    url: string;
    project_uuid: string;
    impression: string;
}

export interface ImpressionStatus {
    status: string;
    details: string;
}

export function normalizeBaseUrl(url: string): string {
    const trimmed = (url || '').trim().replace(/\/+$/, '');
    if (!trimmed) return 'http://127.0.0.1:3315';
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed;
    return `http://${trimmed}`;
}

function looksLikeImage(name = ''): boolean {
    return /\.(png|jpe?g|gif|bmp|webp|svg|avif)$/i.test(name);
}

function coerceArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.files)) return v.files;
    if (Array.isArray(v.impression_data)) return v.impression_data;
    return [];
}

function encodePath(path: string): string {
    return String(path || '')
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/');
}

/** Build the /export preview URL for an impression file. */
export function buildFileUrl(baseUrl: string, projectUuid: string, impression: string, filePath: string): string {
    const base = baseUrl.replace(/\/+$/, '');
    return `${base}/export/${encodePath(projectUuid)}/${encodePath(impression)}/${encodePath(filePath)}`;
}

export class YukiClient {
    private _baseUrl: string;
    private readonly fetchImpl: FetchLike;

    constructor(baseUrl: string, fetchImpl?: FetchLike) {
        this._baseUrl = normalizeBaseUrl(baseUrl);
        this.fetchImpl = fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    }

    get baseUrl(): string {
        return this._baseUrl;
    }

    updateBaseUrl(url: string): void {
        this._baseUrl = normalizeBaseUrl(url);
    }

    private async request(method: 'get' | 'post', path: string): Promise<unknown> {
        const url = `${this._baseUrl}${path}`;
        // 10s timeout applies to injected transports too (keeps tests honest)
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
        try {
            const response = await this.fetchImpl(url, { method, signal: controller.signal });
            if (method === 'get') {
                const text = await response.text();
                try {
                    return JSON.parse(text);
                } catch {
                    return text;
                }
            }
            return response;
        } finally {
            clearTimeout(timer);
        }
    }

    /** Fetch result files for an impression (plots first, then by name). */
    async fetchImpressionResults(projectUuid: string, impression: string, kind = 'stageout'): Promise<ImpressionFile[]> {
        try {
            await this.request('get', `/collect/${encodePath(projectUuid)}/${encodePath(impression)}`).catch(() => null);
            const data = await this.request('get', `/file-status/${encodePath(projectUuid)}/${encodePath(impression)}/none?kind=${kind}`);
            const items = coerceArray(data)
                .map((entry) => this.normalizeImpressionFile(entry, projectUuid, impression))
                .filter((x): x is ImpressionFile => x !== null)
                .sort((a, b) => {
                    if (Boolean(a.is_plot) !== Boolean(b.is_plot)) return a.is_plot ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
            return items;
        } catch {
            return [];
        }
    }

    private normalizeImpressionFile(entry: unknown, projectUuid: string, impression: string): ImpressionFile | null {
        if (!entry || typeof entry !== 'object') return null;
        const e = entry as Record<string, unknown>;
        const name = String(e.name || e.filename || e.path || e.file || e.label || '');
        const isPlot = Boolean(e.is_plot ?? e.is_image ?? e.isImage)
            || e.type === 'plot'
            || looksLikeImage(name);
        const filePath = String(e.path || e.filename || name);
        return {
            name,
            path: filePath,
            type: String(e.type || (isPlot ? 'plot' : 'data')),
            is_plot: isPlot,
            is_image: isPlot,
            url: String(e.url || e.href || e.src || buildFileUrl(this._baseUrl, projectUuid, impression, filePath)),
            project_uuid: String(e.project_uuid || projectUuid),
            impression: String(e.impression || impression),
        };
    }

    /** Fetch job status for an impression (DITE /status endpoint). */
    async fetchImpressionStatus(projectUuid: string, impression: string): Promise<ImpressionStatus> {
        try {
            const data = await this.request('get', `/status/${encodePath(projectUuid)}/${encodePath(impression)}`);
            if (typeof data === 'string') return { status: data, details: '' };
            const obj = (data ?? {}) as Record<string, unknown>;
            return {
                status: String(obj.status_legacy || obj.status || ''),
                details: String(obj.details || obj.message || obj.error || ''),
            };
        } catch {
            return { status: '', details: '' };
        }
    }

    /** Fetch workflow info for an impression (plain text "machine workflow_id"). */
    async fetchImpressionWorkflow(projectUuid: string, impression: string): Promise<string> {
        try {
            const data = await this.request('get', `/workflow/${encodePath(projectUuid)}/${encodePath(impression)}`);
            return typeof data === 'string' ? data.trim() : '';
        } catch {
            return '';
        }
    }
}
```

注意：Task 2 的 abort 测试依赖超时逻辑在 `request()` 层（对所有注入的 fetchImpl 生效）：abort 触发 mock 的 signal 监听 → reject → `fetchImpressionStatus` 的 catch 返回空状态。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest src/test/yukiClient.test.ts`
Expected: PASS（12 个用例）

- [ ] **Step 5: 编译 + 提交**

Run: `npm run compile`
Expected: 无错误

```bash
git add src/yuki/client.ts src/test/yukiClient.test.ts
git commit -m "feat: add yuki client for DITE impression results

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 一次性 Python 脚本执行器

**Files:**
- Create: `src/celebiScript.ts`
- Create: `src/test/celebiScript.test.ts`

**Interfaces:**
- Consumes: 无
- Produces（后续任务依赖的精确签名）:
```ts
import { ObjectRecord, FileRecord } from './tree/treeBuilder';
export interface ProjectData { objects: ObjectRecord[]; files: FileRecord[] }
export interface CelebiPythonConfig { pythonPath: string; virtualenvPath: string; packagePath: string }
export function resolvePythonEnv(projectPath: string, cfg: CelebiPythonConfig): { pythonPath: string; venvPath?: string; packagePath: string }
export async function runCelebiPython(mode: 'project' | 'readme', projectPath: string, nodePath?: string): Promise<ProjectData | { readme: string | null }>
```

- [ ] **Step 1: 写失败测试** `src/test/celebiScript.test.ts`（只测纯函数 resolvePythonEnv，脚本执行留给编译 + 手动 F5 验证）

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolvePythonEnv } from '../celebiScript';

function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'celebi-test-'));
}

describe('resolvePythonEnv', () => {
    test('uses configured pythonPath first', () => {
        const env = resolvePythonEnv('/proj', { pythonPath: '/opt/python', virtualenvPath: '', packagePath: '' });
        expect(env.pythonPath).toBe('/opt/python');
    });

    test('resolves venv python when virtualenvPath configured', () => {
        const env = resolvePythonEnv('/proj', { pythonPath: '', virtualenvPath: '/venvs/proj', packagePath: '' });
        expect(env.pythonPath).toBe('/venvs/proj/bin/python');
    });

    test('auto-detects .venv in project root', () => {
        const dir = makeTmpDir();
        fs.mkdirSync(path.join(dir, '.venv', 'bin'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.venv', 'bin', 'python'), '');
        const env = resolvePythonEnv(dir, { pythonPath: '', virtualenvPath: '', packagePath: '' });
        expect(env.pythonPath).toBe(path.join(dir, '.venv', 'bin', 'python'));
        expect(env.venvPath).toBe(path.join(dir, '.venv'));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('falls back to python3', () => {
        const env = resolvePythonEnv('/nonexistent', { pythonPath: '', virtualenvPath: '', packagePath: '' });
        expect(env.pythonPath).toBe('python3');
        expect(env.venvPath).toBeUndefined();
    });

    test('passes packagePath through', () => {
        const env = resolvePythonEnv('/proj', { pythonPath: '', virtualenvPath: '', packagePath: '/Celebi' });
        expect(env.packagePath).toBe('/Celebi');
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest src/test/celebiScript.test.ts`
Expected: FAIL — "Cannot find module '../celebiScript'"

- [ ] **Step 3: 实现** `src/celebiScript.ts`（Python 脚本逐字镜像 celebi_ui `electron/ipc/filesystem.js` 的 PYTHON_SCRIPT，只保留 project/readme 两个 mode）

```ts
/**
 * One-shot Python executor for Celebi project data, ported from
 * celebi_ui electron/ipc/filesystem.js (PYTHON_SCRIPT + runCelebiPython).
 *
 * mode=project: VProject.sub_objects_recursively() + os.walk workspace files
 * mode=readme:  VObject(node_path).readme()
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ObjectRecord, FileRecord } from './tree/treeBuilder';

const PYTHON_SCRIPT = `
import json
import os
import re
import sys

project_path = sys.argv[1]
mode = sys.argv[2]
node_path = sys.argv[3] if len(sys.argv) > 3 else ""

def human_readable_size(num):
    if num == 0:
        return "0 B"
    k = 1024
    sizes = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(num)
    while size >= k and i < len(sizes) - 1:
        size /= k
        i += 1
    return f"{size:.1f}".rstrip("0").rstrip(".") + " " + sizes[i]

if mode == "project":
    from CelebiChrono.kernel.vproject import VProject

    project = VProject(project_path)
    objects = []
    for obj in project.sub_objects_recursively():
        obj_type = obj.object_type()
        if obj_type in ("", "project"):
            continue

        record = {
            "path": obj.invariant_path(),
            "type": obj_type,
        }

        try:
            descriptor = obj.get_descriptor()
        except Exception:
            descriptor = ""
        if descriptor:
            record["descriptor"] = descriptor

        try:
            if obj_type == "task":
                environment = obj.environment()
                if environment:
                    record["environment"] = environment
                memory_limit = obj.memory_limit()
                if memory_limit:
                    record["memory_limit"] = memory_limit
            elif obj_type == "algorithm":
                environment = obj.environment()
                if environment:
                    record["environment"] = environment
        except Exception:
            pass

        # Read celebi.yaml for additional metadata
        import yaml as _yaml
        try:
            yaml_path = os.path.join(obj.path, "celebi.yaml")
            if os.path.exists(yaml_path):
                with open(yaml_path, encoding="utf-8") as _f:
                    _meta = _yaml.safe_load(_f) or {}
                record["parameters"] = _meta.get("parameters", {})
                record["validated"] = bool(_meta.get("validated", False))
                record["default_runner"] = _meta.get("default_runner", "")
                record["use_eos"] = bool(_meta.get("use_eos", False))
                record["aliases"] = _meta.get("alias", []) or _meta.get("aliases", [])
                record["code_files"] = _meta.get("code_files", [])
                record["commands"] = _meta.get("commands", [])
                # Use VAlgorithm.commands() for algorithms
                if obj_type == "algorithm":
                    from CelebiChrono.kernel.valgorithm import VAlgorithm
                    record["commands"] = VAlgorithm(obj.path).commands()
        except Exception:
            pass

        # For tasks, get commands from linked algorithm
        if obj_type == "task":
            _params = record.get("parameters", {})
            config_path = os.path.join(obj.path, ".celebi", "config.json")
            if os.path.exists(config_path):
                with open(config_path, encoding="utf-8") as _f:
                    _cfg = json.load(_f)
                for pred in _cfg.get("predecessors", []):
                    algo_path = os.path.join(project_path, pred)
                    algo_yaml = os.path.join(algo_path, "celebi.yaml")
                    if os.path.exists(algo_yaml):
                        from CelebiChrono.kernel.valgorithm import VAlgorithm
                        _cmds = VAlgorithm(algo_path).commands()
                        if _cmds:
                            record["commands"] = _cmds
                        break
            # Substitute parameters
            if _params and record.get("commands"):
                record["commands"] = [
                    re.sub(r'\\$\\{(\\w+)\\}', lambda m: str(_params.get(m.group(1), m.group(0))), str(c))
                    for c in record["commands"]
                ]

        objects.append(record)

    files = []
    for dirpath, dirnames, filenames in os.walk(project_path):
        dirnames[:] = [
            d for d in dirnames
            if not d.startswith(".") and not d.startswith("dot_")
        ]
        rel_dir = os.path.relpath(dirpath, project_path)

        for filename in filenames:
            if filename.startswith("."):
                continue
            if filename.endswith("~undo-tree~"):
                continue

            full_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(full_path, project_path)
            if rel_path.startswith("impression_data/"):
                continue
            try:
                stat = os.stat(full_path)
            except OSError:
                continue
            files.append({
                "name": rel_path,
                "size": {
                    "raw": stat.st_size,
                    "human_readable": human_readable_size(stat.st_size),
                },
                "lastModified": __import__("datetime").datetime.fromtimestamp(
                    stat.st_mtime
                ).isoformat(),
                "absolutePath": full_path,
            })

    print(json.dumps({"objects": objects, "files": files}))
    raise SystemExit(0)

if mode == "readme":
    from CelebiChrono.kernel.vobject import VObject
    try:
        print(json.dumps({"readme": VObject(node_path).readme()}))
    except Exception:
        print(json.dumps({"readme": None}))
    raise SystemExit(0)

raise SystemExit(1)
`;

export interface ProjectData {
    objects: ObjectRecord[];
    files: FileRecord[];
}

export interface CelebiPythonConfig {
    pythonPath: string;
    virtualenvPath: string;
    packagePath: string;
}

/**
 * Resolve the Python interpreter and venv for a project.
 * Priority: configured pythonPath > configured virtualenvPath > auto-detected
 * venv (.venv/venv/env/.env/virtualenv) > 'python3'.
 */
export function resolvePythonEnv(
    projectPath: string,
    cfg: CelebiPythonConfig
): { pythonPath: string; venvPath?: string; packagePath: string } {
    let venvPath: string | undefined;
    if (cfg.virtualenvPath) {
        venvPath = cfg.virtualenvPath;
    } else {
        const venvNames = ['.venv', 'venv', 'env', '.env', 'virtualenv'];
        venvPath = venvNames
            .map((name) => path.join(projectPath, name))
            .find((candidate) => fs.existsSync(candidate));
    }

    let pythonPath = cfg.pythonPath;
    if (!pythonPath && venvPath) {
        const isWindows = process.platform === 'win32';
        const scriptsDir = isWindows ? 'Scripts' : 'bin';
        const pythonExe = isWindows ? 'python.exe' : 'python';
        const venvPython = path.join(venvPath, scriptsDir, pythonExe);
        if (fs.existsSync(venvPython)) {
            pythonPath = venvPython;
        }
    }
    if (!pythonPath) {
        pythonPath = 'python3';
    }

    return { pythonPath, venvPath, packagePath: cfg.packagePath };
}

/**
 * Run the embedded Celebi Python script once and return parsed JSON.
 * Throws on non-zero exit or invalid JSON output.
 */
export async function runCelebiPython(
    mode: 'project' | 'readme',
    projectPath: string,
    nodePath = ''
): Promise<ProjectData | { readme: string | null }> {
    const config = vscode.workspace.getConfiguration('celebi');
    const cfg: CelebiPythonConfig = {
        pythonPath: config.get<string>('pythonPath', ''),
        virtualenvPath: config.get<string>('virtualenvPath', ''),
        packagePath: config.get<string>('packagePath', ''),
    };
    const env = resolvePythonEnv(projectPath, cfg);

    const pyEnv: NodeJS.ProcessEnv = { ...process.env };
    if (env.packagePath) {
        pyEnv.PYTHONPATH = [env.packagePath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
    }

    return new Promise((resolve, reject) => {
        execFile(
            env.pythonPath,
            ['-c', PYTHON_SCRIPT, projectPath, mode, nodePath],
            { env: pyEnv, maxBuffer: 10 * 1024 * 1024 },
            (error, stdout) => {
                if (error) {
                    reject(new Error(`Celebi Python script failed (${env.pythonPath}): ${error.message}`));
                    return;
                }
                try {
                    resolve(JSON.parse(stdout.trim() || '{}'));
                } catch {
                    reject(new Error('Celebi Python script returned invalid JSON'));
                }
            }
        );
    });
}
```

注意：TS 字符串里 Python 正则 `re.sub(r'\$\{(\w+)\}'...)` 需写成模板字符串内的 `\\$\\{`（如上，避免 TS 模板插值）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest src/test/celebiScript.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 5: 编译 + 提交**

Run: `npm run compile`
Expected: 无错误

```bash
git add src/celebiScript.ts src/test/celebiScript.test.ts
git commit -m "feat: add one-shot Celebi python script runner mirrored from celebi_ui

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: TreeItem 与 TreeProvider 重写

**Files:**
- Modify: `src/treeItem.ts`（整体重写）
- Modify: `src/tree/treeProvider.ts`（整体重写）
- Create: `src/test/treeItem.test.ts`

**Interfaces:**
- Consumes: Task 1 `TreeNode`/`buildObjectTree`/`mergeFilesIntoTree`/`buildTypeMap`/`findNodeByPath`/`ObjectRecord`/`FileRecord`；Task 3 `runCelebiPython`/`ProjectData`
- Produces（后续任务依赖的精确签名）:
```ts
// treeItem.ts
export type CelebiNodeKind = 'object' | 'directory' | 'file';
export function iconFor(kind: CelebiNodeKind, celebiType: string | null): { id: string; color?: string }
export class CelebiTreeItem extends vscode.TreeItem {
    constructor(node: TreeNode, collapsibleState: vscode.TreeItemCollapsibleState)
    readonly node: TreeNode
    readonly kind: CelebiNodeKind
    readonly celebiType: string | null
    readonly nodeId: string  // node.id（相对路径）
}
// treeProvider.ts
export class CelebiTreeProvider implements vscode.TreeDataProvider<CelebiTreeItem> {
    constructor(projectRoot: string)
    refresh(): Promise<void>
    getTypeMap(): Record<string, string>
    getNodeById(id: string): TreeNode | undefined
    getProjectRoot(): string
    error: string | null
}
```

- [ ] **Step 1: 写失败测试** `src/test/treeItem.test.ts`（只测纯函数 `iconFor`）

```ts
import { iconFor } from '../treeItem';

describe('iconFor', () => {
    test('directory icons', () => {
        expect(iconFor('directory', null)).toEqual({ id: 'folder', color: 'charts.yellow' });
    });
    test('file icons', () => {
        expect(iconFor('file', null)).toEqual({ id: 'file', color: 'charts.foreground' });
    });
    test('celebi type icons', () => {
        expect(iconFor('object', 'task')).toEqual({ id: 'gear', color: 'charts.orange' });
        expect(iconFor('object', 'algorithm')).toEqual({ id: 'symbol-operator', color: 'charts.blue' });
        expect(iconFor('object', 'data')).toEqual({ id: 'database', color: 'charts.green' });
        expect(iconFor('object', null)).toEqual({ id: 'symbol-misc', color: 'charts.foreground' });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest src/test/treeItem.test.ts`
Expected: FAIL（iconFor 尚不存在，旧 treeItem.ts 无此导出）

- [ ] **Step 3: 重写** `src/treeItem.ts`

```ts
/**
 * Celebi tree item — a node in the repository tree.
 *
 * Wraps a TreeNode (built by tree/treeBuilder.ts) with VS Code presentation
 * (icon, tooltip, context value). Icon mapping mirrors celebi_ui's
 * CELEBI_TYPE_STYLES (task orange / algorithm blue / data green).
 */
import * as vscode from 'vscode';
import { TreeNode } from './tree/treeBuilder';

/** Structural node kind of a tree item. */
export type CelebiNodeKind = 'object' | 'directory' | 'file';

/** Pure icon mapping so it can be unit-tested outside the VS Code host. */
export function iconFor(kind: CelebiNodeKind, celebiType: string | null): { id: string; color?: string } {
    if (kind === 'directory') {
        return { id: 'folder', color: 'charts.yellow' };
    }
    if (kind === 'file') {
        return { id: 'file', color: 'charts.foreground' };
    }
    switch (celebiType) {
        case 'task':
            return { id: 'gear', color: 'charts.orange' };
        case 'algorithm':
            return { id: 'symbol-operator', color: 'charts.blue' };
        case 'data':
            return { id: 'database', color: 'charts.green' };
        default:
            return { id: 'symbol-misc', color: 'charts.foreground' };
    }
}

export class CelebiTreeItem extends vscode.TreeItem {
    constructor(
        public readonly node: TreeNode,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(node.name, collapsibleState);

        const icon = iconFor(node.type, node.celebiType);
        this.iconPath = icon.color
            ? new vscode.ThemeIcon(icon.id, new vscode.ThemeColor(icon.color))
            : new vscode.ThemeIcon(icon.id);
        this.contextValue = node.type;
        this.tooltip = node.celebiType ? `${node.name} (${node.celebiType})` : node.name;
    }

    get kind(): CelebiNodeKind {
        return this.node.type;
    }

    get celebiType(): string | null {
        return this.node.celebiType;
    }

    /** Node id = relative object/file path within the project. */
    get nodeId(): string {
        return this.node.id;
    }
}
```

- [ ] **Step 4: 重写** `src/tree/treeProvider.ts`

```ts
/**
 * Celebi repository tree data provider.
 *
 * On refresh, runs the one-shot Celebi Python script (objects + workspace
 * files), builds the full tree with treeBuilder.ts, and fires the change
 * event. Children are precomputed — no lazy expansion.
 */
import * as vscode from 'vscode';
import { CelebiTreeItem } from '../treeItem';
import { runCelebiPython, ProjectData } from '../celebiScript';
import {
    buildObjectTree, mergeFilesIntoTree, buildTypeMap, findNodeByPath,
    TreeNode, ObjectRecord, FileRecord,
} from './treeBuilder';

function toItem(node: TreeNode): CelebiTreeItem {
    const collapsible = node.children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
    return new CelebiTreeItem(node, collapsible);
}

export class CelebiTreeProvider implements vscode.TreeDataProvider<CelebiTreeItem> {
    private root: TreeNode = buildObjectTree([]);
    private typeMap: Record<string, string> = {};
    error: string | null = null;

    private _onDidChangeTreeData = new vscode.EventEmitter<CelebiTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly projectRoot: string) {}

    getTreeItem(element: CelebiTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CelebiTreeItem): Promise<CelebiTreeItem[]> {
        if (!element) {
            if (this.error) {
                const errorNode: TreeNode = {
                    id: '__error__', name: this.error, type: 'directory',
                    icon: 'error', iconColor: 'red', celebiType: null, data: {}, children: [],
                };
                return [toItem(errorNode)];
            }
            return this.root.children.map(toItem);
        }
        return element.node.children.map(toItem);
    }

    /** Re-run the Python script and rebuild the tree. */
    async refresh(): Promise<void> {
        this.error = null;
        try {
            const data = (await runCelebiPython('project', this.projectRoot)) as ProjectData;
            this.root = buildObjectTree(data.objects as ObjectRecord[]);
            mergeFilesIntoTree(this.root, data.files as FileRecord[]);
            this.typeMap = buildTypeMap(this.root);
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
            this.root = buildObjectTree([]);
            this.typeMap = {};
        }
        this._onDidChangeTreeData.fire();
    }

    getTypeMap(): Record<string, string> {
        return { ...this.typeMap };
    }

    getNodeById(id: string): TreeNode | undefined {
        return findNodeByPath(this.root, id) ?? undefined;
    }

    getProjectRoot(): string {
        return this.projectRoot;
    }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx jest src/test/treeItem.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 6: 编译 + 提交**

Run: `npm run compile`
Expected: 无错误（旧 parser/objectActions 仍存在但不被引用，无碍）

```bash
git add src/treeItem.ts src/tree/treeProvider.ts src/test/treeItem.test.ts
git commit -m "refactor: rewrite tree item and provider for object+file merged tree

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 项目元数据与文件预览读取

**Files:**
- Create: `src/projectMeta.ts`
- Create: `src/test/projectMeta.test.ts`

**Interfaces:**
- Consumes: 无（纯 fs）
- Produces（后续任务依赖的精确签名）:
```ts
export interface ProjectMeta { projectUuid: string; diteUrl: string }
export function readProjectMeta(projectRoot: string): ProjectMeta
export interface ObjectConfigResult { config: Record<string, unknown> | null; localConfig: Record<string, unknown> | null }
export function readObjectConfig(nodePath: string): ObjectConfigResult
export type FilePreviewPayload =
    | { kind: 'text'; content: string }
    | { kind: 'image'; base64: string; mime: string }
    | { kind: 'pdf'; absolutePath: string }
    | { kind: 'unsupported'; ext: string };
export function readFileForPreview(absolutePath: string): FilePreviewPayload
export const IMAGE_EXTENSIONS: string[];
export const CODE_EXTENSIONS: string[];
export const TEXT_EXTENSIONS: string[];
```

- [ ] **Step 1: 写失败测试** `src/test/projectMeta.test.ts`（用真实临时目录）

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    readProjectMeta, readObjectConfig, readFileForPreview,
} from '../projectMeta';

function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'celebi-meta-test-'));
}

describe('readProjectMeta', () => {
    test('reads project_uuid and hosts serverurl', () => {
        const dir = makeTmpDir();
        fs.mkdirSync(path.join(dir, '.celebi'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.celebi', 'config.json'), JSON.stringify({ project_uuid: 'uuid-123' }));
        fs.writeFileSync(path.join(dir, '.celebi', 'hosts.json'), JSON.stringify({ serverurl: '127.0.0.1:3315' }));
        expect(readProjectMeta(dir)).toEqual({ projectUuid: 'uuid-123', diteUrl: 'http://127.0.0.1:3315' });
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('keeps absolute http urls and tolerates missing files', () => {
        const dir = makeTmpDir();
        fs.mkdirSync(path.join(dir, '.celebi'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.celebi', 'hosts.json'), JSON.stringify({ serverurl: 'https://dite.example.com' }));
        expect(readProjectMeta(dir)).toEqual({ projectUuid: '', diteUrl: 'https://dite.example.com' });
        fs.rmSync(dir, { recursive: true, force: true });
        expect(readProjectMeta(makeTmpDir())).toEqual({ projectUuid: '', diteUrl: '' });
    });
});

describe('readObjectConfig', () => {
    test('reads config.json and config.local.json', () => {
        const dir = makeTmpDir();
        const celebiDir = path.join(dir, '.celebi');
        fs.mkdirSync(celebiDir, { recursive: true });
        fs.writeFileSync(path.join(celebiDir, 'config.json'), JSON.stringify({ impression: 'imp-1' }));
        fs.writeFileSync(path.join(celebiDir, 'config.local.json'), JSON.stringify({ local: true }));
        expect(readObjectConfig(dir)).toEqual({
            config: { impression: 'imp-1' },
            localConfig: { local: true },
        });
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('returns nulls when no config exists', () => {
        const dir = makeTmpDir();
        expect(readObjectConfig(dir)).toEqual({ config: null, localConfig: null });
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('readFileForPreview', () => {
    test('reads text files', () => {
        const dir = makeTmpDir();
        const f = path.join(dir, 'a.log');
        fs.writeFileSync(f, 'hello');
        expect(readFileForPreview(f)).toEqual({ kind: 'text', content: 'hello' });
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('encodes images as base64', () => {
        const dir = makeTmpDir();
        const f = path.join(dir, 'plot.png');
        fs.writeFileSync(f, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        const result = readFileForPreview(f);
        expect(result.kind).toBe('image');
        expect((result as { mime: string }).mime).toBe('image/png');
        expect((result as { base64: string }).base64).toBe('iVBORw==');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('marks pdfs and unsupported files', () => {
        const dir = makeTmpDir();
        const pdf = path.join(dir, 'a.pdf');
        const root = path.join(dir, 'b.root');
        fs.writeFileSync(pdf, '%PDF');
        fs.writeFileSync(root, 'root-data');
        expect(readFileForPreview(pdf)).toEqual({ kind: 'pdf', absolutePath: pdf });
        expect(readFileForPreview(root)).toEqual({ kind: 'unsupported', ext: 'root' });
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest src/test/projectMeta.test.ts`
Expected: FAIL — "Cannot find module '../projectMeta'"

- [ ] **Step 3: 实现** `src/projectMeta.ts`（扩展名常量逐字对齐 celebi_ui `config.js`）

```ts
/**
 * Project filesystem metadata, mirroring celebi_ui:
 *  - project_uuid from .celebi/config.json
 *  - DITE serverurl from .celebi/hosts.json
 *  - object config from .celebi/config.json + .celebi/config.local.json
 *  - workspace file previews (text / base64 image / pdf / unsupported)
 */
import * as fs from 'fs';
import * as path from 'path';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'bmp', 'webp'];
export const CODE_EXTENSIONS = [
    'c', 'cpp', 'h', 'hpp', 'py', 'yaml', 'yml', 'json', 'sh', 'bash',
    'js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'html', 'xml', 'toml',
    'ini', 'cfg', 'conf', 'md', 'rst',
];
export const TEXT_EXTENSIONS = ['txt', 'log', 'csv'];

const MIME_BY_EXT: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    webp: 'image/webp',
};

export interface ProjectMeta {
    projectUuid: string;
    diteUrl: string;
}

/** Read project-level metadata (both files optional). */
export function readProjectMeta(projectRoot: string): ProjectMeta {
    let projectUuid = '';
    try {
        const raw = fs.readFileSync(path.join(projectRoot, '.celebi', 'config.json'), 'utf8');
        projectUuid = (JSON.parse(raw) as Record<string, unknown>).project_uuid as string || '';
    } catch {
        // optional — leave empty
    }

    let diteUrl = '';
    try {
        const raw = fs.readFileSync(path.join(projectRoot, '.celebi', 'hosts.json'), 'utf8');
        const serverurl = (JSON.parse(raw) as Record<string, unknown>).serverurl as string | undefined;
        if (serverurl) {
            diteUrl = /^https?:\/\//.test(serverurl) ? serverurl : `http://${serverurl}`;
        }
    } catch {
        // optional — keep existing URL
    }

    return { projectUuid, diteUrl };
}

export interface ObjectConfigResult {
    config: Record<string, unknown> | null;
    localConfig: Record<string, unknown> | null;
}

/** Read an object's .celebi/config.json and .celebi/config.local.json. */
export function readObjectConfig(nodePath: string): ObjectConfigResult {
    const configPath = path.join(nodePath, '.celebi', 'config.json');
    const localPath = path.join(nodePath, '.celebi', 'config.local.json');

    let config: Record<string, unknown> | null = null;
    let localConfig: Record<string, unknown> | null = null;

    try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    } catch {
        // optional
    }
    try {
        localConfig = JSON.parse(fs.readFileSync(localPath, 'utf8')) as Record<string, unknown>;
    } catch {
        // optional
    }

    return { config, localConfig };
}

export type FilePreviewPayload =
    | { kind: 'text'; content: string }
    | { kind: 'image'; base64: string; mime: string }
    | { kind: 'pdf'; absolutePath: string }
    | { kind: 'unsupported'; ext: string };

/** Read a workspace file for the detail webview preview. */
export function readFileForPreview(absolutePath: string): FilePreviewPayload {
    const ext = path.extname(absolutePath).slice(1).toLowerCase();

    if (IMAGE_EXTENSIONS.includes(ext)) {
        return {
            kind: 'image',
            base64: fs.readFileSync(absolutePath).toString('base64'),
            mime: MIME_BY_EXT[ext] || 'application/octet-stream',
        };
    }
    if (ext === 'pdf') {
        return { kind: 'pdf', absolutePath };
    }
    if (CODE_EXTENSIONS.includes(ext) || TEXT_EXTENSIONS.includes(ext)) {
        return { kind: 'text', content: fs.readFileSync(absolutePath, 'utf8') };
    }
    return { kind: 'unsupported', ext };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest src/test/projectMeta.test.ts`
Expected: PASS（7 个用例）

- [ ] **Step 5: 编译 + 提交**

Run: `npm run compile`
Expected: 无错误

```bash
git add src/projectMeta.ts src/test/projectMeta.test.ts
git commit -m "feat: add project metadata and file preview reading

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 详情 webview 消息协议纯函数

**Files:**
- Create: `src/webview/detailMessages.ts`
- Create: `src/test/detailMessages.test.ts`

**Interfaces:**
- Consumes: Task 2 `ImpressionFile`；Task 5 `FilePreviewPayload`
- Produces（后续任务依赖的精确签名）:
```ts
export interface NodeDetail {
    id: string;
    name: string;
    kind: 'object' | 'directory' | 'file';
    celebiType: string | null;
    data: Record<string, unknown>;
}
export interface SelectNodePayload {
    type: 'selectNode';
    node: NodeDetail;
    config: Record<string, unknown> | null;
    readme: string | null;
    typeMap: Record<string, string>;
    projectUuid: string;
    file?: FilePreviewPayload;
}
export interface ImpressionResultsPayload {
    type: 'impressionResults';
    state: 'loading' | 'error' | 'ready';
    items: ImpressionFile[];
    status: string;
    details: string;
    workflow: string;
    error: string;
}
export type ExtensionToWebview = SelectNodePayload | ImpressionResultsPayload;
export type WebviewToExtension =
    | { type: 'selectImpression'; impression: string }
    | { type: 'navigateToPath'; path: string };
export function buildSelectNodePayload(node: NodeDetail, config: Record<string, unknown> | null, readme: string | null, typeMap: Record<string, string>, projectUuid: string, file?: FilePreviewPayload): SelectNodePayload
export function buildImpressionLoading(): ImpressionResultsPayload
export function buildImpressionReady(items: ImpressionFile[], status: string, details: string, workflow: string): ImpressionResultsPayload
export function buildImpressionError(message: string): ImpressionResultsPayload
export function parseWebviewMessage(raw: unknown): WebviewToExtension | null
```

- [ ] **Step 1: 写失败测试** `src/test/detailMessages.test.ts`

```ts
import {
    buildSelectNodePayload, buildImpressionLoading, buildImpressionReady,
    buildImpressionError, parseWebviewMessage,
    NodeDetail,
} from '../webview/detailMessages';

const node: NodeDetail = {
    id: 'tasks/analysis_1', name: 'analysis_1', kind: 'object',
    celebiType: 'task', data: { parameters: { x: 1 } },
};

describe('buildSelectNodePayload', () => {
    test('assembles the full payload', () => {
        const payload = buildSelectNodePayload(node, { impression: 'imp-1' }, '# README', { 'tasks/analysis_1': 'task' }, 'uuid-1');
        expect(payload).toEqual({
            type: 'selectNode',
            node,
            config: { impression: 'imp-1' },
            readme: '# README',
            typeMap: { 'tasks/analysis_1': 'task' },
            projectUuid: 'uuid-1',
        });
    });

    test('attaches file preview when provided', () => {
        const payload = buildSelectNodePayload(
            { ...node, kind: 'file' }, null, null, {}, '',
            { kind: 'text', content: 'hi' }
        );
        expect(payload.file).toEqual({ kind: 'text', content: 'hi' });
    });
});

describe('impression result payloads', () => {
    test('loading / error / ready states', () => {
        expect(buildImpressionLoading()).toEqual({
            type: 'impressionResults', state: 'loading', items: [], status: '', details: '', workflow: '', error: '',
        });
        expect(buildImpressionError('boom').error).toBe('boom');
        expect(buildImpressionError('boom').state).toBe('error');
        const ready = buildImpressionReady([], 'finished', 'ok', 'm1 wf-1');
        expect(ready.state).toBe('ready');
        expect(ready.status).toBe('finished');
        expect(ready.details).toBe('ok');
        expect(ready.workflow).toBe('m1 wf-1');
        expect(ready.items).toEqual([]);
    });
});

describe('parseWebviewMessage', () => {
    test('parses valid messages', () => {
        expect(parseWebviewMessage({ type: 'selectImpression', impression: 'imp-9' }))
            .toEqual({ type: 'selectImpression', impression: 'imp-9' });
        expect(parseWebviewMessage({ type: 'navigateToPath', path: 'algorithms/reco' }))
            .toEqual({ type: 'navigateToPath', path: 'algorithms/reco' });
    });
    test('rejects invalid messages', () => {
        expect(parseWebviewMessage(null)).toBeNull();
        expect(parseWebviewMessage('x')).toBeNull();
        expect(parseWebviewMessage({ type: 'nope' })).toBeNull();
        expect(parseWebviewMessage({ type: 'selectImpression' })).toBeNull();
        expect(parseWebviewMessage({ type: 'selectImpression', impression: 42 })).toBeNull();
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest src/test/detailMessages.test.ts`
Expected: FAIL — "Cannot find module '../webview/detailMessages'"

- [ ] **Step 3: 实现** `src/webview/detailMessages.ts`

```ts
/**
 * Message protocol between the detail webview and the extension host.
 * Pure data shapes + codecs so they can be unit-tested.
 */
import { ImpressionFile } from '../yuki/client';
import { FilePreviewPayload } from '../projectMeta';

export interface NodeDetail {
    id: string;
    name: string;
    kind: 'object' | 'directory' | 'file';
    celebiType: string | null;
    data: Record<string, unknown>;
}

export interface SelectNodePayload {
    type: 'selectNode';
    node: NodeDetail;
    config: Record<string, unknown> | null;
    readme: string | null;
    typeMap: Record<string, string>;
    projectUuid: string;
    file?: FilePreviewPayload;
}

export interface ImpressionResultsPayload {
    type: 'impressionResults';
    state: 'loading' | 'error' | 'ready';
    items: ImpressionFile[];
    status: string;
    details: string;
    workflow: string;
    error: string;
}

export type ExtensionToWebview = SelectNodePayload | ImpressionResultsPayload;

export type WebviewToExtension =
    | { type: 'selectImpression'; impression: string }
    | { type: 'navigateToPath'; path: string };

export function buildSelectNodePayload(
    node: NodeDetail,
    config: Record<string, unknown> | null,
    readme: string | null,
    typeMap: Record<string, string>,
    projectUuid: string,
    file?: FilePreviewPayload
): SelectNodePayload {
    const payload: SelectNodePayload = {
        type: 'selectNode', node, config, readme, typeMap, projectUuid,
    };
    if (file) {
        payload.file = file;
    }
    return payload;
}

export function buildImpressionLoading(): ImpressionResultsPayload {
    return {
        type: 'impressionResults', state: 'loading',
        items: [], status: '', details: '', workflow: '', error: '',
    };
}

export function buildImpressionReady(
    items: ImpressionFile[], status: string, details: string, workflow: string
): ImpressionResultsPayload {
    return {
        type: 'impressionResults', state: 'ready',
        items, status, details, workflow, error: '',
    };
}

export function buildImpressionError(message: string): ImpressionResultsPayload {
    return {
        type: 'impressionResults', state: 'error',
        items: [], status: '', details: '', workflow: '', error: message,
    };
}

/** Validate and decode a message coming from the webview. */
export function parseWebviewMessage(raw: unknown): WebviewToExtension | null {
    if (!raw || typeof raw !== 'object') return null;
    const msg = raw as Record<string, unknown>;
    if (msg.type === 'selectImpression' && typeof msg.impression === 'string') {
        return { type: 'selectImpression', impression: msg.impression };
    }
    if (msg.type === 'navigateToPath' && typeof msg.path === 'string') {
        return { type: 'navigateToPath', path: msg.path };
    }
    return null;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest src/test/detailMessages.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 5: 编译 + 提交**

Run: `npm run compile`
Expected: 无错误

```bash
git add src/webview/detailMessages.ts src/test/detailMessages.test.ts
git commit -m "feat: add detail webview message protocol codecs

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 详情 webview（HTML 模板 + 单例面板）

**Files:**
- Create: `src/webview/detailHtml.ts`
- Create: `src/webview/detailWebview.ts`
- Create: `src/test/detailHtml.test.ts`
- Modify: `src/webview/baseWebview.ts`（删 getErrorHtml，只留 escapeHtml）

**Interfaces:**
- Consumes: Task 6 `ExtensionToWebview`/`WebviewToExtension`/`parseWebviewMessage`；Task 1 `escapeHtml`（baseWebview.ts 保留）
- Produces（Task 9 依赖的精确签名）:
```ts
// detailHtml.ts
export function getDetailHtml(webview: vscode.Webview): string
// detailWebview.ts
export interface DetailWebviewCallbacks {
    onSelectImpression(impression: string): void;
    onNavigate(path: string): void;
}
export class DetailWebviewProvider implements vscode.Disposable {
    constructor(callbacks: DetailWebviewCallbacks)
    show(payload: ExtensionToWebview): void
    dispose(): void
}
```

- [ ] **Step 1: 写失败测试** `src/test/detailHtml.test.ts`（模板纯函数，不依赖 vscode 运行态，传入 stub webview）

```ts
import { getDetailHtml } from '../webview/detailHtml';

const stubWebview = {
    cspSource: 'vscode-webview://csp',
};

describe('getDetailHtml', () => {
    test('contains CSP allowing http images and nonce script', () => {
        const html = getDetailHtml(stubWebview as never);
        expect(html).toContain('default-src \'none\'');
        expect(html).toContain('img-src');
        expect(html).toContain('http:');
        expect(html).toContain('https:');
        expect(html).toContain('data:');
        expect(html).toContain("script-src 'nonce-");
    });
    test('renders all DetailPanel sections', () => {
        const html = getDetailHtml(stubWebview as never);
        for (const marker of [
            'id="emptyState"', 'id="typeLabel"', 'id="impressionSelect"',
            'id="readmeSection"', 'id="statusSection"', 'id="predecessorsSection"',
            'id="successorsSection"', 'id="objectInfoSection"', 'id="resultsSection"',
            'id="fileInfoSection"', 'id="previewSection"', 'id="lightbox"',
        ]) {
            expect(html).toContain(marker);
        }
    });
    test('contains acquireVsCodeApi wiring', () => {
        const html = getDetailHtml(stubWebview as never);
        expect(html).toContain('acquireVsCodeApi()');
        expect(html).toContain('selectImpression');
        expect(html).toContain('navigateToPath');
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest src/test/detailHtml.test.ts`
Expected: FAIL — "Cannot find module '../webview/detailHtml'"

- [ ] **Step 3: 精简** `src/webview/baseWebview.ts`（重写为只含 escapeHtml）

```ts
/** Shared webview utilities. */

/** Escape special HTML characters to prevent XSS. */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: 实现** `src/webview/detailHtml.ts`（HTML/CSS/JS 镜像 celebi_ui DetailPanel.js + FilePreview.js；用 `escapeHtml` 转义所有来自数据的文本；图片 URL 白名单 http/https/data）

```ts
/**
 * HTML template for the detail webview, mirroring celebi_ui's
 * DetailPanel.js + FilePreview.js sections:
 *   header (name + type badge) → impression select → impression id
 *   → README → Job Status → Predecessors → Successors → Object Info
 *   → Contents count → Results grid (+lightbox) | File info + preview
 */
import * as vscode from 'vscode';

export function getDetailHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} http: https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
    h4 { margin: 0 0 0.4rem; font-size: 0.95rem; text-transform: uppercase;
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
                   font-size: 0.8rem; font-weight: 600; color: #fff; }
    .statusDone { background: #21ba45; }
    .statusFailed { background: #db2828; }
    .statusPending { background: #fbbd08; }
    .runnerBadge { display: inline-block; margin-left: 0.5rem; padding: 2px 8px;
                   border-radius: 10px; background: var(--vscode-badge-background);
                   color: var(--vscode-badge-foreground); font-size: 0.8rem; }
    code { font-family: var(--vscode-editor-font-family); }
    .workflowId { margin-left: 0.5rem; font-size: 0.85rem; }
    .statusDetails { margin-left: 0.5rem; font-size: 0.85rem; color: var(--vscode-descriptionForeground); }
    .relationTag { display: inline-block; margin: 0.2rem 0.3rem 0 0; padding: 2px 8px;
                   border: 1px solid var(--vscode-panel-border); border-radius: 10px;
                   font-size: 0.8rem; cursor: pointer; }
    .relationTag:hover { background: var(--vscode-list-hoverBackground); }
    .paramList { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; }
    .paramKey { color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); }
    .commandsPre { background: var(--vscode-textCodeBlock-background);
                   padding: 0.6rem 0.75rem; border-radius: 6px; overflow-x: auto;
                   font-family: var(--vscode-editor-font-family); font-size: 0.85rem;
                   line-height: 1.6; margin: 0.25rem 0 0; white-space: pre-wrap; }
    .resultGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                  gap: 0.75rem; margin-top: 0.5rem; }
    .resultImage { width: 100%; cursor: zoom-in; border: 1px solid var(--vscode-panel-border);
                   border-radius: 4px; }
    .resultFile { display: flex; align-items: center; gap: 0.4rem; }
    .resultFileLink { color: var(--vscode-textLink-foreground); text-decoration: none;
                      font-size: 0.85rem; word-break: break-all; }
    .impressionId { font-size: 0.9rem; }
    .imagePreview { max-width: 100%; }
    .codePreview { background: var(--vscode-textCodeBlock-background); padding: 0.6rem 0.75rem;
                   border-radius: 4px; overflow-x: auto; white-space: pre-wrap; }
    .unsupported { color: var(--vscode-descriptionForeground); font-style: italic; }
    .emptyState { text-align: center; margin-top: 3rem; color: var(--vscode-descriptionForeground); }
    #lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999;
                display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
    #lightbox img { max-width: 90vw; max-height: 90vh; object-fit: contain; }
    #impressionSelect { font-size: 0.85rem; }
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

<div id="lightbox" hidden><img id="lightboxImg" alt="preview"></div>

<script nonce="${nonce}">
(function () {
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);
    const TYPE_COLORS = { task: '#f97316', algorithm: '#3b82f6', data: '#22c55e', directory: '#eab308' };

    let current = null;

    function esc(text) {
        const div = document.createElement('div');
        div.textContent = text === null || text === undefined ? '' : String(text);
        return div.innerHTML;
    }

    function hideAllSections() {
        for (const id of ['impressionIdSection', 'readmeSection', 'statusSection',
            'predecessorsSection', 'successorsSection', 'objectInfoSection',
            'contentsSection', 'resultsSection', 'fileInfoSection', 'previewSection']) {
            $(id).hidden = true;
        }
    }

    function setCollapse(id, title, count, shown) {
        const arrow = $(id + 'Arrow');
        arrow.textContent = shown ? '▾' : '▸';
        $(id + 'Title').textContent = count !== null ? title + ' (' + count + ')' : title;
    }

    function renderNode(msg) {
        current = msg;
        hideAllSections();
        $('emptyState').hidden = true;
        $('detail').hidden = false;

        $('nodeName').textContent = msg.node.name;
        const typeLabel = $('typeLabel');
        const color = TYPE_COLORS[msg.node.celebiType] || TYPE_COLORS.directory;
        typeLabel.style.background = color;
        typeLabel.textContent = msg.node.celebiType
            ? msg.node.celebiType.charAt(0).toUpperCase() + msg.node.celebiType.slice(1)
            : 'Directory';
        if (msg.node.kind === 'file') {
            typeLabel.textContent = 'File';
            typeLabel.style.background = '#888';
        }

        // Impression selector (reversed, like celebi_ui)
        const impressions = Array.isArray(msg.config?.impressions) ? [...msg.config.impressions].reverse() : [];
        const select = $('impressionSelect');
        if (msg.node.kind === 'object' && impressions.length > 0) {
            select.hidden = false;
            select.innerHTML = '<option value="">Select impression</option>' + impressions.map((imp) => {
                const uuid = typeof imp === 'object' ? imp.uuid : imp;
                const timestamp = (typeof imp === 'object' && imp.timestamp)
                    ? new Date(imp.timestamp).toLocaleString(undefined, { hourCycle: 'h23' }) : '';
                const label = timestamp ? uuid.substring(0, 7) + ' (' + timestamp + ')' : uuid.substring(0, 7);
                return '<option value="' + esc(uuid) + '">' + esc(label) + '</option>';
            }).join('');
            select.value = msg.config.impression || '';
        } else {
            select.hidden = true;
            select.innerHTML = '';
        }

        const selectedImpression = msg.config?.impression || '';
        if (selectedImpression) {
            $('impressionIdSection').hidden = false;
            $('impressionId').textContent = selectedImpression;
        }

        // README
        if (msg.readme) {
            $('readmeSection').hidden = false;
            $('readmeBox').textContent = msg.readme;
            $('readmeArrow').textContent = '▾';
        }

        // Predecessors / Successors
        const preds = Array.isArray(msg.config?.predecessors) ? msg.config.predecessors : [];
        const succs = Array.isArray(msg.config?.successors) ? msg.config.successors : [];
        if (preds.length > 0) {
            $('predecessorsSection').hidden = false;
            setCollapse('predecessors', 'Predecessors', preds.length, true);
            $('predecessorsBox').innerHTML = preds.map((p) => relationTag(p, msg.typeMap)).join('');
        }
        if (succs.length > 0) {
            $('successorsSection').hidden = false;
            setCollapse('successors', 'Successors', succs.length, false);
            $('successorsBox').innerHTML = succs.map((s) => relationTag(s, msg.typeMap)).join('');
            $('successorsBox').hidden = true;
        }

        // Object info
        if (msg.node.kind === 'object') {
            $('objectInfoSection').hidden = false;
            const data = msg.node.data || {};
            const params = data.parameters && typeof data.parameters === 'object' ? data.parameters : {};
            $('paramList').innerHTML = Object.entries(params).map(([k, v]) =>
                '<div class="paramKey">' + esc(k) + '</div><div>' + esc(v) + '</div>'
            ).join('');
            const rows = [];
            if (data.environment) rows.push('<div><strong>Environment:</strong> ' + esc(data.environment) + '</div>');
            if (data.memory_limit) rows.push('<div><strong>Memory Limit:</strong> ' + esc(data.memory_limit) + '</div>');
            if (data.default_runner) rows.push('<div><strong>Default runner:</strong> ' + esc(data.default_runner) + '</div>');
            if (Array.isArray(data.aliases) && data.aliases.length > 0) rows.push('<div><strong>Aliases:</strong> ' + esc(data.aliases.join(', ')) + '</div>');
            $('infoRows').innerHTML = rows.join('');
            const codeFiles = Array.isArray(data.code_files) ? data.code_files : [];
            $('codeFilesBox').innerHTML = codeFiles.length > 0
                ? '<h4>Algorithm files</h4><ul>' + codeFiles.map((f) =>
                    '<li>' + esc(typeof f === 'string' ? f : (f.name || f.path) + ': ' + (f.code || '')) + '</li>'
                ).join('') + '</ul>'
                : '';
            const commands = Array.isArray(data.commands) ? data.commands : [];
            $('commandsBox').innerHTML = commands.length > 0
                ? '<h4>Commands</h4><pre class="commandsPre">' + esc(commands.join('\n')) + '</pre>'
                : '';
        }

        // Contents count fallback
        if (!msg.readme) {
            $('contentsSection').hidden = false;
            $('contentsCount').textContent = (msg.node.data?.childrenCount || 0) + ' item(s)';
        }

        // File preview
        if (msg.node.kind === 'file') {
            $('fileInfoSection').hidden = false;
            const f = msg.node.data || {};
            $('fileInfoRows').innerHTML =
                '<div><strong>Path:</strong> ' + esc(f.name || msg.node.name) + '</div>' +
                '<div><strong>Size:</strong> ' + esc(f.size?.human_readable || f.size?.raw || '—') + '</div>' +
                '<div><strong>Modified:</strong> ' + esc(f.lastModified || '—') + '</div>';
            $('previewSection').hidden = false;
            $('previewBox').innerHTML = renderPreview(msg.file);
        }

        // Results area (populated by renderResults)
        if (msg.node.celebiType === 'task') {
            $('resultsSection').hidden = false;
            $('resultsStatus').textContent = '';
            $('resultGrid').innerHTML = '';
        }
    }

    function relationTag(path, typeMap) {
        const type = typeMap && typeMap[path];
        const color = TYPE_COLORS[type] || null;
        const style = color ? 'style="background:' + color + '15;color:' + color + ';border-color:' + color + '40"' : '';
        return '<span class="relationTag" data-path="' + esc(path) + '" ' + style + ' role="button" tabindex="0">' + esc(path) + '</span>';
    }

    function renderPreview(file) {
        if (!file) return '<p class="unsupported">Preview not available.</p>';
        if (file.kind === 'text') {
            return '<pre class="codePreview"><code>' + esc(file.content) + '</code></pre>';
        }
        if (file.kind === 'image') {
            return '<img class="imagePreview" alt="preview" src="data:' + esc(file.mime) + ';base64,' + esc(file.base64) + '">';
        }
        if (file.kind === 'pdf') {
            return '<p class="unsupported">PDF preview not available. Open the file externally to view.</p>';
        }
        return '<p class="unsupported">Preview not available for .' + esc(file.ext) + ' files. Open externally to view.</p>';
    }

    function renderResults(msg) {
        if (!current || current.node.celebiType !== 'task') return;
        $('resultsSection').hidden = false;
        if (msg.state === 'loading') {
            $('resultsStatus').textContent = 'Loading results...';
            return;
        }
        if (msg.state === 'error') {
            $('resultsStatus').innerHTML = '<p class="unsupported">' + esc(msg.error) + '</p>';
            return;
        }

        // Job status
        $('statusSection').hidden = !msg.status;
        if (msg.status) {
            const badge = $('statusBadge');
            badge.textContent = msg.status;
            badge.className = 'statusBadge ' + (
                ['finished', 'success', 'archived'].includes(msg.status) ? 'statusDone'
                : ['failed', 'error'].includes(msg.status) ? 'statusFailed'
                : 'statusPending'
            );
            const parts = (msg.workflow || '').split(/\\s+/).filter(Boolean);
            $('runnerBadge').hidden = !parts[0];
            if (parts[0]) $('runnerBadge').textContent = parts[0];
            $('workflowId').textContent = parts.slice(1).join(' ');
            $('statusDetails').textContent = msg.details || '';
        }

        const items = msg.items || [];
        if (items.length === 0) {
            $('resultsStatus').textContent = 'No results for this impression.';
            $('resultGrid').innerHTML = '';
            return;
        }
        $('resultsStatus').textContent = '';
        $('resultGrid').innerHTML = items.map((item) => {
            if (item.is_plot) {
                return '<img class="resultImage" alt="' + esc(item.name) + '" src="' + esc(item.url) + '" data-url="' + esc(item.url) + '" data-name="' + esc(item.name) + '" onerror="this.style.display=\\'none\\'">';
            }
            return '<div class="resultFile"><span>📄</span><a class="resultFileLink" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.name) + '</a></div>';
        }).join('');
    }

    // Impression selector
    $('impressionSelect').addEventListener('change', (e) => {
        vscode.postMessage({ type: 'selectImpression', impression: e.target.value });
    });

    // Relation tags (delegated)
    document.addEventListener('click', (e) => {
        const tag = e.target.closest('.relationTag');
        if (tag) {
            vscode.postMessage({ type: 'navigateToPath', path: tag.dataset.path });
            return;
        }
        const img = e.target.closest('.resultImage');
        if (img) {
            $('lightboxImg').src = img.dataset.url;
            $('lightbox').hidden = false;
        }
    });

    // Lightbox close
    $('lightbox').addEventListener('click', () => { $('lightbox').hidden = true; });

    // Collapsible headers
    $('readmeSection').querySelector('.collapseHeader').addEventListener('click', () => {
        const box = $('readmeBox');
        box.hidden = !box.hidden;
        $('readmeArrow').textContent = box.hidden ? '▸' : '▾';
    });
    $('predecessorsSection').querySelector('.collapseHeader').addEventListener('click', () => {
        const box = $('predecessorsBox');
        box.hidden = !box.hidden;
        $('predecessorsArrow').textContent = box.hidden ? '▸' : '▾';
    });
    $('successorsSection').querySelector('.collapseHeader').addEventListener('click', () => {
        const box = $('successorsBox');
        box.hidden = !box.hidden;
        $('successorsArrow').textContent = box.hidden ? '▸' : '▾';
    });

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'selectNode') renderNode(msg);
        if (msg.type === 'impressionResults') renderResults(msg);
    });
})();
</script>
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
```

- [ ] **Step 5: 实现** `src/webview/detailWebview.ts`

```ts
/**
 * Singleton detail webview panel.
 *
 * Mirrors celebi_ui's DetailPanel: one panel whose content is swapped on
 * every tree selection. Incoming messages are validated by
 * detailMessages.parseWebviewMessage before hitting the callbacks.
 */
import * as vscode from 'vscode';
import { getDetailHtml } from './detailHtml';
import { ExtensionToWebview, parseWebviewMessage } from './detailMessages';

export interface DetailWebviewCallbacks {
    onSelectImpression(impression: string): void;
    onNavigate(path: string): void;
}

export class DetailWebviewProvider implements vscode.Disposable {
    public static readonly viewType = 'celebiDetail';

    private panel: vscode.WebviewPanel | undefined;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly callbacks: DetailWebviewCallbacks) {}

    /** Create (once) and push a payload into the panel. */
    show(payload: ExtensionToWebview): void {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel(
                DetailWebviewProvider.viewType,
                'Celebi Detail',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                }
            );
            this.panel.webview.html = getDetailHtml(this.panel.webview);
            this.panel.onDidReceiveMessage((raw: unknown) => {
                const msg = parseWebviewMessage(raw);
                if (!msg) return;
                if (msg.type === 'selectImpression') {
                    this.callbacks.onSelectImpression(msg.impression);
                }
                if (msg.type === 'navigateToPath') {
                    this.callbacks.onNavigate(msg.path);
                }
            }, undefined, this.disposables);
            this.panel.onDidDispose(() => { this.panel = undefined; }, undefined, this.disposables);
        }
        this.panel.reveal(undefined, true);
        void this.panel.webview.postMessage(payload);
    }

    dispose(): void {
        this.panel?.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx jest src/test/detailHtml.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 7: 编译 + 提交**

Run: `npm run compile`
Expected: 无错误（旧 webview/index.ts 等仍存在且被旧代码引用，无碍）

```bash
git add src/webview/baseWebview.ts src/webview/detailHtml.ts src/webview/detailWebview.ts src/test/detailHtml.test.ts
git commit -m "feat: add detail webview mirroring celebi_ui DetailPanel

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: package.json 清单精简

**Files:**
- Modify: `scripts/package/commands.json`（整体重写）
- Modify: `scripts/package/menus.json`（整体重写）
- Modify: `scripts/package/configuration.json`（整体重写）
- Modify: `scripts/package/views.json`（整体重写）
- Modify: `scripts/package/base.json`（scripts 增加 test）

**Interfaces:**
- Consumes: 无
- Produces: 重新生成的 package.json（39 个命令删除、菜单只剩 refreshTree、配置 4 项、views 去掉 diteMessagePanel）

- [ ] **Step 1: 重写** `scripts/package/commands.json`

```json
{
  "commands": [
    { "command": "celebi.refreshTree", "title": "Refresh Celebi Tree", "icon": "$(refresh)" }
  ]
}
```

- [ ] **Step 2: 重写** `scripts/package/menus.json`

```json
{
  "menus": {
    "view/title": [
      { "command": "celebi.refreshTree", "when": "view == celebiTreeView", "group": "navigation" }
    ]
  }
}
```

- [ ] **Step 3: 重写** `scripts/package/configuration.json`

```json
{
  "configuration": {
    "title": "Repository",
    "properties": {
      "celebi.pythonPath": {
        "type": "string",
        "default": "",
        "description": "Path to Python interpreter. If empty, auto-detects from virtualenv or uses 'python3'"
      },
      "celebi.virtualenvPath": {
        "type": "string",
        "default": "",
        "description": "Path to Python virtualenv directory (e.g., /path/to/.venv). Auto-detected if empty"
      },
      "celebi.packagePath": {
        "type": "string",
        "default": "",
        "description": "Optional: Path to CelebiChrono package (if not in Python path)"
      },
      "celebi.diteServerUrl": {
        "type": "string",
        "default": "http://127.0.0.1:3315",
        "description": "DITE server URL used when the project has no .celebi/hosts.json"
      }
    }
  }
}
```

- [ ] **Step 4: 重写** `scripts/package/views.json`

```json
{
  "viewsContainers": {
    "activitybar": [
      {
        "id": "celebiViewContainer",
        "title": "Celebi",
        "icon": "media/icon.png"
      }
    ]
  },
  "views": {
    "celebiViewContainer": [
      {
        "id": "celebiTreeView",
        "name": "Celebi",
        "icon": "media/icon.png"
      }
    ]
  }
}
```

- [ ] **Step 5: 修改** `scripts/package/base.json` — 在 `"scripts"` 对象里加 `"test": "jest"`（与 compile 并列）

```json
  "scripts": {
    "build:package": "node scripts/build-package.js",
    "compile": "npm run build:package && tsc -p .",
    "test": "jest"
  },
```

- [ ] **Step 6: 重新生成并检查差异**

Run: `npm run build:package && git diff --stat package.json && node -e "const p=require('./package.json'); console.log('commands:', p.contributes.commands.length); console.log('views:', JSON.stringify(p.contributes.views.celebiViewContainer.map(v=>v.id))); console.log('config keys:', Object.keys(p.contributes.configuration.properties));"`
Expected: commands: 1；views: `["celebiTreeView"]`；config keys: `["celebi.pythonPath","celebi.virtualenvPath","celebi.packagePath","celebi.diteServerUrl"]`

- [ ] **Step 7: 编译 + 测试 + 提交**

Run: `npm run compile && npm test`
Expected: 无错误、全部 jest 用例通过

```bash
git add package.json scripts/package/
git commit -m "refactor: prune package manifest to tree view and refresh command

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: extension.ts 重写 + 死亡模块清扫

**Files:**
- Modify: `src/extension.ts`（整体重写）
- Delete: `src/message/messageHtml.ts`、`src/message/messagePanel.ts`、`src/message/messageStore.ts`
- Delete: `src/webview/lsWebview.ts`、`src/webview/traceWebview.ts`、`src/webview/browserWebview.ts`、`src/webview/readmeWebview.ts`、`src/webview/index.ts`、`src/webview/baseWebview.ts`
- Delete: `src/tree/objectActions.ts`、`src/tree/parser.ts`
- Delete: `src/commands/`（整个目录：creationCommands.ts、globalCommands.ts、objectCommands.ts、index.ts、utils.ts）
- Delete: `src/formatOutput.ts`、`src/pythonRunner.ts`
- Delete: `src/test/messagePanel.test.ts`

**Interfaces:**
- Consumes: Task 1–8 全部
- Produces: 可 F5 调试的完整插件（树 + 详情 + refreshTree + watcher）

- [ ] **Step 1: 重写** `src/extension.ts`

```ts
/**
 * Celebi VS Code Extension — entry point.
 *
 * Lean viewer: a repository tree (objects + workspace files, built by a
 * one-shot Python script) and a detail webview aligned with celebi_ui's
 * CelebiExplorer/DetailPanel. Results come from the DITE HTTP API.
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { CelebiTreeProvider } from './tree/treeProvider';
import { CelebiTreeItem } from './treeItem';
import { YukiClient } from './yuki/client';
import { readProjectMeta, readObjectConfig, readFileForPreview } from './projectMeta';
import { runCelebiPython } from './celebiScript';
import { DetailWebviewProvider } from './webview/detailWebview';
import {
    buildSelectNodePayload, buildImpressionLoading, buildImpressionReady,
    buildImpressionError, NodeDetail,
} from './webview/detailMessages';
import { TreeNode } from './tree/treeBuilder';

export function activate(context: vscode.ExtensionContext): void {
    const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!projectRoot) {
        void vscode.window.showInformationMessage(
            'Celebi: open a workspace folder to browse its repository.'
        );
        return;
    }

    // -- Project metadata & yuki client --
    const meta = readProjectMeta(projectRoot);
    const config = vscode.workspace.getConfiguration('celebi');
    const baseUrl = meta.diteUrl || config.get<string>('diteServerUrl', 'http://127.0.0.1:3315');
    const yuki = new YukiClient(baseUrl);

    // -- Tree --
    const provider = new CelebiTreeProvider(projectRoot);
    const treeView = vscode.window.createTreeView('celebiTreeView', {
        treeDataProvider: provider,
    });
    context.subscriptions.push(
        treeView,
        vscode.commands.registerCommand('celebi.refreshTree', () => provider.refresh())
    );

    // -- Detail webview --
    const detail = new DetailWebviewProvider({
        onSelectImpression: async (impression) => {
            if (!meta.projectUuid) {
                detail.show(buildImpressionError('Project UUID missing — cannot load results.'));
                return;
            }
            detail.show(buildImpressionLoading());
            const [items, status, workflow] = await Promise.all([
                yuki.fetchImpressionResults(meta.projectUuid, impression),
                yuki.fetchImpressionStatus(meta.projectUuid, impression),
                yuki.fetchImpressionWorkflow(meta.projectUuid, impression),
            ]);
            detail.show(buildImpressionReady(items, status.status, status.details, workflow));
        },
        onNavigate: async (targetPath) => {
            const node = provider.getNodeById(targetPath);
            if (!node) return;
            await treeView.reveal(toItemFor(node), { select: true, focus: true });
        },
    });
    context.subscriptions.push(detail);

    function toItemFor(node: TreeNode): CelebiTreeItem {
        const collapsible = node.children.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;
        return new CelebiTreeItem(node, collapsible);
    }

    // -- Selection → detail payload --
    treeView.onDidChangeSelection(async (e) => {
        const item = e.selection[0];
        if (!item) return;
        await showDetail(item);
    });

    async function showDetail(item: CelebiTreeItem): Promise<void> {
        const node = item.node;

        if (node.type === 'file') {
            const fileData = node.data as Record<string, unknown>;
            const absolutePath = String(fileData.absolutePath || path.join(projectRoot, node.id));
            const nodeDetail: NodeDetail = {
                id: node.id, name: node.name, kind: 'file',
                celebiType: null, data: fileData,
            };
            let file;
            try {
                file = readFileForPreview(absolutePath);
            } catch {
                file = undefined;
            }
            detail.show(buildSelectNodePayload(nodeDetail, null, null, provider.getTypeMap(), meta.projectUuid, file));
            return;
        }

        const nodeDetail: NodeDetail = {
            id: node.id, name: node.name, kind: node.type,
            celebiType: node.celebiType, data: node.data,
        };

        const fsPath = path.join(projectRoot, node.id);
        const { config: objectConfig, localConfig } = readObjectConfig(fsPath);
        const mergedConfig = { ...(objectConfig || {}), ...(localConfig || {}) };

        let readme: string | null = null;
        try {
            const result = (await runCelebiPython('readme', projectRoot, fsPath)) as { readme: string | null };
            readme = result.readme;
        } catch {
            // README is optional — keep null
        }

        detail.show(buildSelectNodePayload(
            nodeDetail, mergedConfig, readme, provider.getTypeMap(), meta.projectUuid
        ));

        // Auto-fetch job status for the default impression (results load on demand)
        const impression = mergedConfig.impression as string | undefined;
        if (node.celebiType === 'task' && impression && meta.projectUuid) {
            const status = await yuki.fetchImpressionStatus(meta.projectUuid, impression);
            detail.show(buildImpressionReady([], status.status, status.details, ''));
        }
    }

    // -- File watcher: refresh the tree on project changes (debounced) --
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(projectRoot, '**/*')
    );
    let debounceTimer: NodeJS.Timeout | undefined;
    const scheduleRefresh = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => void provider.refresh(), 800);
    };
    watcher.onDidChange(scheduleRefresh);
    watcher.onDidCreate(scheduleRefresh);
    watcher.onDidDelete(scheduleRefresh);
    context.subscriptions.push(watcher);

    void provider.refresh();
}

export function deactivate(): void { /* nothing to clean up */ }
```

- [ ] **Step 2: 删除死亡模块**

```bash
rm src/message/messageHtml.ts src/message/messagePanel.ts src/message/messageStore.ts
rm src/webview/lsWebview.ts src/webview/traceWebview.ts src/webview/browserWebview.ts src/webview/readmeWebview.ts src/webview/index.ts src/webview/baseWebview.ts
rm src/tree/objectActions.ts src/tree/parser.ts
rm -r src/commands
rm src/formatOutput.ts src/pythonRunner.ts
rm src/test/messagePanel.test.ts
```

- [ ] **Step 3: 编译确认绿**

Run: `npm run compile`
Expected: 无错误。若报残留 import，用 `grep -rn "from './commands\|from '../pythonRunner\|from './message\|from './parser\|from './objectActions\|from './webview'" src --include="*.ts"` 找出并清理（Task 9 完成后除 extension.ts 外不得再引用任何已删模块）。

- [ ] **Step 4: 全量测试**

Run: `npm test`
Expected: 全部 46 个用例通过（treeBuilder 10 + yuki 13 + celebiScript 5 + treeItem 3 + projectMeta 7 + detailMessages 5 + detailHtml 3）

- [ ] **Step 5: 检查** `src/test/extension.test.ts` — 确认不引用任何已删模块（现内容为独立冒烟测试，无需改动；若引用了则改为只保留 sample test）

- [ ] **Step 6: 提交**

```bash
git add -A src/
git commit -m "refactor: rewrite activation and remove all non-viewer modules

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 手动验证清单（Task 9 之后，与 celebi_ui 对照）

- [ ] F5 启动扩展，打开一个 Celebi 项目工作区
- [ ] 树显示对象+文件合并层级；task 橙色齿轮、algorithm 蓝色、data 绿色、directory 黄色
- [ ] 点击 task：详情面板出现类型徽章、impression 下拉（倒序）、README、Object Info（parameters/commands）、Predecessors/Successors、Job Status（自动）、Results 区
- [ ] 切换 impression：Results 网格出现 plot 图（yuki /export URL）与文件链接；点击图弹出 lightbox
- [ ] 点击 Predecessor tag：树自动 reveal 并选中该节点
- [ ] 点击文件节点：File Info + 预览（文本/图片/PDF 降级提示）
- [ ] 停止 DITE 服务：Results/Status 显示错误态，树与 README 不受影响
- [ ] 修改工作区文件：树在约 1s 内自动刷新
- [ ] `celebi.refreshTree` 命令与视图标题按钮可用
