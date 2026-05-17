# BioDraw2 Agent Instructions

本文档记录 BioDraw2 项目的 AI 协作约束。后续 Codex 或其他 AI coding agent 接手项目时，应先阅读并遵守本文档。

## 项目背景

- BioDraw2 是面向高中生物老师的浏览器示意图/动画编辑器。
- 目标是帮助老师绘制高中生物课程中的动态过程，方便学生理解抽象知识。
- 当前主体应用位于 `biodraw` 子目录。
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

在 `D:\Project\BioDraw2\biodraw` 下执行：

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
- Chrome 插件链路已手动修复，可使用 `@chrome` 做真实 Chrome 验证。
- 如 Chrome 插件不可用，可使用 Codex in-app Browser 或让用户手动验证。

### 浏览器验证节省原则

- 验证前先从代码确认最短操作路径，避免在浏览器中探索式反复试错。
- 优先使用 Chrome 插件连接用户当前 Chrome；不要误开 Edge 或无关浏览器。
- 每个功能点只验证一条最小主流程，确认本次修改的关键行为即可。
- 优先通过 DOM、状态、class、样式和控制台错误查询确认结果；仅在视觉细节必须确认时截图。
- 避免频繁读取完整页面快照、连续截图或进行无关 UI 操作。
- 只有当最小流程无法满足验证要求时，再追加更细的检查或新的浏览器操作。
- 遇到页面状态不确定、操作路径不确定或需要用户决策时，先暂停询问用户。

## 用户偏好

- 用户希望命令、说明和注释符合 Windows/PowerShell 使用习惯。
- 用户希望中文内容正常显示，不出现乱码。
- 用户倾向稳健开发：先说明风险，再处理可能影响现有功能的改动。
