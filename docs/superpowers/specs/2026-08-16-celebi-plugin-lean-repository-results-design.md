# Celebi 插件精简改造设计：Repository 浏览 + 结果查看

- 日期：2026-08-16
- 分支：`feat/repository-results`
- 状态：已与用户逐节确认

## 目标

把 Celebi VS Code 扩展从"全能操作台"（40 个命令：git、trace、DITE 消息、创建/提交/执行、Python 表达式……）精简为**纯查看器**，只保留两块能力：

1. **Repository 浏览**：原生树显示 Celebi 项目结构（对象 + 工作区文件合并）
2. **结果查看**：详情 webview 显示对象详情与 impression 结果（状态、图表、文件）

内容与数据流对齐 `/Users/wave/workdir/Celebi/celebi_ui`（Electron 应用）的 CelebiExplorer 页面 + DetailPanel 组件。

## 已确认的决策

| 问题 | 决策 |
| --- | --- |
| 结果数据来源 | 直连 yuki/DITE HTTP API（与 celebi_ui 完全一致），不依赖 Python |
| 功能范围 | 纯查看。删除执行、创建、git、trace、DITE 消息面板、Python 执行、终端、独立 ls/status/readme 命令 |
| UI 形态 | 原生树（活动栏）+ 单一详情 webview（编辑器区） |
| 树的内容 | 对象 + 工作区文件合并（与 celebi_ui 一致） |
| 项目管理 | 单项目：当前 VS Code 工作区根目录即 Celebi 项目 |
| 树数据管道 | 镜像 celebi_ui 的一次性 Python 脚本（VProject + os.walk） |
| 详情面板 | 单一可复用 webview，镜像 DetailPanel + FilePreview |

## 整体架构

```
工作区根目录 (Celebi 项目)
  │
  ├─ .celebi/config.json   → project_uuid
  ├─ .celebi/hosts.json    → DITE serverurl
  │
  ├─ [树管道] 一次性 Python 脚本 (镜像 celebi_ui)
  │     VProject.sub_objects_recursively() → objects[]
  │     os.walk → files[]
  │     ↓
  │   TS: buildObjectTree + mergeFilesIntoTree + buildTypeMap
  │     ↓
  │   原生 celebiTreeView (CelebiTreeItem)
  │
  ├─ [详情 webview] 节点选中 → 读 config/readme → 渲染 DetailPanel 各 section
  │
  └─ [Yuki 客户端] fetch (Node)
        GET /file-status/{uuid}/{impression}/none?kind=stageout
        GET /status/{uuid}/{impression}
        GET /workflow/{uuid}/{impression}
        (文件预览 URL: /export/{uuid}/{impression}/{path})
```

## 删除清单

### 命令（40 个中删除 39 个）

保留 `celebi.refreshTree`。删除：

`runPythonPackage` `runInTerminal` `showOutput` `refreshDite` `openObject` `submit`
`impress` `switchProject` `execute` `switchServer` `showTrace` `gitStatus`
`gitHistory` `viewResults` `showLs` `showReadme` `createTask` `createAlgorithm`
`createDirectory` `removeObject` `showStatus` `showTree` `showJobs` `objectStatus`
`objectTree` `objectJobs` `objectChanges` `objectHistory` `objectSubmit`
`objectJob` `objectResubmit` `objectResults` `objectImpress` `objectPre` `objectSuc`
`objectCat` `objectRun` `clearMessages` `showDiteMessages`

（README / config / 状态等内容的展示并入详情 webview，不再有独立命令。）

### 模块

- `src/message/` 全部（DITE 消息面板：messageHtml / messagePanel / messageStore）
- `src/webview/lsWebview.ts`、`traceWebview.ts`、`browserWebview.ts`、`readmeWebview.ts`
- `src/tree/objectActions.ts`（树的 View/Execute 分组节点）
- `src/tree/parser.ts`（解析旧 shell.MANAGER 树输出，新管道不再需要）
- `src/commands/utils.ts` 及 `src/commands/index.ts` 中被删命令的辅助/汇总逻辑（creationCommands / objectCommands / globalCommands 全部删除，commands 目录整体移除）
- `src/formatOutput.ts`（输出通道格式化，随命令一起删除）
- `src/pythonRunner.ts` 重写为一次性脚本执行器（不再维护持久 shell）
- SCM provider（placeholder）、状态栏项目

### package.json

