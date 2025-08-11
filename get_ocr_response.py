#!/usr/bin/env python3
"""
精簡版：只輸出 response 結果
"""

import sys
import json
import base64
import requests
import io
from PIL import Image

API_BASE = "https://qa.agent.authme.ai"
TOKEN = "app-a3mA4KYAWKYexq6GSbTde9Tb"
USER = "abc-123"

def image_to_base64(image_path):
    with Image.open(image_path) as img:
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=95)
        return base64.b64encode(buffer.getvalue()).decode('utf-8')

def get_response(image_path):
    base64_data = image_to_base64(image_path)
    
    response = requests.post(
        f"{API_BASE}/v1/scenarios/run",
        json={
            "inputs": {"base64": base64_data},
            "response_mode": "blocking",
            "user": USER
        },
        headers={
            'Authorization': f'Bearer {TOKEN}',
            'Content-Type': 'application/json'
        },
        timeout=300
    )
    
    if response.status_code == 200:
        api_response = response.json()
        # 只返回 response 內容
        return api_response["result"]["response"]
    else:
        return f"Error: HTTP {response.status_code}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python get_ocr_response.py <圖片路徑>")
        sys.exit(1)
    
    result = get_response(sys.argv[1])
    
    # 檢查結果是否為JSON字符串
    if isinstance(result, str):
        try:
            # 嘗試解析為JSON
            parsed = json.loads(result)
            print(json.dumps(parsed, ensure_ascii=False))
        except json.JSONDecodeError:
            # 如果不是JSON，直接輸出文本
            print(result)
    else:
        print(result)