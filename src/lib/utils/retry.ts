/**
 * 重试工具函数
 * 实现指数退避重试机制
 * 优化：添加随机抖动避免重试风暴
 */

/**
 * 指数退避重试（带抖动）
 * @param fn 要执行的异步函数
 * @param maxRetries 最大重试次数（默认3次）
 * @param baseDelay 基础延迟时间（毫秒，默认1000ms）
 * @param maxDelay 最大延迟时间（毫秒，默认10000ms）
 * @returns Promise<T> 函数执行结果
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 10000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // 如果是最后一次尝试，直接抛出错误
      if (attempt === maxRetries - 1) {
        console.error(`重试失败（第${attempt + 1}次）：`, lastError.message);
        throw lastError;
      }

      // 计算延迟时间（指数退避 + 随机抖动）
      const exponentialDelay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelay * 0.5; // 随机抖动：0-50%的基础延迟
      const delay = Math.min(exponentialDelay + jitter, maxDelay);
      
      console.warn(
        `操作失败（第${attempt + 1}次），${Math.round(delay)}ms后重试：`,
        lastError.message
      );

      // 等待
      await sleep(delay);
    }
  }

  // 这里永远不会执行，但TypeScript需要
  throw lastError || new Error('重试失败');
}

/**
 * 延迟函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带超时的重试
 * @param fn 要执行的异步函数
 * @param options 配置选项
 */
export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    timeout?: number; // 单次操作超时时间
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    timeout = 30000,
  } = options;

  return retryWithBackoff(
    async () => {
      // 为每次尝试添加超时
      return Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('操作超时')), timeout)
        ),
      ]);
    },
    maxRetries,
    baseDelay,
    maxDelay
  );
}

/**
 * 带装饰器模式的重试
 * 可以用来包装任何异步函数
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
  } = {}
): T {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;

  return (async (...args: any[]) => {
    return retryWithBackoff(() => fn(...args), maxRetries, baseDelay, maxDelay);
  }) as T;
}
