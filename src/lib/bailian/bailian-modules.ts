/**
 * 百炼 SDK 懒加载模块
 * @description 使用动态 import 避免 Turbopack 在编译时解析 @darabonba/typescript → moment 的静态依赖链。
 * 所有百炼相关文件必须通过此模块加载 SDK，禁止直接 import @alicloud/bailian20231229。
 */

interface BailianModules {
  $Bailian20231229: typeof import('@alicloud/bailian20231229');
  $Util: typeof import('@alicloud/tea-util');
  $OpenApiUtil: typeof import('@alicloud/openapi-util');
}

let _modules: BailianModules | null = null;

/**
 * 懒加载百炼 SDK 模块
 * 首次调用时动态 import，后续调用直接返回缓存
 */
export async function loadBailianModules(): Promise<BailianModules> {
  if (!_modules) {
    const [$Bailian20231229, $Util, $OpenApiUtil] = await Promise.all([
      import('@alicloud/bailian20231229'),
      import('@alicloud/tea-util'),
      import('@alicloud/openapi-util'),
    ]);
    _modules = { $Bailian20231229, $Util, $OpenApiUtil };
  }
  return _modules;
}
