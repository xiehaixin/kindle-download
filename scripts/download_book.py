"""
Download book from URL with optional proxy support.
This script is part of the kindle-download skill for OpenClaw.
"""
import sys
import os
import json
import requests
import re
from urllib.parse import unquote

def load_config():
    """Load configuration from auth.json"""
    config_path = os.path.join(os.path.dirname(__file__), "../auth.json")
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"WARNING: Could not load config: {e}")
        return {}

def download(url, save_dir, book_title, cookie_str=None):
    """
    Download a book from URL.
    
    Args:
        url: Download URL
        save_dir: Directory to save the file
        book_title: Title of the book
        cookie_str: Optional cookie string for authentication
    
    Returns:
        bool: True if download successful, False otherwise
    """
    # Load config and get proxy settings
    config = load_config()
    proxy_server = config.get("proxy_server", "")
    
    # Setup proxies if configured
    proxies = None
    if proxy_server:
        proxies = {
            "http": proxy_server,
            "https": proxy_server
        }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": "https://zlib.li/"
    }
    
    if cookie_str:
        headers["Cookie"] = cookie_str
    
    try:
        os.makedirs(save_dir, exist_ok=True)
        
        # Use proxies only if configured
        request_kwargs = {
            "headers": headers,
            "stream": True,
            "timeout": 90
        }
        if proxies:
            request_kwargs["proxies"] = proxies
        
        response = requests.get(url, **request_kwargs)
        response.raise_for_status()
        
        # Save to temporary file first
        temp_path = os.path.join(save_dir, "downloading.tmp")
        with open(temp_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        # Validate file format (EPUB is ZIP format, starts with PK)
        with open(temp_path, "rb") as f:
            magic = f.read(4)
            if magic != b"PK\x03\x04" and b"<html" in magic.lower():
                print("ERROR: DOWNLOADED_CONTENT_IS_HTML")
                os.remove(temp_path)
                return False
        
        # Extract filename from Content-Disposition header
        content_disposition = response.headers.get("Content-Disposition")
        filename = ""
        if content_disposition:
            fname_match = re.findall("filename\\*?=[\\'\\"]?(?:UTF-8\\'\\')?([^\\'\\"\\n;]+)", content_disposition)
            if fname_match:
                filename = unquote(fname_match[0])
        
        if not filename:
            filename = f"{book_title}.epub"
        
        # Sanitize filename
        filename = re.sub(r"[\\/:*?\\"<>|]", "_", filename)
        final_path = os.path.join(save_dir, filename)
        
        os.rename(temp_path, final_path)
        print(f"SUCCESS_PATH:{final_path}")
        return True
        
    except Exception as e:
        print(f"ERROR: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python3 download_book.py <url> <save_dir> <book_title> [cookie_str]")
        print("  url: Download URL")
        print("  save_dir: Directory to save the file")
        print("  book_title: Title of the book")
        print("  cookie_str: Optional cookie string for authentication")
    else:
        cookie = sys.argv[4] if len(sys.argv) > 4 else None
        download(sys.argv[1], sys.argv[2], sys.argv[3], cookie)
