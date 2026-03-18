/**
 * 重试和限流工具
 * 提供统一的错误处理、重试和限流机制
 */

/**
 * 重试选项
 */
export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试延迟（毫秒） */
  retryDelay: number;
  /** 指数退避倍数 */
  backoffMultiplier?: number;
  /** 最大延迟（毫秒） */
  maxDelay?: number;
  /** 是否在特定错误时跳过重试 */
  shouldRetry?: (error: any) => boolean;
  /** 重试回调 */
  onRetry?: (attempt: number, error: any) => void;
}

/**
 * 默认重试选项
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  retryDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
  shouldRetry: (error: any) => {
    // 默认对网络错误、超时、5xx错误进行重试
    const errorMessage = error?.message?.toLowerCase() || '';
    return (
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('429') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('503') ||
      errorMessage.includes('502') ||
      errorMessage.includes('500')
    );
  },
};

/**
 * 带重试的异步函数执行器
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // 检查是否应该重试
      if (attempt === opts.maxRetries || (opts.shouldRetry && !opts.shouldRetry(error))) {
        throw error;
      }

      // 计算延迟时间（指数退避）
      const delay = Math.min(
        opts.retryDelay * Math.pow(opts.backoffMultiplier || 2, attempt),
        opts.maxDelay || 30000
      );

      // 触发重试回调
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, error);
      }

      console.warn(`[Retry] 第${attempt + 1}次重试，延迟${delay}ms，错误: ${error.message}`);

      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * 超时包装器
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string = '操作超时'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * 限流器类
 */
export class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * 检查是否可以发送请求
   */
  canRequest(): boolean {
    const now = Date.now();
    
    // 移除过期的请求记录
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    return this.requests.length < this.maxRequests;
  }

  /**
   * 记录一次请求
   */
  recordRequest(): void {
    this.requests.push(Date.now());
  }

  /**
   * 等待直到可以发送请求
   */
  async waitForSlot(): Promise<void> {
    while (!this.canRequest()) {
      const now = Date.now();
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);

      if (waitTime > 0) {
        console.log(`[RateLimiter] 等待 ${waitTime}ms 以获取请求槽位`);
        await new Promise((resolve) => setTimeout(resolve, Math.min(waitTime, 1000)));
      }
    }

    this.recordRequest();
  }

  /**
   * 获取当前状态
   */
  getStatus(): { currentRequests: number; maxRequests: number; windowMs: number } {
    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    return {
      currentRequests: this.requests.length,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
    };
  }
}

/**
 * 全局限流器实例
 */
export const rateLimiters = {
  llm: new RateLimiter(60, 60000), // 每分钟60次LLM调用
  fileUpload: new RateLimiter(20, 60000), // 每分钟20次文件上传
  api: new RateLimiter(100, 60000), // 每分钟100次API请求
};

/**
 * 带限流的异步函数执行器
 */
export async function withRateLimit<T>(
  limiter: RateLimiter,
  fn: () => Promise<T>
): Promise<T> {
  await limiter.waitForSlot();
  return fn();
}

/**
 * 组合：重试 + 超时 + 限流
 */
export async function withResilience<T>(
  fn: () => Promise<T>,
  options: {
    retry?: Partial<RetryOptions>;
    timeout?: number;
    rateLimiter?: RateLimiter;
  } = {}
): Promise<T> {
  let wrappedFn = fn;

  // 应用限流
  if (options.rateLimiter) {
    const originalFn = wrappedFn;
    wrappedFn = () => withRateLimit(options.rateLimiter!, originalFn);
  }

  // 应用超时
  if (options.timeout) {
    const originalFn = wrappedFn;
    wrappedFn = () => withTimeout(originalFn, options.timeout!);
  }

  // 应用重试
  if (options.retry) {
    return withRetry(wrappedFn, options.retry);
  }

  return wrappedFn();
}

/**
 * 批量执行带重试和限流的任务
 */
export async function executeBatchWithResilience<T>(
  tasks: Array<{ id: string; fn: () => Promise<T> }>,
  options: {
    concurrency?: number;
    retry?: Partial<RetryOptions>;
    timeout?: number;
    rateLimiter?: RateLimiter;
    onProgress?: (completed: number, total: number, taskId: string) => void;
  } = {}
): Promise<Map<string, { success: boolean; result?: T; error?: string }>> {
  const {
    concurrency = 3,
    retry,
    timeout,
    rateLimiter,
    onProgress,
  } = options;

  const results = new Map<string, { success: boolean; result?: T; error?: string }>();
  const queue = [...tasks];
  let completed = 0;

  async function processTask(task: { id: string; fn: () => Promise<T> }): Promise<void> {
    try {
      const result = await withResilience(task.fn, { retry, timeout, rateLimiter });
      results.set(task.id, { success: true, result });
    } catch (error: any) {
      results.set(task.id, { success: false, error: error.message });
    } finally {
      completed++;
      onProgress?.(completed, tasks.length, task.id);
    }
  }

  // 并发执行
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const task = queue.shift();
          if (task) {
            await processTask(task);
          }
        }
      })()
    );
  }

  await Promise.all(workers);
  return results;
}
