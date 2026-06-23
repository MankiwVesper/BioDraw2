# BioDraw2 Agent Instructions

本文档记录 BioDraw2 项目的 AI 协作约束。后续 Codex 或其他 AI coding agent 接手项目时，应先阅读并遵守本文档。

## 项目背景

- BioDraw2 是面向高中生物老师的浏览器示意图/动画编辑器。
- 目标是帮助老师绘制高中生物课程中的动态过程，方便学生理解抽象知识。
- 当前主体应用位于 `app` 子目录。
- 技术栈：React、TypeScript、Vite、Konva/react-konva、Zustand、Immer。

## 开发环境

- 开发环境是 Windows。
- 默认 shell 是 PowerShell。
- 优先使用 PowerShell 命令，不默认使用 bash/Linux 风格命令。
- 不使用 `sed`、`grep`、`rm -rf`、bash heredoc 等 Linux 命令作为默认方案。
- 常用 PowerShell 命令包括：
  - `Get-ChildItem`
  - `Get-Content -Encoding utf8`
  - `Select-String`
  - `Remove-Item`
  - `Copy-Item`
  - `npm.cmd`
- Node.js 安装路径：`D:\Programs\nodejs`
- 如需显式调用 Node/npm，优先使用：
  - `D:\Programs\nodejs\node.exe`
  - `D:\Programs\nodejs\npm.cmd`

## 常用命令

在 `D:\Project\BioDraw2\app` 下执行：

```powershell
npm.cmd run dev
npm.cmd run check
npm.cmd run build
npm.cmd run lint
```

项目当前没有独立测试框架。提交前至少运行：

```powershell
npm.cmd run check
```

如果普通 PowerShell 中 `npm` 被执行策略拦截，使用 `npm.cmd`。

## 编码与语言

- 源码、注释、UI 文案、提交说明优先使用中文。
- 文件统一按 UTF-8 处理。
- 不引入中文乱码。
- 使用 PowerShell 读取中文文件时，应显式使用 `-Encoding utf8`。
- 不要用可能破坏中文编码的命令重写文件。
- 手动编辑优先使用 `apply_patch`。

## Git 与 GitHub

- 当前远端：`origin https://github.com/MankiwVesper/BioDraw2.git`
- 当前项目使用的 Git 邮箱：`mankiw007@outlook.com`
- Windows 下 Codex 普通沙箱用户可能与仓库文件所有者不同，遇到 `dubious ownership` 时，为沙箱用户执行：
  - `git config --global --add safe.directory D:/Project/BioDraw2`
- 当前环境已为普通沙箱用户配置上述 `safe.directory`，日常 `git status`、`git diff` 可直接执行。
- 涉及真实账号、凭据或远端写入的操作，例如 `git commit`、`git push`、`gh auth`、`gh pr`，优先使用真实 Windows 用户上下文执行。
- 提交前必须检查：
  - `git status --short --branch`
  - `git diff`
  - `git diff --cached`
- 不回滚、删除或覆盖用户未明确要求处理的改动。
- 如果工作区已有无关改动，只提交本次任务相关文件。
- Git/GitHub 提交信息使用中文，避免使用英文 commit message。
- 如需推送或创建 PR，先确认验证结果，再执行 `git push` 或 `gh pr create`。
- 本机已配置 GitHub CLI：`gh`。
- 后续较大的功能开发优先使用 `codex/` 前缀功能分支，及时推送并合并回 `main`，避免长期分支漂移。

## 修改原则

- 优先小范围、可验证的修改。
- 匹配现有代码风格，不做无关重构。
- 复杂交互逻辑不要为了消除 warning 贸然改动。
- 尤其谨慎处理：
  - 画布拖拽
  - 时间轴拖拽
  - 播放状态
  - 序列帧导出
  - 视频导出
  - 自动保存/打开/保存文件
- 对这些区域的修改，需要说明风险并进行浏览器回归验证。

## 当前已知事项

- `eslint .` 已忽略 `.claude`、`.agents`、`node_modules`、`dist`、`coverage`，避免历史工作树噪声。
- 当前仍有少量 React hooks 依赖 warning。不要机械补依赖，需结合交互逻辑专项处理。
- `vite build` 可能输出大量 SVG asset 信息和大 chunk warning，这是素材库体量导致的已知遗留问题；核心功能稳定后再考虑素材懒加载或分包优化。

## 浏览器验证

