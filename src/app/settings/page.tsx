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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Plus,
  Trash2,
  GripVertical,
  BookOpen,
} from 'lucide-react';
import {
  IMAGateway,
} from '@/lib/services/ima-service';
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

// 字典项接口
interface DictionaryItem {
  id: string;
  type: string;
  label: string;
  value: string;
  sort_order: number;
  is_active: boolean;
}

// 项目字典设置组件
function ProjectDictionarySettings() {
  const [customerIndustries, setCustomerIndustries] = useState<DictionaryItem[]>([]);
  const [serviceTypes, setServiceTypes] = useState<DictionaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'customer_industry' | 'service_type'>('customer_industry');
  
  // 新增对话框状态
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [adding, setAdding] = useState(false);
  
  // 删除确认状态
  const [deleteItem, setDeleteItem] = useState<DictionaryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchDictionaries();
  }, []);

  const fetchDictionaries = async () => {
    setLoading(true);
    try {
      const [industryRes, serviceRes] = await Promise.all([
        fetch('/api/project-dictionaries?type=customer_industry'),
        fetch('/api/project-dictionaries?type=service_type'),
      ]);

      const industryData = await industryRes.json();
      const serviceData = await serviceRes.json();

      if (industryData.success) {
        setCustomerIndustries(industryData.data);
      }
      if (serviceData.success) {
        setServiceTypes(serviceData.data);
      }
    } catch (error) {
      console.error('获取字典数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newLabel.trim() || !newValue.trim()) {
      alert('请填写标签和值');
      return;
    }

    setAdding(true);
    try {
      const res = await fetch('/api/project-dictionaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeTab,
          label: newLabel.trim(),
          value: newValue.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setAddDialogOpen(false);
        setNewLabel('');
        setNewValue('');
        fetchDictionaries();
      } else {
        alert('添加失败: ' + data.error);
      }
    } catch (error) {
      console.error('添加失败:', error);
      alert('添加失败');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/project-dictionaries?id=${deleteItem.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.success) {
        setDeleteItem(null);
        fetchDictionaries();
      } else {
        alert('删除失败: ' + data.error);
      }
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
    } finally {
      setDeleting(false);
    }
  };

  // 自动生成值（拼音或英文）
  const generateValue = (label: string) => {
    // 简单映射
    const mapping: Record<string, string> = {
      '银行': 'bank',
      '保险': 'insurance',
      '供应商': 'supplier',
      '政府': 'government',
      '产品': 'product',
      '安全服务': 'security_service',
    };
    return mapping[label] || label.toLowerCase().replace(/\s+/g, '_');
  };

  const currentList = activeTab === 'customer_industry' ? customerIndustries : serviceTypes;
  const typeName = activeTab === 'customer_industry' ? '客户行业' : '服务类型';

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>项目字典维护</CardTitle>
            <CardDescription>
              管理项目中的客户行业和服务类型选项
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            添加选项
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* 切换标签 */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={activeTab === 'customer_industry' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('customer_industry')}
          >
            客户行业
          </Button>
          <Button
            variant={activeTab === 'service_type' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('service_type')}
          >
            服务类型
          </Button>
        </div>

        {/* 列表 */}
        <div className="space-y-2">
          {currentList.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              暂无{typeName}选项，点击上方按钮添加
            </div>
          ) : (
            currentList.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-gray-400 cursor-move" />
                  <div>
                    <span className="font-medium">{item.label}</span>
                    <span className="text-xs text-gray-400 ml-2 font-mono">
                      ({item.value})
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-red-500"
                  onClick={() => setDeleteItem(item)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        {/* 提示 */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
          <p>提示：删除选项后，已使用该选项的项目将保留原值，但不会显示标签名称。</p>
        </div>
      </CardContent>

      {/* 添加对话框 */}
      <AlertDialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>添加{typeName}选项</AlertDialogTitle>
            <AlertDialogDescription>
              添加新的{typeName}选项到字典中
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-label">显示名称</Label>
              <Input
                id="new-label"
                value={newLabel}
                onChange={(e) => {
                  setNewLabel(e.target.value);
                  if (!newValue) {
                    setNewValue(generateValue(e.target.value));
                  }
                }}
                placeholder={`例如：${activeTab === 'customer_industry' ? '银行' : '产品'}`}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-value">存储值（英文）</Label>
              <Input
                id="new-value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="例如：bank"
              />
              <p className="text-xs text-gray-500">
                用于系统存储，建议使用英文或拼音，不可重复
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={adding}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleAdd} disabled={adding}>
              {adding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              添加
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除"{deleteItem?.label}"吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
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

// 支持文档提取的模型列表（使用 fileid:// 格式）
const DOC_EXTRACT_MODELS = [
  'qwen-long',        // 长上下文模型，推荐
  'qwen-doc-turbo',   // 文档理解专用模型
];

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
    docExtractModels: DOC_EXTRACT_MODELS,  // 文档提取模型列表
    defaultDocExtractModel: 'qwen-long',   // 默认文档提取模型
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
  const [knowledgeProvider, setKnowledgeProvider] = useState<'bailian' | 'ima'>('bailian');
  const [switchingProvider, setSwitchingProvider] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<'bailian' | 'ima' | null>(null);

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

      // 获取当前知识库引擎
      const providerRes = await fetch('/api/knowledge-provider');
      const providerData = await providerRes.json();
      if (providerData.success) {
        setKnowledgeProvider(providerData.data.activeProvider);
      }
    } catch (error) {
      console.error('获取设置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = (category: string, key: string, value: string) => {
    setSettings(prev => {
      const categorySettings = prev[category] || {};
      const keySettings = categorySettings[key] || {};
      return {
        ...prev,
        [category]: {
          ...categorySettings,
          [key]: {
            ...keySettings,
            value,
          },
        },
      };
    });
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

  const saveSettings = async (category?: string, silent: boolean = false) => {
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
        if (!silent) {
          alert('设置已保存');
        }
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
      
      // 如果测试成功且配置有变更，自动保存配置
      if (data.success && hasChanges(type)) {
        console.log(`[Settings] 测试成功，自动保存 ${type} 配置`);
        await saveSettings(type, true); // silent = true，不显示 alert
        // 更新测试结果，添加自动保存提示
        data.message = data.message + '（配置已自动保存）';
      }
      
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
   * 切换知识库引擎
   */
  const handleSwitchProvider = async (provider: 'bailian' | 'ima') => {
    if (provider === knowledgeProvider) return;
    setPendingProvider(provider);
  };

  const confirmSwitchProvider = async () => {
    if (!pendingProvider) return;
    setSwitchingProvider(true);
    try {
      const res = await fetch('/api/knowledge-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: pendingProvider }),
      });
      const data = await res.json();
      if (data.success) {
        setKnowledgeProvider(pendingProvider);
        setPendingProvider(null);
      }
    } catch (error) {
      console.error('切换知识库引擎失败:', error);
    } finally {
      setSwitchingProvider(false);
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
          <TabsList className="grid grid-cols-7 w-full">
            <TabsTrigger value="llm" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              <span>LLM配置</span>
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span>知识库</span>
            </TabsTrigger>
            <TabsTrigger value="storage" className="flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              <span>对象存储</span>
            </TabsTrigger>
            <TabsTrigger value="supabase" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span>Supabase</span>
            </TabsTrigger>
            <TabsTrigger value="project" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span>项目维护</span>
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

                {/* 文档提取模型 - 仅阿里云百炼 */}
                {selectedProvider === 'aliyun' && (
                  <div className="grid gap-2">
                    <Label htmlFor="llm-doc_extract_model">文档提取模型</Label>
                    <Select 
                      value={settings.llm?.doc_extract_model?.value || 'qwen-long'} 
                      onValueChange={(value) => updateSetting('llm', 'doc_extract_model', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择文档提取模型" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_EXTRACT_MODELS.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                      用于处理上传文档的模型，支持 fileid:// 方式引用文档。推荐使用 qwen-long（长上下文模型）
                    </p>
                  </div>
                )}

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

          {/* 阿里云百炼知识库配置 */}
          <TabsContent value="knowledge">
            <div className="space-y-6">
              {/* 引擎选择卡片 */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleSwitchProvider('bailian')}
                  className={`relative flex flex-col items-start gap-3 rounded-lg border-2 p-5 text-left transition-all hover:shadow-md ${
                    knowledgeProvider === 'bailian'
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card hover:border-primary/50'
                  }`}
                >
                  {knowledgeProvider === 'bailian' && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                      当前使用
                    </div>
                  )}
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">阿里云百炼</div>
                    <div className="text-sm text-muted-foreground">企业级知识库，支持多模态文档解析和Rerank检索</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchProvider('ima')}
                  className={`relative flex flex-col items-start gap-3 rounded-lg border-2 p-5 text-left transition-all hover:shadow-md ${
                    knowledgeProvider === 'ima'
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card hover:border-primary/50'
                  }`}
                >
                  {knowledgeProvider === 'ima' && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                      <CheckCircle2 className="h-3 w-3" />
                      当前使用
                    </div>
                  )}
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">IMA知识库</div>
                    <div className="text-sm text-muted-foreground">腾讯IMA知识库，支持智能检索和文档管理</div>
                  </div>
                </button>
              </div>

              {/* 切换确认对话框 */}
              <AlertDialog open={pendingProvider !== null} onOpenChange={(open) => { if (!open) setPendingProvider(null); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认切换知识库引擎</AlertDialogTitle>
                    <AlertDialogDescription>
                      切换到{pendingProvider === 'bailian' ? '阿里云百炼' : 'IMA'}知识库后，所有知识库检索功能将使用新的引擎。
                      请确保已正确配置对应引擎的参数。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={switchingProvider}>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmSwitchProvider(); }} disabled={switchingProvider}>
                      {switchingProvider ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      确认切换
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* 百炼配置表单 */}
              {knowledgeProvider === 'bailian' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>阿里云百炼知识库配置</CardTitle>
                    <CardDescription>
                      配置阿里云百炼知识库连接，实现多模态文档处理和智能检索
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection('bailian')}
                    disabled={testing === 'bailian'}
                  >
                    {testing === 'bailian' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    测试连接
                  </Button>
                </div>
                {testResults.bailian && (
                  <div className={`mt-2 flex items-center gap-2 text-sm ${testResults.bailian.success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults.bailian.success ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {testResults.bailian.message}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 基础配置 */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700 border-b pb-2">基础配置</h4>
                  
                  {settings.bailian?.access_key_id && (
                    <div className="grid gap-2">
                      <Label htmlFor="bailian-access_key_id">AccessKey ID</Label>
                      <Input
                        id="bailian-access_key_id"
                        type="text"
                        value={settings.bailian.access_key_id.value || ''}
                        onChange={(e) => updateSetting('bailian', 'access_key_id', e.target.value)}
                        placeholder="LTAI5t..."
                      />
                      <p className="text-xs text-gray-500">
                        从阿里云控制台获取：https://ram.console.aliyun.com/manage/ak
                      </p>
                    </div>
                  )}

                  {settings.bailian?.access_key_secret && (
                    <div className="grid gap-2">
                      <Label htmlFor="bailian-access_key_secret">AccessKey Secret</Label>
                      <Input
                        id="bailian-access_key_secret"
                        type="password"
                        value={settings.bailian.access_key_secret.value || ''}
                        onChange={(e) => updateSetting('bailian', 'access_key_secret', e.target.value)}
                        placeholder="请输入AccessKey Secret"
                      />
                      <p className="text-xs text-gray-500">
                        注意：这是敏感信息，请勿泄露
                      </p>
                    </div>
                  )}

                  {settings.bailian?.workspace_id && (
                    <div className="grid gap-2">
                      <Label htmlFor="bailian-workspace_id">工作空间ID</Label>
                      <Input
                        id="bailian-workspace_id"
                        type="text"
                        value={settings.bailian.workspace_id.value || ''}
                        onChange={(e) => updateSetting('bailian', 'workspace_id', e.target.value)}
                        placeholder="请输入工作空间ID"
                      />
                      <p className="text-xs text-gray-500">
                        从百炼控制台获取：https://bailian.console.aliyun.com/
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {settings.bailian?.endpoint && (
                      <div className="grid gap-2">
                        <Label htmlFor="bailian-endpoint">API端点</Label>
                        <Select 
                          value={settings.bailian.endpoint.value || 'bailian.cn-beijing.aliyuncs.com'} 
                          onValueChange={(value) => updateSetting('bailian', 'endpoint', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择API端点" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bailian.cn-beijing.aliyuncs.com">华北2(北京)</SelectItem>
                            <SelectItem value="bailian.cn-shanghai.aliyuncs.com">华东2(上海)</SelectItem>
                            <SelectItem value="bailian.cn-hangzhou.aliyuncs.com">华东1(杭州)</SelectItem>
                            <SelectItem value="bailian.cn-shenzhen.aliyuncs.com">华南1(深圳)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {settings.bailian?.region_id && (
                      <div className="grid gap-2">
                        <Label htmlFor="bailian-region_id">地域ID</Label>
                        <Select 
                          value={settings.bailian.region_id.value || 'cn-beijing'} 
                          onValueChange={(value) => updateSetting('bailian', 'region_id', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择地域" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cn-beijing">cn-beijing</SelectItem>
                            <SelectItem value="cn-shanghai">cn-shanghai</SelectItem>
                            <SelectItem value="cn-hangzhou">cn-hangzhou</SelectItem>
                            <SelectItem value="cn-shenzhen">cn-shenzhen</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                {/* 知识库默认配置 */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700 border-b pb-2">知识库默认配置</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {settings.bailian?.default_embedding_model && (
                      <div className="grid gap-2">
                        <Label htmlFor="bailian-default_embedding_model">Embedding模型</Label>
                        <Select 
                          value={settings.bailian.default_embedding_model.value || 'text-embedding-v4'} 
                          onValueChange={(value) => updateSetting('bailian', 'default_embedding_model', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择Embedding模型" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text-embedding-v4">text-embedding-v4 (推荐)</SelectItem>
                            <SelectItem value="text-embedding-v3">text-embedding-v3</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">用于文档向量化</p>
                      </div>
                    )}

                    {settings.bailian?.default_rerank_model && (
                      <div className="grid gap-2">
                        <Label htmlFor="bailian-default_rerank_model">Rerank模型</Label>
                        <Select 
                          value={settings.bailian.default_rerank_model.value || 'qwen3-rerank-hybrid'} 
                          onValueChange={(value) => updateSetting('bailian', 'default_rerank_model', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择Rerank模型" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="qwen3-rerank-hybrid">qwen3-rerank-hybrid (推荐)</SelectItem>
                            <SelectItem value="qwen3-rerank">qwen3-rerank</SelectItem>
                            <SelectItem value="gte-rerank-hybrid">gte-rerank-hybrid</SelectItem>
                            <SelectItem value="gte-rerank">gte-rerank</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">用于检索结果重排序</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {settings.bailian?.default_chunk_size && (
                      <div className="grid gap-2">
                        <Label htmlFor="bailian-default_chunk_size">分块大小</Label>
                        <Input
                          id="bailian-default_chunk_size"
                          type="number"
                          value={settings.bailian.default_chunk_size.value || '500'}
                          onChange={(e) => updateSetting('bailian', 'default_chunk_size', e.target.value)}
                          placeholder="500"
                        />
                        <p className="text-xs text-gray-500">每个文本块的最大字符数 (1-6000)</p>
                      </div>
                    )}

                    {settings.bailian?.default_overlap_size && (
                      <div className="grid gap-2">
                        <Label htmlFor="bailian-default_overlap_size">分块重叠</Label>
                        <Input
                          id="bailian-default_overlap_size"
                          type="number"
                          value={settings.bailian.default_overlap_size.value || '100'}
                          onChange={(e) => updateSetting('bailian', 'default_overlap_size', e.target.value)}
                          placeholder="100"
                        />
                        <p className="text-xs text-gray-500">相邻块之间的重叠字符数 (0-1024)</p>
                      </div>
                    )}
                  </div>

                  {settings.bailian?.default_rerank_min_score && (
                    <div className="grid gap-2">
                      <Label htmlFor="bailian-default_rerank_min_score">相似度阈值</Label>
                      <Input
                        id="bailian-default_rerank_min_score"
                        type="number"
                        step="0.01"
                        value={settings.bailian.default_rerank_min_score.value || '0.01'}
                        onChange={(e) => updateSetting('bailian', 'default_rerank_min_score', e.target.value)}
                        placeholder="0.01"
                      />
                      <p className="text-xs text-gray-500">检索结果的最小相似度阈值 (0.01-1.00)</p>
                    </div>
                  )}
                </div>

                {/* 文档解析配置 */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-gray-700 border-b pb-2">文档解析配置</h4>
                  
                  {settings.bailian?.default_parser && (
                    <div className="grid gap-2">
                      <Label htmlFor="bailian-default_parser">默认解析方式</Label>
                      <Select 
                        value={settings.bailian.default_parser.value || 'DOCUMENT_UNDERSTANDING_LLM'} 
                        onValueChange={(value) => updateSetting('bailian', 'default_parser', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择解析方式" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DOCUMENT_UNDERSTANDING_LLM">大模型文档解析 (推荐)</SelectItem>
                          <SelectItem value="DOCUMENT_UNDERSTANDING_ELECTRONIC">电子文档解析</SelectItem>
                          <SelectItem value="DOCUMENT_UNDERSTANDING_OCR">OCR文档解析</SelectItem>
                          <SelectItem value="QWEN_VL">Qwen VL解析</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500">
                        大模型解析支持多模态文档，包括图片、表格等复杂内容
                      </p>
                    </div>
                  )}

                  {settings.bailian?.parser_timeout && (
                    <div className="grid gap-2">
                      <Label htmlFor="bailian-parser_timeout">解析超时时间 (毫秒)</Label>
                      <Select 
                        value={settings.bailian.parser_timeout.value || '600000'} 
                        onValueChange={(value) => updateSetting('bailian', 'parser_timeout', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择超时时间" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="300000">5分钟</SelectItem>
                          <SelectItem value="600000">10分钟 (推荐)</SelectItem>
                          <SelectItem value="900000">15分钟</SelectItem>
                          <SelectItem value="1800000">30分钟</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500">大文件解析可能需要较长时间</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={() => saveSettings('bailian')}
                    disabled={saving || !hasChanges('bailian')}
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
              )}

              {/* IMA配置表单 */}
              {knowledgeProvider === 'ima' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>IMA知识库配置</CardTitle>
                    <CardDescription>
                      配置IMA知识库用于文档检索和问答
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection('ima')}
                    disabled={testing === 'ima'}
                  >
                    {testing === 'ima' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    测试连接
                  </Button>
                </div>
                {testResults.ima && (
                  <div className={`mt-2 p-2 rounded ${testResults.ima.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {testResults.ima.message}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="ima-api_key">API Key</Label>
                    <Input
                      id="ima-api_key"
                      type="password"
                      placeholder="输入IMA API Key"
                      value={settings.ima?.api_key?.value || ''}
                      onChange={(e) => updateSetting('ima', 'api_key', e.target.value)}
                    />
                    <p className="text-xs text-gray-500">
                      从 <a href="https://ima.qq.com/agent-interface" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">ima.qq.com/agent-interface</a> 获取
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="ima-app_id">应用ID (AppID)</Label>
                    <Input
                      id="ima-app_id"
                      placeholder="输入IMA应用ID"
                      value={settings.ima?.app_id?.value || ''}
                      onChange={(e) => updateSetting('ima', 'app_id', e.target.value)}
                    />
                    <p className="text-xs text-gray-500">IMA平台的应用标识符</p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="ima-knowledge_base_id">知识库ID</Label>
                    <Input
                      id="ima-knowledge_base_id"
                      placeholder="输入IMA知识库ID"
                      value={settings.ima?.knowledge_base_id?.value || ''}
                      onChange={(e) => updateSetting('ima', 'knowledge_base_id', e.target.value)}
                    />
                    <p className="text-xs text-gray-500">IMA知识库的唯一标识符</p>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={() => saveSettings('ima')}
                    disabled={saving || !hasChanges('ima')}
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
              )}
            </div>
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
                      配置 Supabase 连接凭据（默认使用环境变量）
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection('supabase')}
                      disabled={testing === 'supabase' || switchingDatabase || settings.supabase?.use_custom_config?.value !== 'true'}
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
                      disabled={testing === 'supabase' || switchingDatabase || settings.supabase?.use_custom_config?.value !== 'true'}
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
                {/* 开关配置 */}
                <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="text-sm font-medium text-gray-800">使用自定义数据库配置</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      关闭时使用环境变量配置（推荐），开启后使用下方自定义配置
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={settings.supabase?.use_custom_config?.value === 'true'}
                      onChange={(e) => updateSetting('supabase', 'use_custom_config', e.target.checked ? 'true' : 'false')}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* 当前数据库信息 */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">当前连接</h4>
                  <p className="text-sm text-blue-700">
                    {settings.supabase?.use_custom_config?.value === 'true' && settings.supabase?.url?.value
                      ? `自定义配置: ${settings.supabase.url.value}` 
                      : '环境变量配置（默认）'}
                  </p>
                </div>

                {/* 以下配置仅在开启自定义配置时显示 */}
                {settings.supabase?.use_custom_config?.value === 'true' && (
                  <>
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
                  </>
                )}
                
                {/* 环境变量配置说明 */}
                {settings.supabase?.use_custom_config?.value !== 'true' && (
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h4 className="text-sm font-medium text-green-800 mb-2">环境变量配置</h4>
                    <p className="text-sm text-green-700 mb-2">
                      当前使用环境变量配置数据库连接，这是推荐的配置方式。
                    </p>
                    <p className="text-xs text-green-600">
                      需要配置的环境变量：<br/>
                      • <code className="bg-green-100 px-1 rounded">COZE_SUPABASE_URL</code> - Supabase 项目 URL<br/>
                      • <code className="bg-green-100 px-1 rounded">COZE_SUPABASE_ANON_KEY</code> - 匿名公钥<br/>
                      • <code className="bg-green-100 px-1 rounded">COZE_SUPABASE_SERVICE_ROLE_KEY</code> - 服务密钥（可选）
                    </p>
                  </div>
                )}

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

          {/* 项目维护 */}
          <TabsContent value="project">
            <ProjectDictionarySettings />
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
