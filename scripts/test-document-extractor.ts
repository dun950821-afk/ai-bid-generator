/**
 * 测试脚本：验证 document-extractor 返回的完整数据结构
 * 
 * 目的：确认是否包含表格结构数据
 * 
 * 运行方式：npx tsx scripts/test-document-extractor.ts
 */

import 'dotenv/config';

async function testDocumentExtractor() {
  const apiKey = process.env.LLM_API_KEY;
  
  if (!apiKey) {
    console.error('错误: 请设置 LLM_API_KEY 环境变量');
    return;
  }

  // 使用一个测试用的 file_id（需要替换为实际的）
  const testFileId = process.env.TEST_FILE_ID;
  
  if (!testFileId) {
    console.log('========================================');
    console.log('document-extractor API 返回结构说明');
    console.log('========================================');
    console.log('');
    console.log('根据阿里云百炼官方文档，document-extractor 接口返回格式：');
    console.log('');
    console.log('```json');
    console.log(JSON.stringify({
      "request_id": "xxx-xxx-xxx",
      "output": {
        "text": "文档全文（纯文本）",
        "pages": [
          {
            "page_number": 1,
            "text": "第一页内容"
          }
        ],
        "tables": [
          {
            "table_id": "table_0",
            "rows": [
              ["列1", "列2", "列3"],
              ["值1", "值2", "值3"]
            ],
            "header": ["列1", "列2", "列3"]
          }
        ],
        "figures": [
          {
            "figure_id": "figure_0",
            "caption": "图片说明"
          }
        ]
      }
    }, null, 2));
    console.log('```');
    console.log('');
    console.log('========================================');
    console.log('验证步骤：');
    console.log('========================================');
    console.log('');
    console.log('1. 上传一个包含评分表格的招标文档');
    console.log('2. 获取返回的 file_id');
    console.log('3. 设置环境变量: export TEST_FILE_ID=xxx');
    console.log('4. 运行此脚本: npx tsx scripts/test-document-extractor.ts');
    console.log('');
    console.log('========================================');
    console.log('当前代码问题：');
    console.log('========================================');
    console.log('');
    console.log('llm-file-service.ts 中只取了 data.output?.text');
    console.log('忽略了可能的 tables、figures 等结构化数据');
    console.log('');
    return;
  }

  console.log('[测试] 调用 document-extractor, fileId:', testFileId);

  const response = await fetch(
    'https://dashscope.aliyuncs.com/api/v1/enhancements/document-extractor',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        file_id: testFileId,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[错误] API调用失败:', errorText);
    return;
  }

  const data = await response.json();
  
  console.log('');
  console.log('========================================');
  console.log('完整返回结构:');
  console.log('========================================');
  console.log(JSON.stringify(data, null, 2));
  console.log('');
  
  // 分析返回结构
  console.log('========================================');
  console.log('结构分析:');
  console.log('========================================');
  console.log('- request_id:', data.request_id ? '✅ 存在' : '❌ 不存在');
  console.log('- output:', data.output ? '✅ 存在' : '❌ 不存在');
  
  if (data.output) {
    console.log('  - text:', typeof data.output.text, data.output.text?.length ? `${data.output.text.length} 字符` : '空');
    console.log('  - pages:', Array.isArray(data.output.pages) ? `✅ ${data.output.pages.length} 页` : '❌ 不存在');
    console.log('  - tables:', Array.isArray(data.output.tables) ? `✅ ${data.output.tables.length} 个表格` : '❌ 不存在');
    console.log('  - figures:', Array.isArray(data.output.figures) ? `✅ ${data.output.figures.length} 个图片` : '❌ 不存在');
    
    if (data.output.tables && data.output.tables.length > 0) {
      console.log('');
      console.log('========================================');
      console.log('表格数据示例:');
      console.log('========================================');
      data.output.tables.slice(0, 2).forEach((table: any, i: number) => {
        console.log(`\n表格 ${i + 1}:`);
        console.log(JSON.stringify(table, null, 2));
      });
    }
  }
}

testDocumentExtractor().catch(console.error);
