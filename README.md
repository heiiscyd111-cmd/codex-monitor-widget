# Codex Monitor

Windows 与 macOS 上的 Codex Plus 用量与对话状态悬浮小组件。

## 功能

- 本周额度、重置时间和倒计时
- 5 小时额度、当前窗口和倒计时
- 当日 Token 使用量
- 本周额度悬浮详情：今日 Token、本额度周期 Token、各模型 Token 明细
- 后续 5 小时预测窗口
- 对话运行时绿灯、完成后灰灯
- 随 Codex 显示并悬浮在 Codex 上方
- 订阅状态显示

## 实机效果

### 主界面

![Codex Monitor 主界面](docs/images/widget-main-svg-v2.png)

### 主界面与预测浮窗

![Codex Monitor 主界面与后续预测浮窗](docs/images/widget-forecast-svg-v2.png)

### 本周用量悬浮窗

![Codex Monitor 本周 Token 与模型用量](docs/images/widget-weekly-usage-v1.0.5.png)

## 界面说明

- **本周额度**：显示剩余百分比、重置日期和倒计时；鼠标悬停后显示今日 Token、本额度周期 Token，以及各模型 Token 明细。
- **5 小时额度**：显示当前窗口、剩余比例和重置倒计时；鼠标悬停后显示当天后续预测窗口。
- **状态灯**：绿色表示有 Codex 对话正在生成或执行工具，灰色表示当前没有任务运行。
- Token 与模型统计来自本机 Codex 日志；内部审核模型不会计入模型明细。

## 下载哪个版本？

请从仓库右侧 **Releases** 下载，不要下载 GitHub 自动生成的 “Source code”。

### Windows x64 便携版

`CodexMonitor-vX.Y.Z-Windows-x64-Portable.zip`

- 内置 Electron 运行环境
- 不需要 Node.js 或 npm
- 解压后双击 `CodexMonitor.exe`

### macOS 内部试用版

- Apple Silicon：`CodexMonitor-vX.Y.Z-macOS-arm64.zip`
- Intel：`CodexMonitor-vX.Y.Z-macOS-x64.zip`
- 内置 Electron，不需要 Node.js 或 npm
- 当前未签名，首次运行需要在“系统设置 → 隐私与安全性”中手动允许

### 轻量源码版

`CodexMonitor-vX.Y.Z-Source.zip`

- 不内置 Electron
- 需要 Node.js 22.12 或更高版本
- 解压后运行：

```powershell
npm install
npm start
```

## Windows 前置条件

1. Windows 10/11 64 位。
2. 已安装 Windows 版 Codex Desktop。
3. 已在 Codex 中登录自己的 ChatGPT/Codex 账户。
4. 至少启动过一次 Codex。
5. 不需要 OpenAI API Key。

> 没有安装并登录 Codex Desktop 时，小组件无法获得真实额度和对话状态。

## Windows 使用

1. 下载 Portable ZIP。
2. 完整解压到固定文件夹，不要在 ZIP 内直接运行。
3. 双击 `CodexMonitor.exe`。
4. 系统托盘图标右键可以刷新、显示/隐藏或退出。

首次运行后会登记为 Windows 登录启动项，可在“Windows 设置 → 应用 → 启动”关闭。

## macOS 前置条件与使用

1. macOS 14 或更高版本。
2. 安装并登录 Codex 桌面应用；或通过 Homebrew 安装并登录 Codex CLI。
3. 下载与处理器匹配的 ZIP，解压后将 `CodexMonitor.app` 移到“应用程序”。
4. 首次启动若被阻止，在“系统设置 → 隐私与安全性”中选择“仍要打开”。
5. 左键点击菜单栏图标，通过菜单显示/隐藏、刷新或退出。

桌面应用存在时，小组件优先使用其内置 CLI，并支持 Codex 启动检测和前台悬浮。仅安装 Homebrew CLI 时仍可读取额度和本地任务状态，但不提供桌面应用联动与 `codex://` 跳转。完整说明见 [macOS 中文使用说明](USAGE.macOS.zh-CN.txt)。

## 状态灯

- 绿色：至少有一个可见 Codex 对话正在生成或执行工具。
- 灰色：当前没有对话运行。
- 仅打开 Codex、切换窗口或内部审批检查不会点亮。

## 隐私

小组件只读取本机 Codex 状态数据库和日志，用于显示额度、Token 与运行状态。不会上传对话、账号或额度数据，也没有自建网络服务。

## 校验下载

每个 Release 包含 `SHA256SUMS.txt`：

```powershell
Get-FileHash .\CodexMonitor-vX.Y.Z-Windows-x64-Portable.zip -Algorithm SHA256
```

```bash
shasum -a 256 CodexMonitor-vX.Y.Z-macOS-arm64.zip
```

## 干净电脑验证

建议使用 Windows Sandbox 或全新 Windows 虚拟机：

1. 不安装 Node.js。
2. 安装并登录 Codex Desktop。
3. 下载、解压 Portable ZIP。
4. 运行 `CodexMonitor.exe`。
5. 检查额度、倒计时和 Token。
6. 发起对话确认绿灯，等待完成确认变灰。
7. 检查悬浮窗、托盘和开机启动。

macOS 还需在真实 Apple Silicon 机器验证完整桌面模式和 CLI-only 模式；Intel 包由 Intel runner 完成架构与启动检查。

GitHub Actions 会构建 Windows x64、macOS arm64、macOS x64 和一个源码包；Codex 登录和完整桌面交互仍需实机验证。

## 从源码构建

```powershell
npm ci
npm run check
npm run build:release
```

输出位于 `dist\`。

macOS：

```bash
npm ci
npm run check
npm run build:mac -- --arch=arm64
```

## 已知限制

- 支持 Windows x64，以及 macOS 14+ 的 Apple Silicon 和 Intel。
- Windows 尚未进行商业代码签名，首次运行可能出现 SmartScreen 提示。
- macOS 内部试用包未签名和公证：首次运行需手动信任，任务完成系统通知不可用，登录自启动仅尽力设置。
- Codex Desktop 更新本地数据结构后可能需要同步适配。

## 商用

本项目允许在遵守 MIT License 的前提下用于商业项目。商用分发必须保留许可证和版权声明，不得冒充 OpenAI/Codex 官方产品；OpenAI、ChatGPT、Codex 等第三方名称与标识不包含在本项目的 MIT 授权中。

完整要求请阅读：[商用要求](COMMERCIAL_USE.md)

## License

[MIT](LICENSE)
