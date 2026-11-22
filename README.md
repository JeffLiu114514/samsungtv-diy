# Samsung TV DIY — 实测记录与工具

一台 2026 年三星 Tizen 电视的实测笔记：能拿到什么权限、怎么拿到、哪里是硬墙。所有结论都来自实机操作，不是推测。

如果你有一台同代三星电视，想装自定义应用、跑自己的界面、弄清楚到底能不能 root，这份记录能让你少走我们走过的弯路。

---

## 1. 测试目标

| 项目 | 值 |
|---|---|
| 型号 | `UN65M70HAFXZA`（M70H，2026 款 Mini LED，65"） |
| 固件 | `T-KSU2EHAKUC-0100-1242.0` |
| Tizen 平台 | `10.0`（product `4.0`） |
| 架构 | `armv7` / 32 位（`core_abi: arm_32`） |
| SDB 守护插件 | `3.8.12_TV_REL`（`sdbd_version: 2.2.31`） |
| DUID | `KLCLFXOSNREWG` |

> 这一代 M 系列与 `UN50M75HAGXZD`（M75H）同平台、同 Tizen 版本、同 SDB 插件版本，后者的 root 结果可作为参考。

## 2. 快速开始：建立 SDB 连接

电视端：

1. 设置 → 网络，记下电视的局域网 IP。
2. 打开 Apps（应用）面板 → 底部 App Settings（应用设置）。
3. 用遥控器数字键输入 `12345`。
4. 弹出开发者模式配置：**Developer mode 打开**，**Host PC IP 填这台电脑的局域网 IP**（不是电视 IP）。
5. 重启电视。

电脑端（只要一个 3 MB 的 SDB，不需要完整 Tizen Studio）：

```bash
sdb connect <电视IP>:26101
sdb devices                    # 应该看到 <电视IP>:26101  device
sdb -s <电视IP>:26101 capability
sdb -s <电视IP>:26101 shell 0 vd_applist
```

`capability` 会告诉你这台电视实际开放了什么，比任何文档都准。本机结果见 [docs/capability.txt](docs/capability.txt)。

### 已知坑

- **`sdb shell` 不带 `0` 会直接打印 `closed`**。`0` 是 sdbd 的固定命令分发器，不是 root，也不是 shell。
- **电视进待机后 SDB 会拒连**（`failed to connect`），但 8001 端口的 REST API 仍可能响应。装应用前先确认电视是亮的。
- **同一时刻只能有一个 SDB 客户端**。如果某个工具占着连接，另一个会连不上；换工具前先 `sdb kill-server`。
- **Windows 下 `sdb push` 的远端路径会被路径转换破坏**：`/home/owner/...` 会变成 `C:/Users/owner/...` 然后失败。加 `MSYS_NO_PATHCONV=1` 并用 `//home/owner/...` 双斜杠。

## 3. 能做什么，不能做什么

这是本文档最重要的一节。请以这张表为准，不要相信"我记得有人做到过"。

| 能力 | 状态 | 依据 |
|---|---|---|
| 读取已安装应用清单 | ✅ | `sdb shell 0 vd_applist`，返回标题、版本、包名、大小、安装时间、使用次数 |
| 安装签名过的 WGT | ✅ | TizenBrew 已成功安装（`xvvl3S1bvH.TizenBrewStandalone`） |
| 通过 TizenBrew 安装第三方模块 | ✅ | 模块是纯 JS，不需要签名 |
| 卸载用户自己装的应用 | ⚠️ 部分 | `sdb uninstall <包名>` 对商店/自装应用可能成功 |
| 卸载电视预装应用 | ❌ | 实测返回 `can not uninstall app`（Hulu）。改用电视原生 应用 → 设置 → 删除 |
| 关闭指定应用的开机自启 | ❌ | 需要 shell 或设置写入权限，都没有 |
| 读 CPU / 内存 / 存储 | ⚠️ 仅整机 | 只能通过应用内 `tizen.systeminfo` API，见下文 |
| 读后台进程 / 按进程资源 | ❌ | Tizen Web API 无此接口，固件也不开放 `/proc` |
| 读系统日志 | ❌ | `log_enable: disabled` |
| 修改系统设置 / 替换 Home 键默认应用 | ❌ | 需要 root |
| root | ❌ | 见第 5 节，入口被固件关闭 |

### 关于"读性能"

Tizen 只暴露整机指标：

- `tizen.systeminfo.getTotalMemory()` / `getAvailableMemory()` — 字节
- `getPropertyValue('CPU')` — `load`，0.0–1.0
- `getPropertyValue('MEMORY')` — `status`，`NORMAL` / `WARNING`
- `getPropertyValue('STORAGE')` — `units[]`，含 `capacity` / `availableCapacity`

**没有任何接口能列出进程或按 PID 统计资源。** 想要"哪个应用占了多少内存"，在这个固件上做不到，别浪费时间找工具。

## 4. 装自定义应用：两条路

### 4.1 独立 WGT（需要签名，门槛高）

Tizen 7 之后所有包必须用三星证书重签，流程是：Samsung 账号 → 作者证书 → 分发证书（含设备 DUID）→ 签名 → 安装。

`118, -12 Check certificate error` 是这条路上最常见的失败，含义是电视在签名校验环节拒绝了包。同一份包在不同电视上结果可能不同，属于设备端行为。

