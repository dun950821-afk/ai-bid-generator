#!/usr/bin/env python3
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    print("PyMuPDF not installed. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "PyMuPDF", "-q"])
    import fitz

def extract_pdf_text(pdf_path):
    """提取PDF文本内容"""
    doc = fitz.open(pdf_path)
    
    print(f"PDF信息:")
    print(f"  页数: {len(doc)}")
    print(f"  标题: {doc.metadata.get('title', 'N/A')}")
    print(f"  作者: {doc.metadata.get('author', 'N/A')}")
    print()
    
    full_text = []
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text()
        full_text.append(f"\n{'='*60}\n第 {page_num + 1} 页\n{'='*60}\n")
        full_text.append(text)
    
    doc.close()
    return '\n'.join(full_text)

if __name__ == "__main__":
    pdf_path = "/tmp/bid-generation-solution.pdf"
    text = extract_pdf_text(pdf_path)
    
    # 保存到文件
    output_path = "/tmp/bid-generation-solution.txt"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(text)
    
    print(f"文本已保存到: {output_path}")
    print(f"总字符数: {len(text)}")
    print("\n前5000字符预览:\n")
    print(text[:5000])
