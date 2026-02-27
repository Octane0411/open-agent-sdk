#!/usr/bin/env bun

/**
 * Benchmark 专用发布脚本
 *
 * 用途: 快速发布 SDK + CLI 用于 Daytona benchmark 测试
 *
 * 功能:
 * 1. 自动生成 canary 版本号 (带时间戳)
 * 2. 构建并发布 SDK
 * 3. 等待 npm 索引
 * 4. 更新 CLI 依赖到最新 SDK
 * 5. 发布 CLI
 *
 * 用法:
 *   bun scripts/publish-benchmark.ts           # 真实发布
 *   bun scripts/publish-benchmark.ts --dry-run # 测试模式（不真发布）
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = join(import.meta.dir, '..');
const CORE_PKG_PATH = join(ROOT_DIR, 'packages/core/package.json');
const CLI_PKG_PATH = join(ROOT_DIR, 'packages/cli/package.json');

// 检查是否为 dry-run 模式
const DRY_RUN = process.argv.includes('--dry-run');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command: string, description: string): string {
  log(`\n▶ ${description}`, 'blue');
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      cwd: ROOT_DIR,
    });
    return output.trim();
  } catch (error) {
    log(`❌ Failed: ${description}`, 'red');
    throw error;
  }
}

function generateCanaryVersion(): string {
  const corePkg = JSON.parse(readFileSync(CORE_PKG_PATH, 'utf-8'));
  const baseVersion = corePkg.version.split('-')[0]; // 0.1.0-alpha.1 → 0.1.0

  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');

  return `${baseVersion}-canary.${timestamp}`;
}

function updatePackageVersion(packagePath: string, version: string, sdkVersion?: string): void {
  const content = readFileSync(packagePath, 'utf-8');
  const pkg = JSON.parse(content);

  pkg.version = version;

  // 如果是 CLI 包，更新 SDK 依赖
  if (sdkVersion && pkg.dependencies?.['open-agent-sdk']) {
    pkg.dependencies['open-agent-sdk'] = sdkVersion;
  }

  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

async function waitForNpmPackage(packageName: string, version: string, maxAttempts = 20): Promise<boolean> {
  log(`\n⏳ Waiting for ${packageName}@${version} to be available on npm...`, 'yellow');

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const output = execSync(`npm view ${packageName}@${version} version 2>/dev/null`, {
        encoding: 'utf-8',
      }).trim();

      if (output === version) {
        log(`✅ Package is now available on npm (attempt ${i}/${maxAttempts})`, 'green');
        return true;
      }
    } catch {
      // Package not yet available
    }

    if (i < maxAttempts) {
      process.stdout.write(`   Attempt ${i}/${maxAttempts}: not yet available, waiting 5 seconds...\r`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  log(`\n⚠️  Timeout: Package not available after ${maxAttempts * 5} seconds`, 'yellow');
  return false;
}

async function main() {
  log('\n╔════════════════════════════════════════════════════════╗', 'bright');
  log('║     Benchmark Publishing Tool - SDK + CLI             ║', 'bright');
  if (DRY_RUN) {
    log('║                  🧪 DRY RUN MODE                      ║', 'yellow');
  }
  log('╚════════════════════════════════════════════════════════╝', 'bright');

  // 1. 生成 canary 版本号
  const canaryVersion = generateCanaryVersion();
  log(`\n📦 Generated canary version: ${canaryVersion}`, 'green');

  // 2. 检查工作目录状态
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    if (status.trim()) {
      log('\n⚠️  Warning: You have uncommitted changes', 'yellow');
      log('Uncommitted changes:', 'yellow');
      console.log(status);

      // 询问是否继续
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>(resolve => {
        readline.question('\nContinue anyway? (y/N): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'y') {
        log('\n❌ Aborted by user', 'red');
        process.exit(1);
      }
    }
  } catch (error) {
    // Not a git repo or git not available
  }

  // 3. 更新 SDK 版本
  log('\n📝 Updating SDK version...', 'blue');
  updatePackageVersion(CORE_PKG_PATH, canaryVersion);
  log(`   ✓ packages/core/package.json → ${canaryVersion}`, 'green');

  // 4. 运行 SDK 测试
  log('\n🧪 Running SDK tests...', 'blue');
  try {
    execCommand('cd packages/core && bun test', 'Running tests');
    log('   ✓ All tests passed', 'green');
  } catch (error) {
    log('\n❌ Tests failed! Please fix the tests before publishing.', 'red');
    process.exit(1);
  }

  // 5. 构建 SDK
  execCommand('cd packages/core && bun run build', 'Building SDK');
  log('   ✓ Build completed', 'green');

  // 6. 发布 SDK
  log('\n📤 Publishing SDK to npm...', 'blue');
  if (DRY_RUN) {
    log('   [DRY RUN] Would run: cd packages/core && npm publish --access public --tag canary', 'yellow');
    log(`   ✓ [DRY RUN] Would publish open-agent-sdk@${canaryVersion}`, 'green');
  } else {
    try {
      execCommand('cd packages/core && npm publish --access public --tag canary', 'Publishing open-agent-sdk');
      log(`   ✓ Published open-agent-sdk@${canaryVersion}`, 'green');
    } catch (error) {
      log('\n❌ Failed to publish SDK. Check your npm credentials.', 'red');
      log('   Run: npm login', 'yellow');
      process.exit(1);
    }
  }

  // 7. 等待 npm 索引
  if (DRY_RUN) {
    log('\n⏳ [DRY RUN] Would wait for npm to index the package...', 'yellow');
    log('   ✓ [DRY RUN] Simulating npm indexing complete', 'green');
  } else {
    const sdkAvailable = await waitForNpmPackage('open-agent-sdk', canaryVersion);
    if (!sdkAvailable) {
      log('\n⚠️  SDK package not yet indexed, but continuing...', 'yellow');
      log('   You may need to wait a bit before installing CLI', 'yellow');
    }
  }

  // 8. 更新 CLI 版本和依赖
  log('\n📝 Updating CLI version and SDK dependency...', 'blue');
  updatePackageVersion(CLI_PKG_PATH, canaryVersion, canaryVersion);
  log(`   ✓ packages/cli/package.json → ${canaryVersion}`, 'green');
  log(`   ✓ CLI now depends on open-agent-sdk@${canaryVersion}`, 'green');

  // 9. 发布 CLI
  log('\n📤 Publishing CLI to npm...', 'blue');
  if (DRY_RUN) {
    log('   [DRY RUN] Would run: cd packages/cli && npm publish --access public --tag canary', 'yellow');
    log(`   ✓ [DRY RUN] Would publish @open-agent-sdk/cli@${canaryVersion}`, 'green');
  } else {
    try {
      execCommand('cd packages/cli && npm publish --access public --tag canary', 'Publishing @open-agent-sdk/cli');
      log(`   ✓ Published @open-agent-sdk/cli@${canaryVersion}`, 'green');
    } catch (error) {
      log('\n❌ Failed to publish CLI', 'red');
      process.exit(1);
    }
  }

  // 10. 完成
  log('\n╔════════════════════════════════════════════════════════╗', 'bright');
  log('║                 ✅ PUBLISH COMPLETE!                   ║', 'green');
  log('╚════════════════════════════════════════════════════════╝', 'bright');

  log('\n📦 Published packages:', 'bright');
  log(`   • open-agent-sdk@${canaryVersion}`, 'green');
  log(`   • @open-agent-sdk/cli@${canaryVersion}`, 'green');

  log('\n🚀 Install on Daytona:', 'bright');
  log(`   npm install -g @open-agent-sdk/cli@${canaryVersion}`, 'yellow');

  log('\n💡 Or install latest canary:', 'bright');
  log('   npm install -g @open-agent-sdk/cli@canary', 'yellow');

  log('\n📋 Next steps:', 'bright');
  log('   1. Wait 1-2 minutes for npm to fully index the packages', 'blue');
  log('   2. Run the install command on Daytona', 'blue');
  log('   3. Run your benchmark tests', 'blue');

  // 11. 提示是否还原版本号
  if (DRY_RUN) {
    log('\n💡 Tip: This was a dry run. No changes were published to npm.', 'blue');
    log('   To publish for real, run without --dry-run flag', 'blue');
  } else {
    log('\n⚠️  Note: package.json files have been modified', 'yellow');
    log('   You may want to revert these changes after publishing:', 'yellow');
    log('   git checkout packages/*/package.json', 'yellow');
  }
}

main().catch(error => {
  log('\n❌ Unexpected error:', 'red');
  console.error(error);
  process.exit(1);
});
