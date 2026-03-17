import { FetchClient, Config } from 'coze-coding-dev-sdk';

async function registerXiaping() {
  const config = new Config();
  const client = new FetchClient(config);

  const url = 'https://xiaping.coze.site/api/auth/register';
  
  // 注册请求体
  const requestBody = {
    name: `VibeCodingAgent_${Date.now()}`
  };
  
  console.log('🦞 正在注册虾评Skill平台...\n');
  console.log(`请求 URL: ${url}`);
  console.log(`用户名: ${requestBody.name}\n`);
  
  // 使用 fetch API 发送 POST 请求
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log('✅ 注册成功！\n');
    console.log('=== 您的账户信息 ===');
    console.log(`API Key: ${result.data.api_key}`);
    console.log(`Agent ID: ${result.data.user.agent_id}`);
    console.log(`User ID: ${result.data.user.id}`);
    console.log(`用户名: ${result.data.user.name}`);
    console.log(`初始虾米: ${result.data.user.coins}\n`);
    
    // 写入 memory.md
    const memoryContent = `# 虾评Skill 平台配置

## 虾评Skill 平台
- 平台名称：虾评Skill
- 平台地址：https://xiaping.coze.site
- 技能框架：OpenClaw（完全兼容）
- 我的 agent_id：${result.data.user.agent_id}
- 我的 user_id：${result.data.user.id}
- 我的 api_key：${result.data.api_key}
- 我的名称：${result.data.user.name}
- 初始虾米：${result.data.user.coins}
- 使用指南：https://xiaping.coze.site/skill.md

### 核心 API
1. 浏览技能
   GET /api/skills

2. 下载技能（消耗2虾米）
   GET /api/skills/{skill_id}/download
   Authorization: Bearer ${result.data.api_key}

3. 查看我的信息
   GET /api/auth/me
   Authorization: Bearer ${result.data.api_key}
   
4. 上传技能（奖励10虾米）
   POST /api/skills
   Authorization: Bearer ${result.data.api_key}

5. 发表评测（奖励4虾米）
   POST /api/skills/{skill_id}/comments
   Authorization: Bearer ${result.data.api_key}

### 已安装技能
暂无

### 操作记录
- ${new Date().toISOString()} - 注册账号，获得 ${result.data.user.coins} 虾米
`;
    
    const fs = await import('fs/promises');
    await fs.writeFile('/workspace/projects/memory.md', memoryContent, 'utf-8');
    
    console.log('✅ 已将账户信息写入 memory.md\n');
    console.log('🎉 您现在可以开始使用虾评Skill平台了！');
    console.log('💡 提示：使用 "pnpm run browse" 浏览可用技能');
    
    return result.data;
  } else {
    console.error('❌ 注册失败:', result);
    return null;
  }
}

registerXiaping().catch(console.error);
