# Publishing to npm

本文档描述如何将 `open-agent-sdk` 和 `@open-agent-sdk/cli` 发布到 npm。

## 前置条件

1. **npm 账号**：需要有 npm 账号并登录
   ```bash
   npm login
   ```

2. **构建成功**：确保代码可以正常构建
   ```bash
   bun run build
   bun test
   ```

3. **版本号**：确认 package.json 中的版本号正确
   - 当前版本：`0.1.0-alpha.1`

## 发布步骤

### 1. 发布 Core 包

```bash
cd packages/core

# 构建
bun run build

# 检查将要发布的文件
npm pack --dry-run

# 发布到 npm
npm publish --access public
```

### 2. 发布 CLI 包

**重要**：CLI 包依赖 core 包，必须在 core 包发布后再发布。

```bash
cd packages/cli

# 检查将要发布的文件
npm pack --dry-run

# 发布到 npm
npm publish --access public
```

## 验证发布

### 验证包已发布

```bash
# 检查 core 包
npm view open-agent-sdk

# 检查 CLI 包
npm view @open-agent-sdk/cli
```

### 测试安装

```bash
# 在临时目录测试安装
mkdir /tmp/test-install
cd /tmp/test-install

# 测试全局安装 CLI
bun add -g @open-agent-sdk/cli

# 验证命令可用
which oas
oas --help

# 清理
bun remove -g @open-agent-sdk/cli
```

## Harbor Benchmark 验证

发布后，测试 Harbor adapter：

```bash
# 设置环境变量
export GEMINI_API_KEY="your-key"

# 运行单个任务测试
harbor jobs start \
  --path examples/tasks/hello-world \
  --agent-import-path "harbor.agents.installed.open_agent_sdk:OpenAgentSDKAgent" \
  --model gemini-2.0-flash
```

## 发布清单

- [ ] Core 包构建成功
- [ ] 测试通过
- [ ] 版本号正确
- [ ] 发布 core 包到 npm
- [ ] 验证 core 包可安装
- [ ] 发布 CLI 包到 npm
- [ ] 验证 CLI 包可全局安装
- [ ] 验证 `oas` 命令可用
- [ ] 测试 Harbor adapter 安装脚本
- [ ] 运行 Harbor benchmark 验证

## 故障排除

### 发布失败：403 Forbidden

```bash
# 确认已登录
npm whoami

# 重新登录
npm login
```

### 发布失败：包名已存在

检查 package.json 中的包名是否正确：
- Core: `open-agent-sdk`
- CLI: `@open-agent-sdk/cli`

### CLI 安装后命令不可用

检查 PATH 配置：
```bash
echo $PATH
# 应包含 $HOME/.bun/bin
```

## 版本管理

### Alpha 版本

当前使用 alpha 版本号：`0.1.0-alpha.1`

发布 alpha 版本时使用：
```bash
npm publish --tag alpha --access public
```

### 正式版本

准备发布正式版本时：
1. 更新版本号到 `0.1.0`
2. 移除 `--tag alpha` 参数
3. 更新 CHANGELOG.md

## 参考

- [npm publish 文档](https://docs.npmjs.com/cli/v10/commands/npm-publish)
- [Bun 包管理器](https://bun.sh/docs/cli/install)
- [Harbor Framework](https://harborframework.com/)
