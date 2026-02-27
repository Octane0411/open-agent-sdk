# Benchmark - Harbor Adapter

Open Agent SDK 的 Harbor 框架适配器，用于运行 Terminal-bench 等 benchmark。

## 结构

```
benchmark/
└── harbor/
    ├── agent.py                      # Harbor BaseInstalledAgent 实现
    ├── install-open-agent-sdk.sh.j2  # 安装脚本模板
    └── README.md                     # 本文档
```

## 安装

### 1. 安装 Harbor

```bash
pip install harbor
```

要求：Python >= 3.12

### 2. 注册 Agent

```bash
# 找到 Harbor agents 目录
python -c "import harbor; print(harbor.__path__[0])"

# 创建符号链接（推荐开发时使用）
ln -s /Users/wangruobing/Personal/coworkProject/open-agent-sdk/benchmark/harbor/agent.py \
  $(python -c "import harbor; print(harbor.__path__[0])")/agents/installed/open_agent_sdk.py
```

## 运行 Terminal-bench

### MiniMax (Anthropic 兼容端点)

```bash
# 设置 MiniMax 认证信息
export ANTHROPIC_AUTH_TOKEN="sk-api-..."
export ANTHROPIC_BASE_URL="https://api.minimaxi.com/anthropic/v1"

# 完整 benchmark
harbor run -d terminal-bench@2.0 \
  --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
  --model MiniMax-M2.5 \
  --n-concurrent 4
```

### Google Gemini

```bash
# 设置 API Key
export GEMINI_API_KEY="..."

# 完整 benchmark
harbor run -d terminal-bench@2.0 \
  --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
  --model gemini-2.0-flash \
  --n-concurrent 4
```

### OpenAI

```bash
# 设置 API Key
export OPENAI_API_KEY="..."

# 完整 benchmark
harbor run -d terminal-bench@2.0 \
  --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
  --model gpt-4o \
  --n-concurrent 4
```

### Anthropic Claude

```bash
# 设置 API Key
export ANTHROPIC_API_KEY="..."

# 完整 benchmark
harbor run -d terminal-bench@2.0 \
  --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
  --model claude-sonnet-4-20250514 \
  --n-concurrent 4
```

## 单任务测试

```bash
harbor jobs start \
  --path examples/tasks/hello-world \
  --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
  --model MiniMax-M2.5
```

## 工作原理

```
Host 机器 (运行 harbor 命令)
    ↓ 读取环境变量 (ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL 等)
Agent 代码 (create_run_agent_commands)
    ↓ 通过 ExecInput.env 传递环境变量
沙箱容器 (隔离环境)
    ↓ 安装脚本从 npm 安装 @open-agent-sdk/cli
    ↓ 运行全局 oas 命令
    ↓ 使用 API key 调用 LLM API
```

## 安装方式变更（v0.1.0-alpha.1+）

从 v0.1.0-alpha.1 开始，Harbor adapter 使用 npm 包安装方式：

**优势：**
- ✅ 安装速度快（~10秒 vs ~60秒）
- ✅ 可靠性高（npm registry 稳定）
- ✅ 适配 Daytona 环境
- ✅ 减少超时风险

**工作流程：**
1. 安装脚本通过 `bun add -g @open-agent-sdk/cli` 全局安装
2. CLI 自动安装依赖 `open-agent-sdk` 核心包
3. Agent 直接调用 `oas` 命令

## 支持的模型

| Provider | 环境变量 | 示例模型 |
|---------|---------|---------|
| MiniMax | `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` | MiniMax-M2.5 |
| Google | `GEMINI_API_KEY` | gemini-2.0-flash |
| OpenAI | `OPENAI_API_KEY` | gpt-4o |
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514 |

## 提交 Leaderboard

运行完成后联系 terminal-bench maintainers：
- alex@laude.org
- mikeam@cs.stanford.edu

## 参考

- [Terminal-bench](https://www.tbench.ai/leaderboard/terminal-bench/2.0)
- [Harbor Framework](https://harborframework.com/)
