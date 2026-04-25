<div align="center">
  <img src="./docs/assets/banner.svg" alt="Qproxyhub Banner" width="100%" />

# Qproxyhub

本地代理测试与导出工作台（独立产品线）

<p>
  <a href="https://github.com/hnsxyren1023-commits/Qproxyhub/releases">
    <img src="https://img.shields.io/badge/下载-Releases-b7791f?style=for-the-badge" alt="下载 Releases" />
  </a>
  <a href="https://github.com/hnsxyren1023-commits/Qproxyhub">
    <img src="https://img.shields.io/badge/平台-Windows%2010%2F11-2563eb?style=for-the-badge" alt="平台 Windows 10/11" />
  </a>
  <a href="https://github.com/hnsxyren1023-commits/Qproxyhub">
    <img src="https://img.shields.io/badge/运行环境-Node.js%2024%2B-16a34a?style=for-the-badge" alt="运行环境 Node.js 24+" />
  </a>
</p>
</div>

---

## 产品线说明

- 本仓库是独立的 `Qproxyhub` 产品线，专注代理连通性测试、复测与导出。
- `mihomo + UI` 已拆分到独立仓库：[`MihomoUI`](https://github.com/hnsxyren1023-commits/MihomoUI)。

---

## 核心能力

- 支持协议：`socks5`、`http`、`hy2`、`vless`、`vmess`
- 单条即时反馈，测试过程中可实时看到通过/失败变化
- 全局进度、当前节点、失败原因同步展示
- 结果表格支持排序、筛选、单选/多选复制
- 支持“重试失败项”“历史任务复测”
- 导出支持：原始链接 `TXT`
- 导出支持：表格数据 `CSV / JSON`
- 导出支持：客户端配置 `mihomo / Clash Verge / v2rayN / NekoBox`

---

## 界面预览

<div align="center">
  <img src="./docs/assets/screen-home.svg" alt="首页预览" width="100%" />
</div>

<div align="center">
  <img src="./docs/assets/screen-results.svg" alt="结果预览" width="100%" />
</div>

<div align="center">
  <img src="./docs/assets/screen-export.svg" alt="导出与历史预览" width="100%" />
</div>

---

## 快速开始

### 1) 下载

前往 [Releases](https://github.com/hnsxyren1023-commits/Qproxyhub/releases) 下载：

- `Qproxyhub-v0.1.1-portable.zip`（推荐）
- `Qproxyhub.exe`（单文件启动器）

### 2) 启动

- 双击 `Qproxyhub.exe`
- 或双击 `Qproxyhub-启动.bat`
- 或用 PowerShell 执行：

```powershell
powershell -ExecutionPolicy Bypass -File "D:\Xcode\20260423_Qproxyhub\start-proxy-tester.ps1"
```

启动成功后访问：

```text
http://127.0.0.1:8866/
```

---

## 运行要求

- Windows 10 / 11
- Node.js 24+
- 可用的 mihomo 内核

默认检测路径：

```text
C:\Program Files\nodejs\node.exe
C:\Program Files\mihomo-windows-amd64-v1.19.24\mihomo-windows-amd64.exe
```

---

## 推荐参数

- 超时：`8秒` 或 `12秒`
- 并发：`1`

这样更接近人工单条直测，能减少并发压测导致的假失败。

---

## 目录结构

```text
Qproxyhub/
├─ docs/
│  └─ assets/
├─ release/
├─ tools/
├─ web/
│  ├─ index.html
│  └─ assets/
│     ├─ app.js
│     └─ styles.css
├─ server.mjs
├─ start-proxy-tester.ps1
├─ Qproxyhub-启动.bat
├─ 使用方法.txt
├─ CHANGELOG.md
└─ README.md
```

---

## 文档

- [使用方法](./使用方法.txt)
- [故障排查](./docs/故障排查.md)
- [更新日志](./CHANGELOG.md)
- [许可证](./LICENSE)
