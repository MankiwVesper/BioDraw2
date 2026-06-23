# AI 协作约定

本文记录 Codex 与 Claude Code 在 BioDraw2 项目中的共同分工。目标是让两套工具共享项目事实，但各自的本地缓存、权限配置和临时产物互不干扰。

## 共享资料

以下内容属于项目共同知识，Codex 与 Claude Code 都应优先参考：

- `ARCHITECTURE.md`：项目架构、关键不变量、风险区与当前状态。
- `docs/`：正式设计方案、实现计划、阶段总结。
- `biodraw/.agents/`：历史中文设计文档、静态审查记录和 UI 重设计资料。
- `AGENTS.md` / `CLAUDE.md`：分别是 Codex 与 Claude Code 的工具专用入口，但其中涉及项目事实的部分应尽量与 `ARCHITECTURE.md` 保持一致。

如果发现共享事实过期，优先更新 `ARCHITECTURE.md` 或 `docs/` 中对应文档，再按需同步工具专用说明。

## 工具专用边界

以下内容是本地工具状态或运行产物，不应提交到仓库：

- `.codex/`：Codex 本地配置、验证脚本、截图、Chrome profile、npm cache 等。
- `.playwright-cli/` / `.playwright-mcp/`：Playwright 工具运行日志、截图、视频与临时快照。
- `.superpowers/`：本地辅助工具的临时工作区。
- `.claude/settings.json`：Claude Code 本地配置。

`.claude/settings.local.json` 当前已经被仓库跟踪，属于历史遗留状态。处理它之前应单独确认：是继续保留、迁移为示例模板，还是从索引中移出并转为本地配置。

## 协作原则

- 共同规则放在共享文档中，避免在 `AGENTS.md` 与 `CLAUDE.md` 中重复维护两份互相漂移的项目事实。
- 工具专用文档只写该工具如何工作、如何验证、如何遵守本地环境约束。
- 临时验证脚本默认放在工具私有目录，不提交；需要长期复用时，再整理到项目内明确目录并补说明。
- 提交前检查 `git status --short --branch`，确认只包含本次任务相关文件。
