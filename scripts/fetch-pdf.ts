import fs from 'fs';

async function fetchPDF() {
  const url = 'https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2F%E9%80%9A%E7%94%A8%E5%8C%96LLM%E7%94%9F%E6%88%90%E6%A0%87%E4%B9%A6%E7%9A%84%E5%85%A8%E6%B5%81%E7%A8%8B%E5%AE%9E%E7%8E%B0%E6%96%B9%E6%A1%88.pdf&nonce=94f84ebf-8698-4c25-aa4e-11ce365cbfb7&project_id=7618128294025904143&sign=3888b0d4fce8497c901ff6e661246809de6325da38d92d5c542a7efdcf3f22fc';
  
  console.log('正在获取PDF内容...\n');
  
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // 保存PDF文件
  const pdfPath = '/tmp/bid-generation-solution.pdf';
  fs.writeFileSync(pdfPath, buffer);
  
  console.log(`PDF已保存到: ${pdfPath}`);
  console.log(`文件大小: ${(buffer.length / 1024).toFixed(2)} KB`);
}

fetchPDF().catch(console.error);
