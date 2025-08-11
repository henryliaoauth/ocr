# OCR Base64 API Frontend

純前端OCR界面，調用外部API進行圖片識別。

## 🚀 快速開始

1. **安裝依賴**
   ```bash
   pip install -r requirements_frontend.txt
   ```

2. **啟動Web界面**
   ```bash
   python3 demo/demo_simple_base64_api.py 7864
   ```
   
   訪問：`http://localhost:7864`

3. **命令行使用**
   ```bash
   # 精簡版
   python3 get_ocr_response.py your_image.jpg
   
   # 標準版
   python3 simple_base64_api.py your_image.jpg --pretty
   ```

## 📁 文件結構

```
📁 ocr-frontend/
├── 📄 demo/demo_simple_base64_api.py    # Web界面
├── 📄 get_ocr_response.py               # 精簡命令行
├── 📄 simple_base64_api.py              # 標準命令行
├── 📄 requirements_frontend.txt         # 依賴文件
├── 📁 assets/showcase_origin/           # 測試圖片
└── 📄 BASE64_API_README.md              # 詳細說明
```

## ⚙️ API配置

在代碼中修改：
- `API_BASE`: API端點
- `TOKEN`: 授權Token  
- `USER`: 用戶ID

## 🎯 功能特色

- ✅ **圖片預覽** - 上傳後立即顯示
- ✅ **Markdown渲染** - 自動渲染OCR結果
- ✅ **原始文本** - 可複製的純文本
- ✅ **Base64轉換** - 自動將圖片轉換為API格式
- ✅ **命令行工具** - 支援腳本化處理
EOF < /dev/null