# Qproxyhub

> Local Proxy Testing Workbench  
> 本地代理测试与导出工作台

Qproxyhub 是一个面向本地使用场景的代理测试工具，专注于三件事：

- 批量测试代理链接是否可用
- 记录和复测历史结果
- 将筛选后的节点导出到不同客户端生态

当前版本优先面向 Windows 桌面环境，采用“本地服务 + 单页面 UI”的轻量架构，适合代理池初筛、手动复检、节点导出和日常维护。

## Features

### 中文

- 支持 `socks5`、`http`、`hy2`、`vless`、`vmess`
- 实时测试进度反馈，不需要等整批结束
- 失败项重试、全部重测
- 历史任务回看
- 结果表排序、筛选、勾选、多选复制
- 导出为 `TXT`、`CSV`、`JSON`
- 导出到 `mihomo`、`Clash Verge`、`v2rayN`、`NekoBox / Nekoray`
- Windows 本地启动，无需额外数据库

### English

- Supports `socks5`, `http`, `hy2`, `vless`, and `vmess`
- Real-time progress updates
- Retry failed entries or rerun full batches
- Persistent local history
- Sortable and filterable result table
- Export to TXT / CSV / JSON
- Export-ready outputs for `mihomo`, `Clash Verge`, `v2rayN`, and `NekoBox / Nekoray`

## Quick Start

### 1. Requirements

- Windows 10/11
- Node.js 24+
- Local `mihomo` core available at:
  `C:\Program Files\mihomo-windows-amd64-v1.19.24\mihomo-windows-amd64.exe`

### 2. Start

Open PowerShell and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-proxy-tester.ps1
```

Then visit:

```text
http://127.0.0.1:8866/
```

If you opened an older cached version before, press `Ctrl + F5` once.

## Usage

### 中文

1. 将代理链接按“每行一条”粘贴到输入框  
2. 选择超时和并发  
3. 点击“开始测试”  
4. 在页面中实时查看通过、失败、延迟和错误原因  
5. 根据结果进行复制、筛选、重试和导出  

推荐默认设置：

- 超时：`8 秒` 或 `12 秒`
- 并发：`1 条（更稳）`

对于同一供应商的一批节点，单并发通常更接近人工直测结果。

### English

1. Paste proxy links, one per line  
2. Choose timeout and concurrency  
3. Start the test  
4. Watch live updates in the browser  
5. Filter, copy, retry, and export the results  

Recommended defaults:

- Timeout: `8s` or `12s`
- Concurrency: `1`

## Export Targets

Qproxyhub currently supports:

- Raw link bundle (`TXT`)
- Structured exports (`CSV`, `JSON`)
- `mihomo` config export
- `Clash Verge` compatible config export
- Raw import bundle for `v2rayN`
- Raw import bundle for `NekoBox / Nekoray`

## Project Structure

```text
Qproxyhub/
├─ web/
│  ├─ index.html
│  └─ assets/
│     ├─ app.js
│     └─ styles.css
├─ server.mjs
├─ start-proxy-tester.ps1
├─ 使用方法.txt
└─ package.json
```

## Roadmap

- Multi-round testing and stability scoring
- Exit IP / ASN / location inspection
- Node asset library
- Better client-specific export templates
- Packaged desktop release

## Notes

- This repository is for the `Qproxyhub` product line only
- `mihomo + UI` will be maintained as a separate product line
- Runtime-generated files are intentionally excluded from version control

## Local Docs

- [使用方法.txt](./使用方法.txt)

