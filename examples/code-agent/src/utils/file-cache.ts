/**
 * FileCache - 缓存文件原始内容用于diff展示
 * 在Write/Edit工具执行前读取并缓存文件内容
 */

import { readFile } from 'fs/promises';
import { logger } from 'open-agent-sdk';

/**
 * 文件内容缓存管理器
 */
export class FileCache {
  private cache = new Map<string, string>();

  /**
   * 在执行Edit/Write前缓存文件原始内容
   * @param filePath - 文件绝对路径
   */
  async cacheBeforeEdit(filePath: string): Promise<void> {
    try {
      // 只有在文件存在时才缓存（Write新文件时文件不存在）
      const content = await readFile(filePath, 'utf-8');
      this.cache.set(filePath, content);
      logger.debug(`[FileCache] Cached content for: ${filePath}`);
    } catch (error) {
      // 文件不存在（可能是Write新文件），不缓存
      logger.debug(`[FileCache] File not found (may be new file): ${filePath}`);
    }
  }

  /**
   * 获取缓存的文件原始内容
   * @param filePath - 文件绝对路径
   * @returns 原始内容，如果没有缓存则返回undefined
   */
  getOriginal(filePath: string): string | undefined {
    return this.cache.get(filePath);
  }

  /**
   * 检查是否有缓存的内容
   * @param filePath - 文件绝对路径
   */
  has(filePath: string): boolean {
    return this.cache.has(filePath);
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.cache.clear();
    logger.debug('[FileCache] Cache cleared');
  }

  /**
   * 获取所有缓存的文件路径
   */
  getCachedFiles(): string[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * 创建文件缓存实例
 */
export function createFileCache(): FileCache {
  return new FileCache();
}
