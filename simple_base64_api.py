#!/usr/bin/env python3
"""
純命令行 Base64 API - 只返回 JSON

使用方式:
python simple_base64_api.py image.jpg
python simple_base64_api.py image.jpg --user my-user --token your-token
"""

import argparse
import json
import base64
import requests
import io
from PIL import Image

# 默認配置
DEFAULT_API_BASE = "https://qa.agent.authme.ai"
DEFAULT_TOKEN = "app-a3mA4KYAWKYexq6GSbTde9Tb"
DEFAULT_USER = "ocr-test"

def image_to_base64(image_path: str) -> str:
    """轉換圖片為 base64"""
    with Image.open(image_path) as img:
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=95)
        img_bytes = buffer.getvalue()
        return base64.b64encode(img_bytes).decode('utf-8')

def extract_response(api_response: dict):
    """從API回應中提取response"""
    try:
        # 獲取 result.response
        response_content = api_response["result"]["response"]
        
        # 檢查是否為JSON字符串
        if isinstance(response_content, str):
            try:
                # 嘗試解析為JSON
                return json.loads(response_content)
            except json.JSONDecodeError:
                # 如果不是JSON，直接返回文本
                return response_content
        else:
            return response_content
        
    except Exception as e:
        return f"Error: {str(e)}"

def call_api(base64_data: str, user_id: str, token: str, api_base: str) -> dict:
    """調用 API"""
    request_data = {
        "inputs": {
            "base64": base64_data
        },
        "response_mode": "blocking", 
        "user": user_id
    }
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.post(
            f"{api_base}/v1/scenarios/run",
            json=request_data,
            headers=headers,
            timeout=300
        )
        
        if response.status_code == 200:
            api_response = response.json()
            # 直接提取response部分
            return extract_response(api_response)
        else:
            return {
                "error": f"HTTP {response.status_code}",
                "message": response.text
            }
            
    except Exception as e:
        return {"error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="Base64 API 調用工具")
    parser.add_argument("image", help="圖片路徑")
    parser.add_argument("--user", default=DEFAULT_USER, help=f"用戶ID (默認: {DEFAULT_USER})")
    parser.add_argument("--token", default=DEFAULT_TOKEN, help="授權Token")
    parser.add_argument("--api", default=DEFAULT_API_BASE, help=f"API端點 (默認: {DEFAULT_API_BASE})")
    parser.add_argument("--pretty", action="store_true", help="格式化輸出")
    
    args = parser.parse_args()
    
    try:
        print(f"🔄 轉換圖片: {args.image}")
        base64_data = image_to_base64(args.image)
        print(f"✅ Base64長度: {len(base64_data)} 字符")
        
        print(f"🌐 調用API: {args.api}")
        result = call_api(base64_data, args.user, args.token, args.api)
        
        # 輸出response結果
        if isinstance(result, str):
            # 如果是純文本，直接輸出
            if args.pretty:
                print("\n📋 Response:")
                print("=" * 50)
            print(result)
        else:
            # 如果是JSON對象，格式化輸出
            if args.pretty:
                print("\n📋 Response:")
                print("=" * 50)
                print(json.dumps(result, indent=2, ensure_ascii=False))
            else:
                print(json.dumps(result, ensure_ascii=False))
            
    except FileNotFoundError:
        print(f"❌ 文件不存在: {args.image}")
    except Exception as e:
        print(f"❌ 錯誤: {e}")

if __name__ == "__main__":
    main()