- `contributes.commands` 只保留 `celebi.refreshTree`
- `contributes.menus` 只保留 view/title 的 refreshTree；删掉全部 view/item/context 与 commandPalette 条目
- `contributes.configuration`：保留 `celebi.pythonPath` / `celebi.virtualenvPath` / `celebi.packagePath`；新增 `celebi.diteServerUrl`（默认 `http://127.0.0.1:3315`）
- `contributes.views` 保留 celebiViewContainer + celebiTreeView

## 组件设计

### 1. 树管道（src/tree/）

- **`celebiScript.ts`（新）**：镜像 celebi_ui `electron/ipc/filesystem.js` 内嵌的 Python 脚本。
  - mode=project：`VProject(project_path).sub_objects_recursively()`，每条对象记录含 path、type、descriptor、environment、memory_limit、parameters（celebi.yaml）、validated、default_runner、use_eos、aliases、code_files、commands（算法取 `VAlgorithm(...).commands()`，任务从 predecessor 算法取并做 `${param}` 替换）；`os.walk` 收集 files（排除隐藏文件、`dot_` 前缀目录、`impression_data/`、`~undo-tree~`），文件记录含 name（相对路径）、size（raw + human_readable）、lastModified、absolutePath。
  - mode=readme：`VObject(node_path).readme()`。
  - Python 解释器与 PYTHONPATH 解析沿用现有 pythonRunner 的配置逻辑（celebi.pythonPath / virtualenvPath / packagePath）。
- **`treeProvider.ts`（重写）**：refresh 时跑 mode=project 脚本 → 照抄 celebi_ui JS 侧逻辑：`buildObjectTree(objects)` + `mergeFilesIntoTree(root, files)` + `buildTypeMap(tree)` → 生成 `CelebiTreeItem` 树（全量构建，children 缓存）。图标/颜色镜像 `getCelebiTypeStyle`：task=cog/橙、algorithm=calculator/蓝、data=database/绿、directory=folder/黄、file=file/灰。节点类型：`object`（携带 celebiType + data）、`directory`、`file`。

### 2. Yuki 客户端（src/yuki/client.ts，新）

镜像 `celebi_ui/src/adapters/yuki-api.js`（去掉 Runner 管理、workflow 浏览等无用方法）：

- `fetchImpressionResults(projectUuid, impression, kind='stageout')`：`GET /collect/{p}/{i}`（忽略失败）+ `GET /file-status/{p}/{i}/none?kind=stageout`；结果归一化（兼容数组 / `{items}` / `{files}` / `{impression_data}` 形态），每条含 name、path、is_plot、url（优先自带 url，fallback 构造 `/export/{p}/{i}/{path}`）；排序：plot 在前，其余按名字典序。
- `fetchImpressionStatus(projectUuid, impression)`：`GET /status/{p}/{i}`；兼容字符串响应与 JSON（`status_legacy || status`、`details || message || error`）。
- `fetchImpressionWorkflow(projectUuid, impression)`：`GET /workflow/{p}/{i}`，纯文本响应 trim 后返回。
- baseUrl 优先级：`.celebi/hosts.json` 的 `serverurl` → 配置 `celebi.diteServerUrl` → `http://127.0.0.1:3315`；无协议前缀时补 `http://`。
- 传输：Node 全局 `fetch`（VS Code 扩展宿主自带 Node 18+）；超时 10s（镜像 celebi_ui `DEFAULT_TIMEOUT`）。

### 3. 详情 webview（src/webview/detailWebview.ts，新）

单例 webview panel（编辑器区，`retainContextWhenHidden: true`）。HTML/CSS/JS 镜像 celebi_ui `DetailPanel.js` + `FilePreview.js`，与扩展通过 postMessage 双向通信。

**对象/目录节点渲染的 section（自上而下，对应 DetailPanel）：**

1. 标题：节点名 + 类型徽章（task 橙 / algorithm 蓝 / data 绿 / directory 黄）
2. impression 下拉框：`config.impressions` 倒序，标签 = uuid 前 7 位（+时间戳，若有）
3. Impression ID（选中后）
4. README（可折叠，**只读**——纯查看器不做编辑）
5. Job Status：状态徽章（finished/success/archived 绿，failed/error 红，其余 pending 黄）+ runner + workflow id + details
6. Predecessors / Successors（可折叠，relation tag 点击 → 通知扩展在树中 reveal 该路径）
7. Object Info：parameters 表、environment、memory_limit、default_runner、aliases、code_files、commands（等宽代码块）
8. Contents 计数（无 README 时的兜底）
9. Results（仅 task 节点）：plot 图片网格（点击 lightbox 放大）+ 非图文件链接

