# Mihomo UI（独立产品线）

这是与 Qproxyhub 分离的第二条产品线，目标是做一个本地 `mihomo + UI` 控制台。

当前版本：`v0.1.0-mvp`

## 已实现（MVP）

- 本地 Web 控制台（默认 `http://127.0.0.1:8877`）
- 保存运行配置（mihomo 路径、配置路径、控制器端口、secret）
- 一键生成最小 `mihomo` 配置（含 external-controller 与 secret）
- 启动 / 停止 mihomo 进程
- 查看进程状态和日志尾部
- 读取代理组并手动切换节点
- 连接自检（自动给出端口/进程/controller 建议）

## 快速开始

### 方式 1：双击启动

双击：

```text
启动-MihomoUI.bat
```

### 方式 2：PowerShell 启动

```powershell
cd D:\Xcode\20260423_Qproxyhub\mihomo-ui
powershell -ExecutionPolicy Bypass -File .\start-mihomo-ui.ps1
```

### 方式 3：Node 启动

```powershell
cd D:\Xcode\20260423_Qproxyhub\mihomo-ui
node .\server.mjs
```

## 运行要求

- Windows 10/11
- Node.js 24+
- mihomo 内核（默认路径可在 UI 中修改）

## 目录结构

```text
mihomo-ui/
├─ data/
│  ├─ ui-config.json
│  └─ mihomo-minimal.yaml
├─ web/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ server.mjs
├─ start-mihomo-ui.ps1
├─ 启动-MihomoUI.bat
└─ package.json
```

## 说明

- 这是“最小可用版”，重点是先跑通主流程。
- 下一阶段可继续加：订阅导入、规则编辑、延迟测速、托盘驻留、自动启动等。
- 如果你想体验官方 UI，请看：`../mihomo-ui-official-host/README.md`
