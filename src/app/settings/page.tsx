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

// 阿里云百炼API地域配置
const ALIYUN_REGIONS = {
  'cn-beijing': '华北2(北京) - 默认',
  'singapore': '新加坡',
  'us-virginia': '美国(弗吉尼亚)',
  'finance': '金融云(华东1)',
};

// LLM提供商预设配置
const LLM_PRESETS = {
  aliyun: {
    name: '阿里云百炼',
    api_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    models: ['qwen-plus', 'qwen3.5-plus', 'qwen3-235b-a22b', 'qwen-max'],
    supportsThinking: true, // 支持思考模式
    defaultRegion: 'cn-beijing',
  },
  doubao: {
    name: '火山引擎豆包',
    api_url: 'https://api.doubao.com/v1',
    model: 'doubao-pro-32k',
    models: ['doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-32k'],
    supportsThinking: false,
    defaultRegion: undefined,
  },
  openai: {
    name: 'OpenAI',
    api_url: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    supportsThinking: false,
    defaultRegion: undefined,
  },
  deepseek: {
    name: 'DeepSeek',
    api_url: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-coder'],
    supportsThinking: false,
    defaultRegion: undefined,
  },
  custom: {
    name: '自定义',
    api_url: '',
    model: '',
    models: [],
    supportsThinking: false,
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
        
        // 根据api_url自动识别提供商
        const apiUrl = data.data.llm?.api_url?.value || '';
        for (const [key, preset] of Object.entries(LLM_PRESETS)) {
          if (preset.api_url && apiUrl.includes(preset.api_url.replace('https://', '').replace('/v1', ''))) {
            setSelectedProvider(key);
            break;
          }
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
      } else {
        // 不支持思考模式的提供商，关闭思考模式
        updateSetting('llm', 'enable_thinking', 'false');
      }
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
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="llm" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              <span>LLM配置</span>
            </TabsTrigger>
            <TabsTrigger value="storage" className="flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              <span>对象存储</span>
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span>系统配置</span>
            </TabsTrigger>
            <TabsTrigger value="database" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span>数据库</span>
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
                      onValueChange={(value) => updateSetting('llm', 'region', value)}
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
                      选择距离您最近的API地域，可降低网络延迟
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
