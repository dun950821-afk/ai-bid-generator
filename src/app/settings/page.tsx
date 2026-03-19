'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings,
  Database,
  Cloud,
  Brain,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

interface Settings {
  [category: string]: {
    [key: string]: {
      value: string | null;
      description: string | null;
      is_secret: boolean;
    };
  };
}

// 阿里云百炼API地域配置 - 使用 Responses API
const ALIYUN_REGIONS = {
  'cn-beijing': '华北2(北京) - 默认',
  'singapore': '新加坡',
};

// 阿里云百炼API地址映射（根据地域）
const ALIYUN_API_URLS: Record<string, string> = {
  'cn-beijing': 'https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1',
  'singapore': 'https://dashscope-intl.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1',
};

// LLM提供商预设配置
const LLM_PRESETS = {
  aliyun: {
    name: '阿里云百炼',
    api_url: 'https://dashscope.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1',
    model: 'qwen3.5-plus',
    models: [
      'qwen3-max',
      'qwen3-max-2026-01-23',
      'qwen3.5-plus',
      'qwen3.5-plus-2026-02-15',
      'qwen3.5-flash',
      'qwen3.5-flash-2026-02-23',
      'qwen-plus',
      'qwen-flash',
      'qwen3-coder-plus',
      'qwen3-coder-flash',
    ],
    supportsThinking: true, // 支持思考模式
    supportsTools: true, // 支持内置工具
    defaultRegion: 'cn-beijing',
  },
  doubao: {
    name: '火山引擎豆包',
    api_url: 'https://api.doubao.com/v1',
    model: 'doubao-pro-32k',
    models: ['doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-32k'],
    supportsThinking: false,
    supportsTools: false,
    defaultRegion: undefined,
  },
  openai: {
    name: 'OpenAI',
    api_url: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    supportsThinking: false,
    supportsTools: false,
    defaultRegion: undefined,
  },
  deepseek: {
    name: 'DeepSeek',
    api_url: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-coder'],
    supportsThinking: false,
    supportsTools: false,
    defaultRegion: undefined,
  },
  custom: {
    name: '自定义',
    api_url: '',
    model: '',
    models: [],
    supportsThinking: false,
    supportsTools: false,
    defaultRegion: undefined,
  },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [originalSettings, setOriginalSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [selectedProvider, setSelectedProvider] = useState<string>('custom');
  const [switchingDatabase, setSwitchingDatabase] = useState(false);
  const [databaseSwitched, setDatabaseSwitched] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
        setOriginalSettings(JSON.parse(JSON.stringify(data.data)));
        
        // 根据api_url自动识别提供商（仅用于显示，不自动覆盖）
        const apiUrl = data.data.llm?.api_url?.value || '';
        
        // 更智能的提供商识别
        if (apiUrl.includes('dashscope.aliyuncs.com')) {
          setSelectedProvider('aliyun');
        } else if (apiUrl.includes('doubao.com') || apiUrl.includes('volcengine')) {
          setSelectedProvider('doubao');
        } else if (apiUrl.includes('openai.com')) {
          setSelectedProvider('openai');
        } else if (apiUrl.includes('deepseek.com')) {
          setSelectedProvider('deepseek');
        } else if (apiUrl) {
          setSelectedProvider('custom');
        }
      }
    } catch (error) {
      console.error('获取设置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (category: string, key: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: {
          ...prev[category][key],
          value,
        },
      },
    }));
  };

  // 应用LLM预设配置
  const applyLLMPreset = (provider: string) => {
    setSelectedProvider(provider);
    const preset = LLM_PRESETS[provider as keyof typeof LLM_PRESETS];
    if (preset && provider !== 'custom') {
      updateSetting('llm', 'api_url', preset.api_url);
      updateSetting('llm', 'model', preset.model);
      // 如果支持思考模式，设置默认值
      if (preset.supportsThinking) {
        updateSetting('llm', 'enable_thinking', 'false');
        updateSetting('llm', 'thinking_budget', '8192');
        // 设置默认地域（仅阿里云百炼）
        if ('defaultRegion' in preset && preset.defaultRegion && !settings.llm?.region?.value) {
          updateSetting('llm', 'region', preset.defaultRegion);
        }
        // 初始化内置工具设置
        if (preset.supportsTools) {
          updateSetting('llm', 'enable_web_search', 'false');
          updateSetting('llm', 'enable_code_interpreter', 'false');
          updateSetting('llm', 'enable_web_extractor', 'false');
        }
      } else {
        // 不支持思考模式的提供商，关闭思考模式
        updateSetting('llm', 'enable_thinking', 'false');
      }
    }
  };

  // 处理阿里云百炼地域变更，自动更新API地址
  const handleAliyunRegionChange = (region: string) => {
    updateSetting('llm', 'region', region);
    // 根据地域自动更新 API 地址
    if (ALIYUN_API_URLS[region]) {
      updateSetting('llm', 'api_url', ALIYUN_API_URLS[region]);
    }
  };

  const saveSettings = async (category?: string) => {
    setSaving(true);
    try {
      // 构建要保存的数据，只提取value字段
      const settingsToSave: Record<string, Record<string, string>> = {};
      const categoriesToSave = category ? [category] : Object.keys(settings);
      
      for (const cat of categoriesToSave) {
        if (settings[cat]) {
          settingsToSave[cat] = {};
          for (const key of Object.keys(settings[cat])) {
            settingsToSave[cat][key] = settings[cat][key].value || '';
          }
        }
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsToSave }),
      });
      const data = await res.json();
      
      if (data.success) {
        setOriginalSettings(JSON.parse(JSON.stringify(settings)));
        alert('设置已保存');
      } else {
        alert('保存失败: ' + data.error);
      }
    } catch (error) {
      console.error('保存设置失败:', error);
      alert('保存设置失败');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (type: string) => {
    setTesting(type);
    try {
      const res = await fetch('/api/settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type, 
          settings: settings[type] 
            ? Object.fromEntries(
                Object.entries(settings[type]).map(([k, v]) => [k, v.value || ''])
              )
            : {} 
        }),
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [type]: data }));
    } catch (error) {
      setTestResults(prev => ({ 
        ...prev, 
        [type]: { success: false, message: '测试失败' } 
      }));
    } finally {
      setTesting(null);
    }
  };

  /**
   * 切换到新配置的 Supabase 数据库
   */
  const switchDatabase = async () => {
    const supabaseSettings = settings.supabase;
    if (!supabaseSettings?.url?.value) {
      setTestResults(prev => ({ 
        ...prev, 
        supabase: { success: false, message: '请先配置 Supabase URL' } 
      }));
      return;
    }

    setSwitchingDatabase(true);
    try {
      const res = await fetch('/api/settings/switch-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: supabaseSettings.url.value,
          anonKey: supabaseSettings.anon_key?.value || '',
          serviceRoleKey: supabaseSettings.service_role_key?.value || '',
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        setTestResults(prev => ({ 
          ...prev, 
          supabase: { success: true, message: data.message } 
        }));
        setDatabaseSwitched(true);
        // 刷新设置
        setTimeout(() => {
          fetchSettings();
        }, 1000);
      } else {
        setTestResults(prev => ({ 
          ...prev, 
          supabase: { success: false, message: data.error } 
        }));
      }
    } catch (error) {
      setTestResults(prev => ({ 
        ...prev, 
        supabase: { success: false, message: '切换失败' } 
      }));
    } finally {
      setSwitchingDatabase(false);
    }
  };

  const hasChanges = (category: string) => {
    return JSON.stringify(settings[category]) !== JSON.stringify(originalSettings[category]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-gray-700">
                <ArrowLeft className="h-4 w-4" />
                <span>返回首页</span>
              </Link>
              <span className="text-gray-300">|</span>
              <Settings className="h-6 w-6 text-blue-600" />
              <span className="text-lg font-semibold text-gray-900">系统设置</span>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="llm" className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="llm" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              <span>LLM配置</span>
            </TabsTrigger>
            <TabsTrigger value="storage" className="flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              <span>对象存储</span>
            </TabsTrigger>
            <TabsTrigger value="supabase" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span>Supabase</span>
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span>系统配置</span>
            </TabsTrigger>
            <TabsTrigger value="database" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span>数据库状态</span>
            </TabsTrigger>
          </TabsList>

          {/* LLM配置 */}
          <TabsContent value="llm">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>大语言模型配置</CardTitle>
                    <CardDescription>
                      配置用于标书内容生成的LLM服务
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection('llm')}
                    disabled={testing === 'llm'}
                  >
                    {testing === 'llm' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    测试连接
                  </Button>
                </div>
                {testResults.llm && (
                  <div className={`mt-2 flex items-center gap-2 text-sm ${testResults.llm.success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults.llm.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {testResults.llm.message}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* LLM提供商选择 */}
                <div className="grid gap-2">
                  <Label>LLM提供商</Label>
                  <Select value={selectedProvider} onValueChange={applyLLMPreset}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择LLM提供商" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LLM_PRESETS).map(([key, preset]) => (
                        <SelectItem key={key} value={key}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    选择提供商后将自动填充API地址和默认模型
                  </p>
                </div>

                {/* API地址 */}
                {settings.llm?.api_url && (
                  <div className="grid gap-2">
                    <Label htmlFor="llm-api_url">API地址</Label>
                    <Input
                      id="llm-api_url"
                      type="text"
                      value={settings.llm.api_url.value || ''}
                      onChange={(e) => updateSetting('llm', 'api_url', e.target.value)}
                      placeholder="https://api.example.com/v1"
                    />
                    <p className="text-xs text-gray-500">{settings.llm.api_url.description}</p>
                  </div>
                )}

                {/* 模型选择 */}
                <div className="grid gap-2">
                  <Label htmlFor="llm-model">模型名称</Label>
                  {selectedProvider !== 'custom' && LLM_PRESETS[selectedProvider as keyof typeof LLM_PRESETS]?.models.length > 0 ? (
                    <Select 
                      value={settings.llm?.model?.value || ''} 
                      onValueChange={(value) => updateSetting('llm', 'model', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择模型" />
                      </SelectTrigger>
                      <SelectContent>
                        {LLM_PRESETS[selectedProvider as keyof typeof LLM_PRESETS].models.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="llm-model"
                      type="text"
                      value={settings.llm?.model?.value || ''}
                      onChange={(e) => updateSetting('llm', 'model', e.target.value)}
                      placeholder="model-name"
                    />
                  )}
                  <p className="text-xs text-gray-500">{settings.llm?.model?.description}</p>
                </div>

                {/* API密钥 */}
                {settings.llm?.api_key && (
                  <div className="grid gap-2">
                    <Label htmlFor="llm-api_key">API密钥</Label>
                    <Input
                      id="llm-api_key"
                      type="password"
                      value={settings.llm.api_key.value || ''}
                      onChange={(e) => updateSetting('llm', 'api_key', e.target.value)}
                      placeholder="sk-xxxxxxxx"
                    />
                    <p className="text-xs text-gray-500">{settings.llm.api_key.description}</p>
                  </div>
                )}

                {/* 地域选择 - 仅阿里云百炼 */}
                {selectedProvider === 'aliyun' && settings.llm?.region && (
                  <div className="grid gap-2">
                    <Label htmlFor="llm-region">API地域</Label>
                    <Select 
                      value={settings.llm.region.value || 'cn-beijing'} 
                      onValueChange={handleAliyunRegionChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择地域" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ALIYUN_REGIONS).map(([key, name]) => (
                          <SelectItem key={key} value={key}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      选择API地域后，API地址会自动更新为对应地域的Responses API端点
                    </p>
                  </div>
                )}

                {/* 思考模式配置 - 仅阿里云百炼 */}
                {selectedProvider === 'aliyun' && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="llm-enable_thinking">思考模式</Label>
                      <Select 
                        value={settings.llm?.enable_thinking?.value || 'false'} 
                        onValueChange={(value) => updateSetting('llm', 'enable_thinking', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="是否开启思考模式" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">关闭</SelectItem>
                          <SelectItem value="true">开启（深度思考）</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500">
                        开启后模型会进行深度推理，适合复杂任务，但会增加响应时间和Token消耗
                      </p>
                    </div>

                    {/* 思考预算 - 仅在思考模式开启时显示 */}
                    {settings.llm?.enable_thinking?.value === 'true' && (
                      <div className="grid gap-2">
                        <Label htmlFor="llm-thinking_budget">思考过程最大Token数</Label>
                        <Select 
                          value={settings.llm?.thinking_budget?.value || '8192'} 
                          onValueChange={(value) => updateSetting('llm', 'thinking_budget', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择思考预算" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="4096">4096 (节省)</SelectItem>
                            <SelectItem value="8192">8192 (默认)</SelectItem>
                            <SelectItem value="16384">16384 (详细)</SelectItem>
                            <SelectItem value="32768">32768 (深度)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">
                          控制思考过程的最大Token数，数值越大思考越详细，但消耗更多Token
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* 内置工具配置 - 仅阿里云百炼 */}
                {selectedProvider === 'aliyun' && (
                  <div className="border-t pt-4 mt-2">
                    <h4 className="text-sm font-medium mb-3">内置工具</h4>
                    <p className="text-xs text-gray-500 mb-4">
                      开启内置工具可让模型搜索网络、执行代码、抓取网页内容，增强模型能力
                    </p>
                    
                    <div className="space-y-3">
                      {/* 联网搜索 */}
                      {settings.llm?.enable_web_search && (
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <Label htmlFor="llm-enable_web_search" className="font-medium">联网搜索</Label>
                            <p className="text-xs text-gray-500">允许模型搜索互联网获取最新信息</p>
                          </div>
                          <Select 
                            value={settings.llm.enable_web_search.value || 'false'} 
                            onValueChange={(value) => updateSetting('llm', 'enable_web_search', value)}
                          >
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="false">关闭</SelectItem>
                              <SelectItem value="true">开启</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* 代码解释器 */}
                      {settings.llm?.enable_code_interpreter && (
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <Label htmlFor="llm-enable_code_interpreter" className="font-medium">代码解释器</Label>
                            <p className="text-xs text-gray-500">允许模型执行代码进行数据分析</p>
                          </div>
                          <Select 
                            value={settings.llm.enable_code_interpreter.value || 'false'} 
                            onValueChange={(value) => updateSetting('llm', 'enable_code_interpreter', value)}
                          >
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="false">关闭</SelectItem>
                              <SelectItem value="true">开启</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* 网页抓取 */}
                      {settings.llm?.enable_web_extractor && (
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <Label htmlFor="llm-enable_web_extractor" className="font-medium">网页抓取</Label>
                            <p className="text-xs text-gray-500">允许模型访问并提取网页内容（需配合联网搜索）</p>
                          </div>
                          <Select 
                            value={settings.llm.enable_web_extractor.value || 'false'} 
                            onValueChange={(value) => updateSetting('llm', 'enable_web_extractor', value)}
                          >
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="false">关闭</SelectItem>
                              <SelectItem value="true">开启</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={() => saveSettings('llm')}
                    disabled={saving || !hasChanges('llm')}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存配置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 对象存储配置 */}
          <TabsContent value="storage">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>对象存储配置</CardTitle>
                    <CardDescription>
                      配置文件存储服务（支持S3兼容存储）
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection('storage')}
                    disabled={testing === 'storage'}
                  >
                    {testing === 'storage' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    测试连接
                  </Button>
                </div>
                {testResults.storage && (
                  <div className={`mt-2 flex items-center gap-2 text-sm ${testResults.storage.success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults.storage.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {testResults.storage.message}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {settings.storage && Object.entries(settings.storage).map(([key, config]) => (
                  <div key={key} className="grid gap-2">
                    <Label htmlFor={`storage-${key}`}>
                      {key === 'endpoint_url' && 'Endpoint URL'}
                      {key === 'bucket_name' && '存储桶名称'}
                      {key === 'access_key' && 'Access Key'}
                      {key === 'secret_key' && 'Secret Key'}
                      {key === 'region' && '区域'}
                      {!['endpoint_url', 'bucket_name', 'access_key', 'secret_key', 'region'].includes(key) && key}
                    </Label>
                    <Input
                      id={`storage-${key}`}
                      type={config.is_secret ? 'password' : 'text'}
                      value={config.value || ''}
                      onChange={(e) => updateSetting('storage', key, e.target.value)}
                      placeholder={config.description || ''}
                    />
                    {config.description && (
                      <p className="text-xs text-gray-500">{config.description}</p>
                    )}
                  </div>
                ))}
                <div className="flex justify-end pt-4">
                  <Button
                    onClick={() => saveSettings('storage')}
                    disabled={saving || !hasChanges('storage')}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存配置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Supabase配置 */}
          <TabsContent value="supabase">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Supabase 数据库配置</CardTitle>
                    <CardDescription>
                      配置 Supabase 连接凭据（保存并切换后生效）
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('supabase')}
                      disabled={testing === 'supabase' || switchingDatabase}
                    >
                      {testing === 'supabase' ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      测试连接
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={switchDatabase}
                      disabled={testing === 'supabase' || switchingDatabase}
                    >
                      {switchingDatabase ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      切换数据库
                    </Button>
                  </div>
                </div>
                {testResults.supabase && (
                  <div className={`mt-2 flex items-center gap-2 text-sm ${testResults.supabase.success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults.supabase.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {testResults.supabase.message}
                  </div>
                )}
                {databaseSwitched && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                    <CheckCircle2 className="h-4 w-4" />
                    数据库已切换，新配置将在下次请求时生效
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 当前数据库信息 */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">当前连接</h4>
                  <p className="text-sm text-blue-700">
                    {settings.supabase?.url?.value 
                      ? `已配置: ${settings.supabase.url.value}` 
                      : '使用环境变量默认配置'}
                  </p>
                </div>
                
                {/* Supabase URL */}
                <div className="grid gap-2">
                  <Label htmlFor="supabase-url">Supabase URL</Label>
                  <Input
                    id="supabase-url"
                    type="text"
                    value={settings.supabase?.url?.value || ''}
                    onChange={(e) => updateSetting('supabase', 'url', e.target.value)}
                    placeholder="https://your-project.supabase.co"
                  />
                  <p className="text-xs text-gray-500">
                    在 Supabase Dashboard → Settings → API 中获取 Project URL
                  </p>
                </div>

                {/* Anon Key */}
                <div className="grid gap-2">
                  <Label htmlFor="supabase-anon_key">Anon Key (公开密钥)</Label>
                  <Input
                    id="supabase-anon_key"
                    type="password"
                    value={settings.supabase?.anon_key?.value || ''}
                    onChange={(e) => updateSetting('supabase', 'anon_key', e.target.value)}
                    placeholder="eyJhbGciOiJ..."
                  />
                  <p className="text-xs text-gray-500">
                    在 Supabase Dashboard → Settings → API 中获取 anon public key
                  </p>
                </div>

                {/* Service Role Key */}
                <div className="grid gap-2">
                  <Label htmlFor="supabase-service_role_key">Service Role Key (服务密钥)</Label>
                  <Input
                    id="supabase-service_role_key"
                    type="password"
                    value={settings.supabase?.service_role_key?.value || ''}
                    onChange={(e) => updateSetting('supabase', 'service_role_key', e.target.value)}
                    placeholder="eyJhbGciOiJ..."
                  />
                  <p className="text-xs text-gray-500 text-amber-600">
                    ⚠️ 服务密钥拥有完全权限，请妥善保管。在 Supabase Dashboard → Settings → API 中获取
                  </p>
                </div>

                {/* 配置说明 */}
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium mb-2">操作步骤</h4>
                  <ol className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">1</span>
                      <span>填写 Supabase URL 和密钥（从 Supabase Dashboard → Settings → API 获取）</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">2</span>
                      <span>点击「保存配置」保存到数据库</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium">3</span>
                      <span>点击「测试连接」验证配置是否正确</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-medium">4</span>
                      <span className="text-green-700 font-medium">点击「切换数据库」使新配置生效</span>
                    </li>
                  </ol>
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs text-amber-600">
                      ⚠️ 切换到新的 Supabase 项目后，需要在新项目中创建所需的数据库表
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-4 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => saveSettings('supabase')}
                    disabled={saving || !hasChanges('supabase')}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存配置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 系统配置 */}
          <TabsContent value="system">
            <Card>
              <CardHeader>
                <CardTitle>系统配置</CardTitle>
                <CardDescription>
                  配置系统基本参数
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {settings.system && Object.entries(settings.system).map(([key, config]) => (
                  <div key={key} className="grid gap-2">
                    <Label htmlFor={`system-${key}`}>
                      {key === 'app_name' && '应用名称'}
                      {key === 'max_file_size' && '最大文件大小(MB)'}
                      {key === 'allowed_file_types' && '允许的文件类型'}
                      {!['app_name', 'max_file_size', 'allowed_file_types'].includes(key) && key}
                    </Label>
                    <Input
                      id={`system-${key}`}
                      type="text"
                      value={config.value || ''}
                      onChange={(e) => updateSetting('system', key, e.target.value)}
                      placeholder={config.description || ''}
                    />
                    {config.description && (
                      <p className="text-xs text-gray-500">{config.description}</p>
                    )}
                  </div>
                ))}
                <div className="flex justify-end pt-4">
                  <Button
                    onClick={() => saveSettings('system')}
                    disabled={saving || !hasChanges('system')}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    保存配置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 数据库配置 */}
          <TabsContent value="database">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>数据库配置</CardTitle>
                    <CardDescription>
                      查看数据库连接状态（配置由系统管理）
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection('database')}
                    disabled={testing === 'database'}
                  >
                    {testing === 'database' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    测试连接
                  </Button>
                </div>
                {testResults.database && (
                  <div className={`mt-2 flex items-center gap-2 text-sm ${testResults.database.success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults.database.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {testResults.database.message}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">
                    数据库使用Supabase托管服务，连接配置由系统自动管理。
                  </p>
                  <p className="text-sm text-gray-500">
                    如需修改数据库配置，请联系系统管理员。
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