**File 节点渲染：** File Info（path / size / modified）+ Preview（镜像 FilePreview：图片 base64 data URI、文本/code `<pre>`、PDF 降级 `vscode.open` 外部打开、其他扩展名提示不支持）。

**消息协议（webview ↔ extension）：**

- extension → webview：`selectNode`（node、config、readme、typeMap、projectUuid）、`impressionResults`（items/status/details/workflow 或 loading/error）
- webview → extension：`selectImpression`（uuid）、`navigateToPath`（path）、`error` 上报

### 4. 项目元数据（src/project.ts 或并入 tree 模块，新）

- `readProjectMeta(root)`：读 `.celebi/config.json` 取 `project_uuid`（可缺省）、`.celebi/hosts.json` 取 `serverurl`（可缺省）。纯 fs JSON 读取，不需要 Python。

### 5. extension.ts（重写激活逻辑）

- 注册：celebiTreeView（树 provider）、详情 webview、`celebi.refreshTree`、文件 watcher（工作区文件增删改 → debounce 刷新树；镜像 celebi_ui 的刷新语义）
- 树 `onDidChangeSelection` → 打开/更新详情 webview
- 删除：SCM provider、状态栏项目、消息面板、全部被删命令的注册

## 数据流

1. **树刷新**：激活时 / refreshTree / 文件 watcher（debounce）→ 工作区根 = 项目根（多根工作区取第一个 folder）→ `runCelebiPython('project')` → `{objects, files}` → buildObjectTree + mergeFilesIntoTree + buildTypeMap → 渲染树（全量缓存 children）。
2. **节点选中**：`onDidChangeSelection` → 详情 webview `selectNode`：并行读 config（fs）、readme（Python mode=readme）、typeMap（内存）→ webview 渲染；若选中 task 且 `config.impression` 存在 → 自动查一次 Job Status（不自动加载 Results，等用户选 impression）。
3. **impression 切换**：webview → extension `Promise.all([fetchImpressionResults, fetchImpressionStatus, fetchImpressionWorkflow])` → 回传 webview → 渲染 Job Status + Results 网格。
4. **relation 点击**：webview → extension → `tree.reveal()` + 选中 → 回到步骤 2。
5. **文件预览**：File 节点选中 → extension 读本地文件（文本直传；图片 base64 data URI；PDF 用 `vscode.open` 外部打开）→ webview FilePreview 渲染。

## 错误处理

| 场景 | 行为 |
| --- | --- |
| Python 脚本失败（解释器缺失 / CelebiChrono 未装 / 路径错） | 树显示错误占位节点 + 通知；详情面板空态提示（镜像 celebi_ui EmptyState） |
| yuki 不可达 / 超时 | 状态与结果区显示"服务不可用"，不阻塞树浏览与 README/config 展示 |
| `hosts.json` 缺失 | fallback `celebi.diteServerUrl` → 默认 `http://127.0.0.1:3315` |
| `project_uuid` 缺失 | Results 区显示说明（uuid 缺失，无法查询结果）；其他 section 正常 |
| 单文件读取失败 | 预览区显示错误文本，不影响面板其他部分 |
| 结果图片加载失败 | `onError` 隐藏该图（镜像 celebi_ui） |
| yuki 请求超时 | 10s 超时后进入"服务不可用"状态 |

## 测试

- **删除**：`src/test/messagePanel.test.ts`（模块删除）；`src/test/extension.test.ts` 重写为轻量冒烟。
- **新增（jest 纯逻辑单测，从 celebi_ui 现有测试移植）**：
  - 树构建：`buildObjectTree` / `mergeFilesIntoTree`（后缀匹配、dot_ 排除、impression_data 排除）/ `buildTypeMap` / `findNodeByPath` —— 移植 `celebi-fs.test.js`
  - Yuki client（mock fetch）：baseUrl 归一化、响应形态兼容（coerceArray）、`/export` fallback URL 构造、status 字段兼容（字符串/JSON）
  - 详情 webview 消息组装：node/config/typeMap → impressionResults 状态机（loading/error/items）
- **手动验证**：F5 调试扩展（见 CLAUDE.md），对照 celebi_ui 的实际渲染效果核对详情面板各 section。

## 范围外（本次不做）

- README 编辑（celebi_ui 有编辑功能；纯查看器定位下不做，保留扩展点）
- 工作区搜索过滤（用 VS Code 原生树的 filter）
- Runner 管理、workflow 浏览、DAG、终端（celebi_ui 的其他页面）
- 多项目切换（已确认单项目）