- 项目是浏览器应用，前端交互改动后应尽量进行浏览器验证。
- 本地地址通常为 `http://127.0.0.1:5173/`。
- 如果 `http://127.0.0.1:5173/` 无法访问，优先尝试 `http://localhost:5173/`。
- 后续真实浏览器验证优先使用“项目内 Playwright + 真实 Chrome 9222 CDP”方式，不再优先依赖 Chrome 插件链路。
- Chrome 插件链路可能受插件、native host、沙箱或用户目录权限影响；除非用户明确要求，否则不要把它作为首选验证方式。
- 如 Playwright/CDP 方式不可用，再考虑 Codex in-app Browser 或让用户手动验证。

### 固定 Playwright/CDP 验证方式

- `app` 项目安装 `playwright` 开发依赖，用于连接真实 Chrome 做本地验证。
- 后续不要再使用 `npx --package @playwright/cli` 作为默认验证入口，避免 npm/npx 反复访问不可写的用户缓存目录。
- 运行 npm 命令时，如遇用户目录权限问题，应把缓存和 prefix 固定到项目 `.codex` 目录，例如：

```powershell
$env:npm_config_cache='D:\Project\BioDraw2\.codex\npm-cache'
$env:npm_config_prefix='D:\Project\BioDraw2\.codex\npm-prefix'
```

- 真实 Chrome 调试端口使用 `9222`。如端口未开启，可用真实 Windows 用户上下文启动专用 Chrome：

```powershell
Start-Process -FilePath "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=D:\Project\BioDraw2\.codex\chrome-real-profile",
  "http://localhost:5173/"
)
```

- 临时 Playwright 验证脚本默认放在 `D:\Project\BioDraw2\.codex\`，通过项目内依赖连接真实 Chrome：

```js
const { createRequire } = require('module');
const requireFromApp = createRequire('D:/Project/BioDraw2/app/package.json');
const { chromium } = requireFromApp('playwright');

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = context.pages()[0] || await context.newPage();
await page.goto('http://localhost:5173/');
```

- 执行脚本时优先使用固定 Node 路径：

```powershell
D:\Programs\nodejs\node.exe D:\Project\BioDraw2\.codex\verify-xxx.cjs
```

- 这种方式连接的是用户真实 Chrome，不依赖 Codex Chrome 插件；适合验证 DOM、按钮状态、控制台错误、弹窗文案、点击/输入/拖拽流程和 store 行为。
- `.codex/` 下的一次性验证脚本、Chrome profile、npm cache、Playwright 临时产物默认不提交到仓库。

### 浏览器验证节省原则

- 验证前先从代码确认最短操作路径，避免在浏览器中探索式反复试错。
- 优先使用项目内 Playwright 连接真实 Chrome 9222 CDP；不要误开 Edge 或无关浏览器。
- 每个功能点只验证一条最小主流程，确认本次修改的关键行为即可。
- 优先通过 DOM、状态、class、样式和控制台错误查询确认结果；仅在视觉细节必须确认时截图。
- 避免频繁读取完整页面快照、连续截图或进行无关 UI 操作。
- 只有当最小流程无法满足验证要求时，再追加更细的检查或新的浏览器操作。
- 遇到页面状态不确定、操作路径不确定或需要用户决策时，先暂停询问用户。

### 分层验证与 Playwright 约定

- 前端改动优先采用分层验证：
  1. 先运行 `npm.cmd run check`，确认类型、构建和 lint 没有新增错误。
  2. 再用项目内 Playwright 连接真实 Chrome 9222 CDP，优先通过 DOM、状态、class、按钮状态、store 状态和控制台错误做最小验证。
  3. 只有当修改涉及真实点击、拖拽、输入等交互时，才执行一条最短用户操作路径。
  4. 涉及 canvas、Konva、动画视觉、弹窗遮挡等视觉问题时，可补充截图或交给用户肉眼确认。
- 可以根据需要编写 Playwright 脚本辅助验证，尤其适合重复流程、复杂流程、DOM 状态检查、console 检查和截图验证。
- 一次性验证脚本默认放在 `.codex/` 目录，不提交到仓库。
- 若某条 Playwright 流程需要长期复用，应先征求用户确认，再整理到 `test/script/` 目录中提交。
- 长期复用脚本命名需要规范且明确，建议包含功能域和验证目标，例如 `apply-animation-target-feedback.spec.ts`。
- 长期复用脚本内部必须写清楚测试点、验证路径和关键断言，方便后续集中测试时快速理解用途。
- 当前项目尚未开展完备测试，不要为了临时验证贸然引入完整测试框架；待开发接近尾声再统一规划全面测试。
- Playwright 脚本默认应通过 CDP 连接 9222 上的真实 Chrome；只有确实需要隔离环境时，才启动 Playwright 自带浏览器。

## 用户偏好

- 用户希望命令、说明和注释符合 Windows/PowerShell 使用习惯。
- 用户希望中文内容正常显示，不出现乱码。
- 用户倾向稳健开发：先说明风险，再处理可能影响现有功能的改动。
