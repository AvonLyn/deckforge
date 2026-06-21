<div align="center">

# DeckForge

**把本地材料变成可预览、可修改、可导出的 PPT 草稿。**

DeckForge is a desktop-first PPT generation workspace for turning local materials into editable presentation drafts.

[下载 Windows 安装包](https://github.com/AvonLyn/deckforge/releases/tag/v0.1.0) · [Download for Windows](https://github.com/AvonLyn/deckforge/releases/tag/v0.1.0)

</div>

## 快速下载

DeckForge v0.1.0 提供两个 Windows 版本：

- `DeckForge-Setup-0.1.0.exe`：推荐给大多数用户，按提示安装后从开始菜单启动。
- `DeckForge-Portable-0.1.0.exe`：免安装版本，下载后直接运行。
- `SHA256SUMS.txt`：用于校验安装包完整性。

安装包未做代码签名。Windows 可能显示 SmartScreen 提醒，请确认文件来自本仓库 Release 页面后继续运行。

## 这是什么

DeckForge 面向需要把材料快速整理成汇报 PPT 的用户。它可以读取本地文件夹或浏览器上传的材料，生成结构化 DeckIR，再导出 HTML 预览、PPTX 文件和 QA 检查结果。

当前版本适合个人本地试用、方案验证和内部材料整理。它不是云服务，默认把工作区、配置和产物保存在你的电脑上。

## 快速开始

1. 打开 [v0.1.0 Release](https://github.com/AvonLyn/deckforge/releases/tag/v0.1.0)。
2. 下载 `DeckForge-Setup-0.1.0.exe` 或 `DeckForge-Portable-0.1.0.exe`。
3. 启动 DeckForge。
4. 在生成任务里选择材料文件夹，或直接上传材料文件。
5. 根据需要填写页数、语言、语气和提示词。
6. 点击生成后，可以预览页面、提交局部修改意见、导出 HTML 或 PPTX。

## 核心能力

- 本地材料读取：支持选择文件夹或在浏览器中上传材料。
- DeckIR 工作流：先生成结构化演示文稿，再统一输出预览和文件。
- HTML 预览：快速检查排版、层级和内容密度。
- PPTX 导出：生成可继续编辑的 PowerPoint 文件。
- 评论改写：选中页面元素后提交修改意见，再应用到 DeckIR。
- QA 检查：输出静态检查结果，辅助发现布局和渲染问题。
- 模型配置：支持 mock 模式和 OpenAI-compatible 接口。

## 配置模型

DeckForge 可以在没有模型 key 的情况下使用 mock 模式体验流程。要连接 Mimo 或其他 OpenAI-compatible 服务，请在应用右上角打开模型设置：

- `mode`: `openai-compatible`
- `baseUrl`: `https://api.xiaomimimo.com/v1`
- `model`: `mimo-v2.5`
- `authHeader`: `api-key`

API key 只应保存在本机环境或应用本地配置里，不要提交到 GitHub。仓库里的 `.env.example` 只保留占位配置。

## 从源码运行

需要 Node.js、npm 和 pnpm。没有全局 pnpm 时，可以使用固定版本：

```powershell
npm exec --yes pnpm@11.8.0 -- install
```

启动本地 API 和 Web 工作台：

```powershell
npm exec --yes pnpm@11.8.0 -- dev
```

分别启动：

```powershell
npm exec --yes pnpm@11.8.0 -- dev:api
npm exec --yes pnpm@11.8.0 -- dev:web
npm exec --yes pnpm@11.8.0 -- dev:desktop
```

构建和检查：

```powershell
npm exec --yes pnpm@11.8.0 -- typecheck
npm exec --yes pnpm@11.8.0 -- build
```

打包 Windows 安装包：

```powershell
npm exec --yes pnpm@11.8.0 -- package:win
```

打包产物会生成在本机 `dist/desktop/`，不会提交进源码仓库。

## 当前限制

- v0.1.0 是早期 MVP，复杂版式和长材料仍需要人工复核。
- Windows 安装包暂未签名，首次运行可能出现系统安全提示。
- PPTX 导出以可编辑草稿为目标，不保证完全复刻人工设计模板。
- 默认本地运行，不包含多人协作、云端账号体系或 PowerPoint 插件。

---

## Quick Download

DeckForge v0.1.0 ships two Windows builds:

- `DeckForge-Setup-0.1.0.exe`: recommended installer.
- `DeckForge-Portable-0.1.0.exe`: portable app, no installation required.
- `SHA256SUMS.txt`: checksums for verifying downloaded files.

The app is currently unsigned, so Windows may show a SmartScreen warning. Continue only after confirming the file comes from this repository's Release page.

## What Is DeckForge

DeckForge helps you turn local source materials into presentation drafts. It reads a local folder or uploaded files, generates a structured DeckIR, then exports HTML previews, PPTX files, and QA reports.

It is designed for local personal use, internal material preparation, and early workflow validation. It is not a hosted cloud product.

## Getting Started

1. Open the [v0.1.0 Release](https://github.com/AvonLyn/deckforge/releases/tag/v0.1.0).
2. Download `DeckForge-Setup-0.1.0.exe` or `DeckForge-Portable-0.1.0.exe`.
3. Launch DeckForge.
4. Select a material folder or upload files.
5. Adjust slide count, language, tone, and prompt.
6. Generate a deck, review the preview, add targeted comments, and export HTML or PPTX.

## Features

- Local material ingestion from folders or browser uploads.
- Structured DeckIR workflow for repeatable generation and export.
- HTML preview for layout and content review.
- Editable PPTX export.
- Comment-to-revision flow for selected slide elements.
- QA output for static layout and render checks.
- Mock mode and OpenAI-compatible model settings.

## Model Settings

DeckForge can run in mock mode without an API key. To use Mimo or another OpenAI-compatible endpoint, open model settings in the app:

- `mode`: `openai-compatible`
- `baseUrl`: `https://api.xiaomimimo.com/v1`
- `model`: `mimo-v2.5`
- `authHeader`: `api-key`

Keep real API keys in your local environment or app settings. Never commit them to GitHub. `.env.example` contains placeholders only.

## Build From Source

Install dependencies:

```powershell
npm exec --yes pnpm@11.8.0 -- install
```

Run the local API and Web workspace:

```powershell
npm exec --yes pnpm@11.8.0 -- dev
```

Run individual apps:

```powershell
npm exec --yes pnpm@11.8.0 -- dev:api
npm exec --yes pnpm@11.8.0 -- dev:web
npm exec --yes pnpm@11.8.0 -- dev:desktop
```

Validate and build:

```powershell
npm exec --yes pnpm@11.8.0 -- typecheck
npm exec --yes pnpm@11.8.0 -- build
```

Package Windows builds:

```powershell
npm exec --yes pnpm@11.8.0 -- package:win
```

Build artifacts are written to local `dist/desktop/` and are not committed to the source repository.

## Limitations

- v0.1.0 is an early MVP; complex decks and long materials still need human review.
- Windows builds are unsigned.
- PPTX output is intended as an editable draft, not a pixel-perfect design clone.
- There is no multi-user collaboration, hosted account system, or PowerPoint add-in yet.
