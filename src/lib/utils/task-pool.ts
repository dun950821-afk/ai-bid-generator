/**
 * 并发控制工具
 * 用于限制异步任务的并发数量
 */

/**
 * 任务执行结果
 */
export interface TaskResult<T> {
  index: number;
  result: T;
  success: true;
}

export interface TaskError {
  index: number;
  error: Error;
  success: false;
}

export type TaskOutcome<T> = TaskResult<T> | TaskError;

/**
 * 并发执行任务池
 * 控制同时执行的任务数量
 * 
 * @example
 * ```typescript
 * const tasks = [
 *   () => fetch('api/1'),
 *   () => fetch('api/2'),
 *   () => fetch('api/3'),
 *   () => fetch('api/4'),
 *   () => fetch('api/5'),
 * ];
 * 
 * // 最多同时执行2个
 * const results = await runInPool(tasks, 2);
 * ```
 */
export async function runInPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<TaskOutcome<T>[]> {
  const results: TaskOutcome<T>[] = new Array(tasks.length);
  const executing: Promise<void>[] = [];

  for (const [index, task] of tasks.entries()) {
    // 创建执行Promise
    const executeTask = async () => {
      try {
        const result = await task();
        results[index] = { index, result, success: true };
      } catch (error) {
        results[index] = { 
          index, 
          error: error instanceof Error ? error : new Error(String(error)), 
          success: false 
        };
      }
    };

    const promise = executeTask().then(() => {
      // 移除已完成的任务
      const idx = executing.indexOf(promise);
      if (idx > -1) {
        executing.splice(idx, 1);
      }
    });

    executing.push(promise);

    // 当并发数达到上限，等待其中一个完成
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  // 等待所有任务完成
  await Promise.all(executing);

  return results;
}

/**
 * 并发执行带进度的任务池
 * 
 * @example
 * ```typescript
 * const results = await runInPoolWithProgress(
 *   tasks,
 *   3,
 *   (completed, total) => console.log(`进度: ${completed}/${total}`)
 * );
 * ```
 */
export async function runInPoolWithProgress<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onProgress?: (completed: number, total: number, currentIndex: number) => void
): Promise<TaskOutcome<T>[]> {
  const results: TaskOutcome<T>[] = new Array(tasks.length);
  const executing: Promise<void>[] = [];
  let completedCount = 0;

  for (const [index, task] of tasks.entries()) {
    const executeTask = async () => {
      try {
        const result = await task();
        results[index] = { index, result, success: true };
      } catch (error) {
        results[index] = {
          index,
          error: error instanceof Error ? error : new Error(String(error)),
          success: false,
        };
      } finally {
        completedCount++;
        onProgress?.(completedCount, tasks.length, index);
      }
    };

    const promise = executeTask().then(() => {
      const idx = executing.indexOf(promise);
      if (idx > -1) {
        executing.splice(idx, 1);
      }
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);

  return results;
}

/**
 * 并发执行带回调的任务池
 * 每个任务完成后立即回调
 */
export async function runInPoolWithCallback<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
  onTaskComplete: (index: number, result: T | Error, success: boolean) => void
): Promise<TaskOutcome<T>[]> {
  const results: TaskOutcome<T>[] = new Array(tasks.length);
  const executing: Promise<void>[] = [];

  for (const [index, task] of tasks.entries()) {
    const executeTask = async () => {
      try {
        const result = await task();
        results[index] = { index, result, success: true };
        onTaskComplete(index, result, true);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        results[index] = { index, error: err, success: false };
        onTaskComplete(index, err, false);
      }
    };

    const promise = executeTask().then(() => {
      const idx = executing.indexOf(promise);
      if (idx > -1) {
        executing.splice(idx, 1);
      }
    });

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);

  return results;
}

/**
 * 任务池配置
 */
export interface TaskPoolConfig {
  /** 最大并发数 */
  concurrency: number;
  /** 单个任务超时时间（毫秒） */
  timeout?: number;
  /** 重试次数 */
  retries?: number;
  /** 重试间隔（毫秒） */
  retryDelay?: number;
}

/**
 * 创建带超时和重试的任务
 */
export function createResilientTask<T>(
  task: () => Promise<T>,
  config: { timeout?: number; retries?: number; retryDelay?: number } = {}
): () => Promise<T> {
  const { timeout = 60000, retries = 0, retryDelay = 1000 } = config;

  return async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // 添加超时控制
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Task timeout after ${timeout}ms`)), timeout);
        });

        const result = await Promise.race([task(), timeoutPromise]);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < retries) {
          console.log(`[TaskPool] 任务失败，${retryDelay}ms后重试 (${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError;
  };
}

/**
 * 高级任务池
 * 支持超时、重试、进度回调
 */
export class TaskPool<T> {
  private config: Required<TaskPoolConfig>;

  constructor(config: TaskPoolConfig) {
    this.config = {
      timeout: 60000,
      retries: 0,
      retryDelay: 1000,
      ...config,
    };
  }

  /**
   * 执行所有任务
   */
  async run(
    tasks: (() => Promise<T>)[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<TaskOutcome<T>[]> {
    // 包装任务，添加超时和重试
    const resilientTasks = tasks.map(task =>
      createResilientTask(task, {
        timeout: this.config.timeout,
        retries: this.config.retries,
        retryDelay: this.config.retryDelay,
      })
    );

    return runInPoolWithProgress(resilientTasks, this.config.concurrency, onProgress);
  }

  /**
   * 执行并流式返回结果
   */
  async *runStream(
    tasks: (() => Promise<T>)[]
  ): AsyncGenerator<TaskOutcome<T>> {
    const results: TaskOutcome<T>[] = new Array(tasks.length);
    const executing: Promise<void>[] = [];
    const yieldQueue: TaskOutcome<T>[] = [];
    let yieldResolve: (() => void) | null = null;

    const tryYield = () => {
      if (yieldQueue.length > 0 && yieldResolve) {
        yieldResolve();
        yieldResolve = null;
      }
    };

    const resilientTasks = tasks.map(task =>
      createResilientTask(task, {
        timeout: this.config.timeout,
        retries: this.config.retries,
        retryDelay: this.config.retryDelay,
      })
    );

    for (const [index, task] of resilientTasks.entries()) {
      const executeTask = async () => {
        try {
          const result = await task();
          results[index] = { index, result, success: true };
        } catch (error) {
          results[index] = {
            index,
            error: error instanceof Error ? error : new Error(String(error)),
            success: false,
          };
        }
        yieldQueue.push(results[index]);
        tryYield();
      };

      const promise = executeTask().then(() => {
        const idx = executing.indexOf(promise);
        if (idx > -1) {
          executing.splice(idx, 1);
        }
      });

      executing.push(promise);

      if (executing.length >= this.config.concurrency) {
        await Promise.race(executing);
      }
    }

    // 异步生成器
    while (true) {
      while (yieldQueue.length > 0) {
        yield yieldQueue.shift()!;
      }

      if (executing.length === 0) {
        break;
      }

      await new Promise<void>(resolve => {
        yieldResolve = resolve;
      });
    }

    // 等待所有完成
    await Promise.all(executing);
  }
}