本机实测：通过 [TizenBrew Installer](https://github.com/reisxd/TizenBrewInstaller) 安装官方包**成功**，安装自己打包的 WGT **持续失败于 118**。结论：**侧载通路是通的，但自建包不一定过签**。

### 4.2 TizenBrew 模块（推荐，不需要签名）

[TizenBrew](https://github.com/reisxd/TizenBrew) 装到电视上之后，可以安装第三方模块。模块是纯 JS，由 TizenBrew 进程加载，**完全绕开签名问题**。

安装方式：在电视的 TizenBrew 里选 Install from GitHub，输入 `用户名/仓库名`。

### 已知故障：TizenBrew 的 Settings 页在本机打不开

点齿轮会跳到 `file:///tizenbrew-ui/dist/index.html/settings`，返回 `ERR_ACCESS_DENIED`（Tizen 10 拒绝这种路径式路由）。后果是**模块安装入口不可用**，TizenBrew 内部只能跑空列表。

绕开办法：优先装**独立 WGT 版**，不依赖 TizenBrew 模块系统。例如 TizenTube：

```
TizenTubeCobalt.wgt                          Tizen 6+（推荐）
TizenTubeCobaltTizenTubeProxyAddress.wgt     同上，但代理地址写成主机名 tizentube
TizenTubeOld.wgt                             Tizen 3/4/5/5.5
```

来源：<https://github.com/reisxd/TizenTube/releases>。本机实测 `TizenTubeCobalt.wgt`（v2.1.1，1.48 MB）安装成功。

### Jellyfin 的情况

`jellyfin/jellyfin-tizen` 没有发布 WGT，`GlenLowland/jellyfin-tizen-npm-publish` 只有 npm 包（模块形态）。在 Settings 页坏掉时**装不了**。可选：修 TizenBrew 路由、自己用 Tizen Studio 构建 WGT、或直接用电视自带 Browser 打开 Jellyfin Web 界面。

### 4.3 TizenBrew Installer 的本地服务

TizenBrew Installer 是个本地网页服务（`localhost:8091`），不需要管理员权限。两个坑：

- **HOME 要可写**。默认往 `C:\Users\<你>\share\.samsung-cert` 写证书；如果运行环境限制写入，会报 `EPERM ... mkdir`。把 `HOME` / `USERPROFILE` / `TMP` / `TEMP` 指到一个可写目录即可。
- **它的黑色控制台窗口关掉，服务就停了**，页面会变成"无法访问此页面"。
- 页面必须是完整路径 `http://localhost:8091/ui/dist/index.html`，根路径返回 404。

## 5. Root：这条路被封了

[Tizen root 工具](https://github.com/chris-ritsen/samsung-tv-root)（v0.0.13）的所有路线都从同一个入口进去：`SVE-2025-50109` 的 SDB 包名注入。

在本机的探测结果：

```
SDB is connected, but package-name shell execution was not confirmed:
the TV closed both requests immediately (control 0.032s, 2s delay probe 0.015s).
This firmware's SDB daemon appears to refuse the SVE-2025-50109
package-name injection, which every root route in this tool starts from.
```

**0.03 秒内关闭请求，payload 根本没开始执行。** 工具本身明确说明：换 runtime、换型号配置都不会改变这个结果。

与该工具兼容表中记录的 `UN50M75HAGXZD`（Tizen 10.0 / `3.8.12_TV_REL`）完全一致 —— 那台也是被拒。

同时 `capability` 里这几项全部为 `disabled`：

```
intershell_support: disabled
sdbd_rootperm: disabled
rootonoff_support: disabled
log_enable: disabled
```

### 所以最大权限边界是

> **应用层。** 你能安装应用、安装 TizenBrew 模块、跑自己的 Web 界面、读整机性能指标。
>
> 你**不能**：改系统设置、禁用后台服务、读进程、替换 Home 键、刷固件、删预装应用（SDB 层面）。

想要真正的"深度优化"，只有两条出路：换电视原生设置（删应用、关自启动），或者让电视只当显示器、外接盒子/小电脑。

## 6. 本仓库的探针模块

本仓库根目录本身就是一个 TizenBrew 应用模块，读整机 CPU / 内存 / 存储，每 15 秒刷新（遥控器红色键也可刷新）。

```
├── package.json      # packageType: app, appPath: app/index.html
└── app/
    ├── index.html
    └── app.js
```

安装：在电视的 TizenBrew 里选 **Install from GitHub**，输入：

```
JeffLiu114514/samsungtv-diy
```

本地预览（不需要电视，用模拟数据看布局）：

```bash
python -m http.server 8766
# 浏览器打开 http://127.0.0.1:8766/app/index.html
```

> `app/index.html` 在没有 `tizen.systeminfo` 的环境里会显示"当前环境没有 tizen.systeminfo"，属于预期行为。

## 7. 安全提醒

- **开发者模式是一个活的攻击面**：`sdbd` 监听 26101，只信任白名单的那一个 IP。用完请关掉开发者模式。
- **不要把 26101 暴露到公网**。
- 证书密码、三星账号密码只应输入在官方本地窗口里，不要交给任何自动化工具或第三方。
- 本仓库不含任何破解、绕过签名或提权代码。

## 8. 已确认的应用清单

见 [docs/app-inventory-2026-11-22.json](docs/app-inventory-2026-11-22.json)（清单一览，字段来自 `vd_applist`）。

> 实测补充：**电视原生界面删除预装应用比 SDB 卸载有效得多**。同一台机器从 26 个应用减到 15 个，全部靠原生删除完成。

---

## 许可与免责

本记录为个人实测笔记，按现状提供，不构成任何保证。修改电视可能导致保修失效或系统不稳定，风险自负。请仅在你拥有的设备上操作。
