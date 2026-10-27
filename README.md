# dsh-rea-toggle

[English](README.en.md) · **简体中文**

**给 DeepSeek Harness 里的 REA MCP 服务器一个图形开关。** 做逆向时打开它的 ~229 个 `mcp__rea__*` 工具，不做的时候关掉 —— 不用改 YAML，也不用让无关对话替这些工具付上下文开销。

<p align="center">
  <img src="icon.svg" width="72" alt="">
</p>

```
● REA 已开     ← 注册 229 个工具，每个请求都带 schema
● REA 已关     ← 一个都不注册，无关对话零负担
```

---

## 问题

[REA](https://github.com/morluto/rea) 会在宿主上注册 **229 个工具**（`mcp__rea__*`）。工具定义属于每次请求的系统提示，不管你调不调它。

实测数据（`rea-agents@6.8.0`，取服务器自己 `tools/list` 的返回）：

| 测量项 | 数值 |
|---|---|
| `tools/list` 返回的工具数 | 229 |
| 工具 `name` + `description` 总字符 | 139,502 |
| 粗略 token 估算（`字符 ÷ 3.5`） | **≈ 40,000 token** |

这只是**描述文本**，完整 JSON Schema 还要更多 —— 其中一部分已经被 REA 自己的 `REA_MCP_INPUT_SCHEMA_PROFILE=compact` 压过了。不同 tokenizer、宿主版本、schema profile 会让数字浮动，量级不会变。

做逆向时，4 万 token 的工具面很划算。写个视频脚本时，这就是关不掉的死重。

## 为什么 REA 自己不提供这个开关

对着 `rea-agents@6.8.0` 实测：

```console
$ rea mcp --help
rea mcp — Register as MCP server

Commands:
  add     Register as MCP server
  doctor  Validate MCP server startup and tool listing
```

只有 `add` 和 `doctor`。**没有 `remove`、没有 `disable`、没有 enable、没有工具过滤。** `rea mcp add --agent <claude-code|cursor|…>` 干的事只是往某个客户端配置里**写一行**；REA 内部任何东西都无法在运行时注销自己的工具。

这是结构性的，不是疏漏：**MCP 服务器无法注销自己。** 工具之所以存在，是宿主启动了它并要了 `tools/list`。只有宿主能决定不要。

而宿主侧的 `@deepseek-ai/dsh-mcp-client` 也没有包含性过滤字段：

```
transport · serverName · command · args · env · cwd
toolCallTimeoutMs · failOnStartupError · maxInstructionBytes · reconnect
```

所以开关只能放在 loader patch 里 —— 那是唯一能说"这一行别启动"的地方。本插件就只拥有那一个标志位。

## 它做什么

它翻的是**一个键** —— `disabled`，作用在 profile patch 的**一行**上：

```yaml
# <DSH_HOME>/profiles/<profile>/cordis.patch.yml
- insert:
    - id: rea-mcp
      disabled: true          # ← 只动这个
      name: "@deepseek-ai/dsh-mcp-client"
      config: { … }
```

- 除该文件外不读别的，写也只在那个标志位。
- 不碰 `~/.dsh/plugins/rea-agents`，不卸载 REA，不改任何二进制。
- 再点一下即还原。

## 安装

### 环境要求

| 组件 | 实测版本 |
|---|---|
| DeepSeek Harness | 0.2.1-rc.3（桌面版） |
| REA（`rea-agents`） | 6.8.0 |
| Node.js | ≥ 20 |
| 一行能拉起 REA 的 `mcp-client` 行 | 例如 `id: rea-mcp` |

**前提是 REA 已在 DSH 里跑通。** 本插件不负责装 REA。

### 方式 A —— 从 GitHub 装

```powershell
dsh plugin --profile "$env:DSH_PROFILE" add github:phoushen/dsh-rea-toggle
```

命令行里没有 `dsh` 就走方式 B。

### 方式 B —— 手动

```powershell
$home_ = "$env:USERPROFILE\.dsh"
Copy-Item .\dsh-rea-toggle "$home_\plugins\dsh-rea-toggle" -Recurse
Copy-Item .\dsh-rea-toggle "$home_\profiles\desktop\node_modules\dsh-rea-toggle" -Recurse
```

然后改 profile 清单，**两处都要**：

```jsonc
// <DSH_HOME>/profiles/desktop/package.json
{
  "dependencies": { "dsh-rea-toggle": "file:../../plugins/dsh-rea-toggle" },
  "dsh": { "profile": { "bundles": [ "...", "dsh-rea-toggle" ] } }
}
```

**完全退出** DeepSeek Harness（含托盘）再启动。

### 验证

输入框左边会出现小开关。点它，或者直接打端点：

```powershell
Invoke-RestMethod http://127.0.0.1:<WEB_PORT>/rea-toggle/status
# {"ok":true,"path":"…\\cordis.patch.yml","rowLine":75,"disabled":false,"enabled":true}
```

## 使用

| 动作 | 做法 |
|---|---|
| 关闭 | 点开关，或 `POST /rea-toggle/set {"enabled":false}` |
| 开启 | 点开关，或 `POST /rea-toggle/set {"enabled":true}` |
| 看状态 | 鼠标悬停，或 `GET /rea-toggle/status` |

**标志位是立刻写盘的；工具集合在下次启动时才变。** 重启才是那 4 万 token 真正消失的时刻。

### 不走 GUI 也行

```powershell
# 1. 端点
Invoke-RestMethod http://127.0.0.1:<PORT>/rea-toggle/set -Method POST `
  -ContentType 'application/json' -Body '{"enabled":false}'

# 2. 自己改那一行，效果一样
#    - id: rea-mcp
#      disabled: true
```

## 配置

可选，加在本插件自己那行上：

```yaml
- insert:
    - id: dsh-rea-toggle
      name: dsh-rea-toggle
      config:
        targetId: rea-mcp        # 要翻 disabled 的那一行的 id
        routePrefix: /rea-toggle # 端点前缀
```

REA 那行不叫 `rea-mcp` 就设 `targetId`。多服务器：一个目标一行插件，`routePrefix` 各自不同。

## 这个插件不是什么

- 不是 REA 的包装、分支或补丁。它从不读 REA 的代码或版本。
- 不是工具过滤器。`dsh-mcp-client` 没有包含性字段，所以"只留 20 个常用工具"在这里做不到 —— 要么 229 个，要么 0 个。
- 不是安装器。它不会去下 REA、Ghidra、JDK、adb 或 JADX。
- 不是安全绕过。它翻的是你自己本来就拥有的一个 YAML 键。
- 不是 token 计数器。≈4 万这个数字是从 REA 自己的 `tools/list` 估的，你在意就自己量。

## 安全

两个端点只接受 `GET /status` 和 `POST /set`，只监听宿主自己的回环 Web 端口，`POST` 的 `Origin` 主机与请求 `Host` 不一致直接 403，body 上限 64 KiB。不向网络暴露任何东西。

插件只写一个路径 —— `<DSH_HOME>/profiles/<profile>/cordis.patch.yml` —— 且只写目标行里的 `disabled` 那一行。

## 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| 输入框旁没有开关 | client 半在启动时没被扫描到 | 完全退出宿主（含托盘）再开 |
| 显示 `REA ?` | 端点不通或找不到目标行 | 悬停看提示；查 `/rea-toggle/status` |
| `row "rea-mcp" not found` | 你的 REA 行 id 不同 | 设 `config.targetId` |
| 关了之后工具还在 | 工具注册发生在启动时 | 重启宿主 |
| 改 `disabled` 没反应 | 这个 profile 里没有拉起 REA 的 `mcp-client` 行 | 那不是开关的问题，先查 REA 安装 |

## 许可

MIT，见 [LICENSE](LICENSE)。

REA 本身是 MIT，仓库在 <https://github.com/morluto/rea>。DeepSeek Harness 是独立产品；本插件非官方，与上述两个项目均无隶属关系。
