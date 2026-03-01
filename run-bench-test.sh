#!/bin/bash
set -euo pipefail

# Terminal-bench 测试脚本
# 使用 open-agent-sdk 运行 2 个真实任务

echo "🚀 Open Agent SDK - Terminal-bench 测试"
echo "========================================"
echo ""

# 0. 加载 .env 文件
if [ -f .env ]; then
    echo "📝 加载 .env 文件..."
    # 使用 set -a 自动 export 所有变量
    set -a
    source .env
    set +a
    echo "✅ .env 文件已加载"
    echo ""
else
    echo "❌ .env 文件不存在"
    exit 1
fi

# 取消 SOCKS 代理（Harbor 连接 Supabase 时会出错）
# HTTP/HTTPS 代理保留，因为可能需要访问外网
unset all_proxy
unset ALL_PROXY
echo "⚙️  已禁用 SOCKS 代理（Harbor 需要直连 Supabase）"
echo ""

# 1. 检查环境
echo "📋 检查环境..."

if ! command -v harbor &> /dev/null; then
    echo "❌ Harbor 未安装，请先安装: https://harborframework.com/docs/getting-started"
    exit 1
fi
echo "✅ Harbor: $(harbor --version 2>&1 | head -n1 || echo 'installed')"

if ! docker ps &> /dev/null; then
    echo "❌ Docker 未运行，请启动 Colima: colima start"
    exit 1
fi
echo "✅ Docker: running"

# 2. 检查 API keys（MiniMax Anthropic 格式）
if [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ]; then
    echo ""
    echo "⚠️  ANTHROPIC_AUTH_TOKEN 未设置"
    echo "请加载 .env 文件:"
    echo "  source .env"
    exit 1
fi

if [ -z "${ANTHROPIC_BASE_URL:-}" ]; then
    echo ""
    echo "⚠️  ANTHROPIC_BASE_URL 未设置"
    echo "请加载 .env 文件:"
    echo "  source .env"
    exit 1
fi

echo "✅ ANTHROPIC_AUTH_TOKEN: ${ANTHROPIC_AUTH_TOKEN:0:10}..."
echo "✅ ANTHROPIC_BASE_URL: ${ANTHROPIC_BASE_URL}"

echo ""
echo "========================================"
echo ""

# 3. 跳过 oracle baseline（直接测试 open-agent-sdk）
echo "⏭️  跳过 oracle baseline，直接测试 open-agent-sdk"
echo ""

# 4. 运行 open-agent-sdk（2 个任务，使用 MiniMax）
echo "🤖 运行 open-agent-sdk (2 个任务)"
echo ""
echo "Provider: MiniMax (Anthropic 兼容格式)"
echo "模型: MiniMax-M2.5"
echo "任务数量: 2 (串行执行)"
echo ""

harbor run -d terminal-bench@2.0 \
  --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
  --model MiniMax-M2.5 \
  -l 2 \
  -n 1

echo ""
echo "========================================"
echo "✅ 测试完成！"
echo ""
echo "📊 查看结果:"
echo "  harbor list"
echo ""
echo "💾 导出 trajectory:"
echo "  # 在任务完成后，trajectory 会自动保存在 session 中"
echo "  # 可以通过 --save-trajectory 导出"
