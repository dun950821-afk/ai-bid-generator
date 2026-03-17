import { FetchClient, Config } from 'coze-coding-dev-sdk';

async function fetchSkillDoc() {
  const config = new Config();
  const client = new FetchClient(config);

  const url = 'https://xiaping.coze.site/skill.md';
  
  console.log(`正在获取: ${url}\n`);
  
  const response = await client.fetch(url);

  console.log(`标题: ${response.title}`);
  console.log(`URL: ${response.url}`);
  console.log(`状态码: ${response.status_code}`);
  console.log(`状态消息: ${response.status_message}\n`);
  
  console.log('=== 文档内容 ===\n');
  
  for (const item of response.content) {
    if (item.type === 'text') {
      console.log(item.text);
    } else if (item.type === 'image') {
      console.log(`[图片: ${item.image?.display_url}]`);
    } else if (item.type === 'link') {
      console.log(`[链接: ${item.url}]`);
    }
  }
}

fetchSkillDoc().catch(console.error);
