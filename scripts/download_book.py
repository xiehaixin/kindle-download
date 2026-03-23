import sys
import os
import requests
import re
from urllib.parse import unquote

def download(url, save_dir, book_title, cookie_str=None):
    proxy = "http://10.211.55.1:7890"
    proxies = { "http": proxy, "https": proxy }
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": "https://zh.her101.ru/"
    }
    if cookie_str:
        headers["Cookie"] = cookie_str
    
    try:
        os.makedirs(save_dir, exist_ok=True)
        response = requests.get(url, headers=headers, proxies=proxies, stream=True, timeout=90)
        response.raise_for_status()
        
        # 预存到临时文件
        temp_path = os.path.join(save_dir, "downloading.tmp")
        with open(temp_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        # 校验文件开头 (Epub 是 zip 格式，开头必须是 PK\x03\x04)
        with open(temp_path, 'rb') as f:
            magic = f.read(4)
            if magic != b'PK\x03\x04' and b'<html' in magic.lower():
                print("ERROR: DOWNLOADED_CONTENT_IS_HTML")
                os.remove(temp_path)
                return False

        # 处理文件名
        content_disposition = response.headers.get('Content-Disposition')
        filename = ""
        if content_disposition:
            fname_match = re.findall("filename\*?=['\"]?(?:UTF-8'')?([^'\"\n;]+)", content_disposition)
            if fname_match:
                filename = unquote(fname_match[0])
        
        if not filename:
            filename = f"{book_title}.epub"

        filename = re.sub(r'[\\/:*?"<>|]', '_', filename)
        final_path = os.path.join(save_dir, filename)
        os.rename(temp_path, final_path)
        
        print(f"SUCCESS_PATH:{final_path}")
        return True
    except Exception as e:
        print(f"ERROR: {e}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: python3 download_book.py <url> <save_dir> <book_title> [cookie_str]")
    else:
        cookie = sys.argv[4] if len(sys.argv) > 4 else None
        download(sys.argv[1], sys.argv[2], sys.argv[3], cookie)
