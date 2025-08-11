#!/usr/bin/env python3
"""
簡化版 Base64 API - 只返回 JSON 數據

專注功能：
1. 圖片轉 base64
2. 調用外部 API  
3. 返回 JSON 結果
"""

import gradio as gr
import json
import os
import base64
import requests
import io
import time
from PIL import Image

# API 配置
EXTERNAL_API_BASE = "https://qa.agent.authme.ai"
EXTERNAL_API_TOKEN = "app-a3mA4KYAWKYexq6GSbTde9Tb"

def image_to_base64(image_path: str) -> str:
    """轉換圖片為 base64"""
    with Image.open(image_path) as img:
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=95)
        img_bytes = buffer.getvalue()
        return base64.b64encode(img_bytes).decode('utf-8')

def call_base64_api(base64_data: str, user_id: str = "abc-123") -> dict:
    """調用外部 API"""
    request_data = {
        "inputs": {
            "base64": base64_data
        },
        "response_mode": "blocking",
        "user": user_id
    }
    
    headers = {
        'Authorization': f'Bearer {EXTERNAL_API_TOKEN}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.post(
            f"{EXTERNAL_API_BASE}/v1/scenarios/run",
            json=request_data,
            headers=headers,
            timeout=300
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"API錯誤: {response.status_code} - {response.text}"}
            
    except Exception as e:
        return {"error": f"請求失敗: {str(e)}"}

def process_image(image_file, user_id, auth_token, progress=gr.Progress()):
    """處理圖片並返回預覽、原始輸出和Markdown"""
    global EXTERNAL_API_TOKEN
    
    if auth_token.strip():
        EXTERNAL_API_TOKEN = auth_token.strip()
    
    if not image_file:
        return None, "請上傳圖片"
    
    try:
        progress(0.1, desc="🖼️ 載入圖片...")
        time.sleep(0.3)  # 讓用戶看到進度
        # 載入圖片預覽
        preview_image = Image.open(image_file)
        
        progress(0.3, desc="🔄 轉換為 base64...")
        time.sleep(0.2)
        # 轉換為 base64
        base64_data = image_to_base64(image_file)
        print(f"✅ 轉換完成: {len(base64_data)} 字符")
        
        progress(0.6, desc="🚀 調用 API...")
        # 調用 API
        result = call_base64_api(base64_data, user_id)
        
        progress(0.9, desc="📄 處理結果...")
        time.sleep(0.2)
        # 提取 response 內容
        if "result" in result and "response" in result["result"]:
            response_content = result["result"]["response"]
            
            # 檢查是否為JSON字符串
            try:
                parsed = json.loads(response_content)
                raw_output = json.dumps(parsed, indent=2, ensure_ascii=False)
                # 如果是JSON，顯示為代碼塊
                markdown_output = f"```json\n{raw_output}\n```"
            except:
                # 如果是純文本或Markdown，直接顯示
                raw_output = response_content
                markdown_output = response_content
        else:
            raw_output = json.dumps(result, indent=2, ensure_ascii=False)
            markdown_output = f"```json\n{raw_output}\n```"
        
        progress(1.0, desc="✅ 完成!")
        return preview_image, raw_output
        
    except Exception as e:
        error_msg = f"錯誤: {str(e)}"
        return None, error_msg

# 創建簡單界面
def create_simple_interface():
    # CSS to hide footer and custom loading icons
    css = """
    footer {
        display: none !important;
    }
    .gradio-container .footer {
        display: none !important;
    }
    
    /* Custom loading spinner */
    # @keyframes spin {
    #     0% { transform: rotate(0deg); }
    #     100% { transform: rotate(360deg); }
    # }
    
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    /* Show custom loading text instead of spinner */
    .pending::before {
        content: "⏳ 處理中..." !important;
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        font-size: 18px !important;
        z-index: 1000 !important;
        background: rgba(255,255,255,0.9) !important;
        padding: 10px 20px !important;
        border-radius: 5px !important;
        animation: pulse 1.5s ease-in-out infinite !important;
    }
    
    /* Hide default loading spinner */
    .gradio-container .loading svg,
    .svelte-zyxd38,
    div[class*="svelte-"] svg {
        display: none !important;
    }
    
    /* Hide all Gradio loading animations */
    .gr-loading svg,
    .loading svg,
    [class*="loading"] svg {
        display: none !important;
    }
    
    /* Processing button style */
    button:disabled {
        cursor: wait !important;
        opacity: 0.6 !important;
    }
    """
    
    with gr.Blocks(title="Base64 API - OCR", theme="ocean", css=css) as demo:
        gr.HTML("""
            <link rel="shortcut icon" href="/file/demo/favicon.ico">
            <link rel="icon" type="image/x-icon" href="/file/demo/favicon.ico">
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="color: #3B82F6;">OCR識別</h1>
            </div>
        """)
        
        with gr.Row():
            with gr.Column(scale=1):
                image_input = gr.File(
                    label="📤 上傳圖片", 
                    file_types=[".jpg", ".jpeg", ".png"]
                )
                user_id = gr.Textbox(label="用戶ID", value="abc-123", visible=False)
                auth_token = gr.Textbox(
                    label="授權Token", 
                    value=EXTERNAL_API_TOKEN,
                    type="password"
                )
                submit_btn = gr.Button("🚀 處理", variant="secondary", size="lg")
            
            with gr.Column(scale=2):
                # 圖片預覽
                image_preview = gr.Image(
                    label="🖼️ 圖片預覽",
                    height=400,
                    show_label=True
                )
                
                # Response 結果
                json_output = gr.Textbox(
                    label="📄 Response 結果",
                    lines=15,
                    max_lines=50,
                    show_copy_button=True
                )
        
        # 當上傳圖片時顯示預覽
        image_input.change(
            fn=lambda x: Image.open(x) if x else None,
            inputs=[image_input],
            outputs=[image_preview]
        )
        
        # 處理按鈕
        submit_btn.click(
            fn=process_image,
            inputs=[image_input, user_id, auth_token],
            outputs=[image_preview, json_output],
            show_progress="full"
        )
    
    return demo

if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7864
    
    print(f"🚀 啟動簡化版 Base64 API (端口: {port})")
    print("只返回 JSON 數據，無其他功能")
    print(f"訪問: http://localhost:{port}")
    
    demo = create_simple_interface()
    demo.launch(
        server_name="0.0.0.0",
        server_port=port,
        share=False,
        favicon_path="/Users/tinghaoliao/Desktop/Project/dots.ocr/demo/favicon.ico"
    )