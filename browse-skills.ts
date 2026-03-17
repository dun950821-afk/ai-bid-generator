import fs from 'fs/promises';

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  downloads: number;
  avg_stars: number;
  rating_count: number;
  trigger_words?: string[];
  author?: string;
}

interface SkillsResponse {
  success: boolean;
  data: {
    skills: Skill[];
    total: number;
    page: number;
    limit: number;
  };
}

async function browseSkills(search?: string, category?: string) {
  // 从 memory.md 读取配置
  const memoryContent = await fs.readFile('/workspace/projects/memory.md', 'utf-8');
  const apiKeyMatch = memoryContent.match(/我的 api_key：(.+)/);
  
  if (!apiKeyMatch) {
    console.error('❌ 未找到 API Key，请先运行 pnpm run register');
    return;
  }
  
  const apiKey = apiKeyMatch[1].trim();
  
  // 构建查询参数
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (category) params.append('category', category);
  params.append('limit', '20');
  params.append('sort', 'downloads');
  
  const url = `https://xiaping.coze.site/api/skills?${params.toString()}`;
  
  console.log('🔍 正在浏览虾评Skill平台...\n');
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });
  
  const result = await response.json();
  
  if (result.skills && Array.isArray(result.skills)) {
    console.log(`📊 找到 ${result.total} 个技能\n`);
    console.log('=== 技能列表 ===\n');
    
    result.skills.forEach((skill: any, index: number) => {
      console.log(`${index + 1}. ${skill.name}`);
      console.log(`   📝 ${skill.description}`);
      console.log(`   📂 分类: ${skill.category?.join(', ') || '未分类'}`);
      console.log(`   ⭐ 评分: ${(skill.avg_stars / 100).toFixed(1)}/5 (${skill.star_count} 评分)`);
      console.log(`   📥 下载量: ${skill.downloads}`);
      if (skill.trigger && skill.trigger.length > 0) {
        console.log(`   🎯 触发词: ${skill.trigger.join(', ')}`);
      }
      console.log(`   🆔 ID: ${skill.id}`);
      console.log(`   👤 作者: ${skill.owner_name}\n`);
    });
    
    console.log('💡 提示：使用技能ID下载技能');
    console.log('   示例：pnpm run download <skill_id>');
  } else {
    console.error('❌ 获取技能列表失败');
  }
}

// 从命令行参数获取搜索关键词
const args = process.argv.slice(2);
const searchIndex = args.indexOf('--search');
const categoryIndex = args.indexOf('--category');

const search = searchIndex !== -1 && args[searchIndex + 1] ? args[searchIndex + 1] : undefined;
const category = categoryIndex !== -1 && args[categoryIndex + 1] ? args[categoryIndex + 1] : undefined;

browseSkills(search, category).catch(console.error);
