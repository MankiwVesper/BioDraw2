# AI 协作约定

本文记录 Codex 与 Claude Code 在 BioDraw2 项目中的共同分工。目标是让两套工具共享项目事实，但各自的本地缓存、权限配置和临时产物互不干扰。

## 共享资料

以下内容属于项目共同知识，Codex 与 Claude Code 都应优先参考：

- `ARCHITECTURE.md`：项目架构、关键不变量、风险区与当前状态。
- `docs/`：正式设计方案、实现计划、阶段总结。
- `app/.agents/`：历史中文设计文档、静态审查记录和 UI 重设计资料。
- `AGENTS.md` / `CLAUDE.md`：分别是 Codex 与 Claude Code 的工具专用入口，但其中涉及项目事实的部分应尽量与 `ARCHITECTURE.md` 保持一致。

如果发现共享事实过期，优先更新 `ARCHITECTURE.md` 或 `docs/` 中对应文档，再按需同步工具专用说明。

## 工具专用边界

以下内容是本地工具状态或运行产物，不应提交到仓库：

- `.codex/`：Codex 本地配置、验证脚本、截图、Chrome profile、npm cache 等。
- `.playwright-cli/` / `.playwright-mcp/`：Playwright 工具运行日志、截图、视频与临时快照。
- `.superpowers/`：本地辅助工具的临时工作区。
- `.claude/settings.local.json`：Claude Code 个人本机权限配置（已被 `.gitignore` 忽略）。

注：`.claude/settings.json` 是团队共享配置，**纳入版本控制**，不属于本地产物。

## 协作原则

- 共同规则放在共享文档中，避免在 `AGENTS.md` 与 `CLAUDE.md` 中重复维护两份互相漂移的项目事实。
- 工具专用文档只写该工具如何工作、如何验证、如何遵守本地环境约束。
- 临时验证脚本默认放在工具私有目录，不提交；需要长期复用时，再整理到项目内明确目录并补说明。
- 提交前检查 `git status --short --branch`，确认只包含本次任务相关文件。

## 目录结构约定（2026-06 整理结论）

一次系统核查后确认：**被 git 跟踪的结构本就干净、无功能重复**。以下约定已固化，避免反复"整合"：

- **单一 `.claude/`**：全项目仅根目录一处（原 `app/.claude/` 的权限已并入根并删除）。`settings.json` 共享提交，`settings.local.json` 本机忽略。
- **AI 入口文档各司其职，不合并**：`CLAUDE.md`（Claude Code 自动加载）与 `AGENTS.md`（Codex 自动加载）按文件名硬性绑定各自工具，无法合并；`ARCHITECTURE.md` 是两者共享的架构层；本文件是分工地图。项目事实尽量只写在 `ARCHITECTURE.md`，其余引用它，防止漂移。
- **设计文档分两处是刻意的**：`app/.agents/`（历史中文设计稿，CLAUDE.md 有引用）与 `docs/`（superpowers 工作流产出的 plan/spec，工具约定目录）。各有主人，不要合并。
- **本地产物目录定期清理即可**：`.codex/`、`.playwright-cli/`、`.playwright-mcp/`、`.superpowers/` 及 Claude worktree 残留均被忽略，不影响仓库，按需清磁盘。
- **行尾统一**：根 `.gitattributes` 以 `text=auto eol=lf` 规范，新文件自动生效。
