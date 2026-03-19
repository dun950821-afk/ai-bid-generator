/**
 * 阿里云百炼配置管理
 * @description 管理百炼客户端的配置信息
 */

/**
 * 百炼客户端配置接口
 */
export interface BailianConfig {
  /** 阿里云AccessKey ID */
  accessKeyId: string;
  /** 阿里云AccessKey Secret */
  accessKeySecret: string;
  /** 业务空间ID */
  workspaceId: string;
  /** API端点 */
  endpoint?: string;
  /** 地域 */
  region?: string;
}

/**
 * 百炼默认配置
 */
export const DEFAULT_BAILIAN_CONFIG = {
  endpoint: 'bailian.cn-beijing.aliyuncs.com',
  region: 'cn-beijing',
} as const;

/**
 * 从环境变量获取百炼配置
 * @returns 百炼配置对象
 * @throws 如果缺少必要的环境变量
 */
export function getBailianConfig(): BailianConfig {
  const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
  const workspaceId = process.env.BAILIAN_WORKSPACE_ID;

  if (!accessKeyId || !accessKeySecret || !workspaceId) {
    throw new Error(
      'Missing required environment variables. Please set:\n' +
      '- ALIBABA_CLOUD_ACCESS_KEY_ID\n' +
      '- ALIBABA_CLOUD_ACCESS_KEY_SECRET\n' +
      '- BAILIAN_WORKSPACE_ID\n' +
      '\nYou can get these values from:\n' +
      '1. AccessKey: https://ram.console.aliyun.com/manage/ak\n' +
      '2. Workspace ID: https://bailian.console.aliyun.com/'
    );
  }

  return {
    accessKeyId,
    accessKeySecret,
    workspaceId,
    endpoint: process.env.BAILIAN_ENDPOINT || DEFAULT_BAILIAN_CONFIG.endpoint,
    region: process.env.BAILIAN_REGION || DEFAULT_BAILIAN_CONFIG.region,
  };
}

/**
 * 验证配置是否有效
 * @param config 百炼配置
 * @returns 是否有效
 */
export function validateBailianConfig(config: BailianConfig): boolean {
  return (
    typeof config.accessKeyId === 'string' &&
    config.accessKeyId.length > 0 &&
    typeof config.accessKeySecret === 'string' &&
    config.accessKeySecret.length > 0 &&
    typeof config.workspaceId === 'string' &&
    config.workspaceId.length > 0
  );
}

/**
 * 创建配置对象（支持部分覆盖）
 * @param overrides 部分配置覆盖
 * @returns 完整的配置对象
 */
export function createBailianConfig(overrides: Partial<BailianConfig> = {}): BailianConfig {
  const baseConfig = getBailianConfig();
  return {
    ...baseConfig,
    ...overrides,
  };
}
