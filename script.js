class OCRApp {
    constructor() {
        this.initElements();
        this.bindEvents();
        this.currentFile = null;
        
        // API 配置
        this.config = {
            apiBase: 'https://qa.agent.authme.ai',
            token: 'app-a3mA4KYAWKYexq6GSbTde9Tb',
            user: 'ocr-web'
        };
    }

    initElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.previewSection = document.getElementById('previewSection');
        this.previewImage = document.getElementById('previewImage');
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.loadingSection = document.getElementById('loadingSection');
        this.resultSection = document.getElementById('resultSection');
        this.resultText = document.getElementById('resultText');
        this.copyBtn = document.getElementById('copyBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.errorSection = document.getElementById('errorSection');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorResetBtn = document.getElementById('errorResetBtn');
    }

    bindEvents() {
        // 上傳區域事件
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        this.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        
        // 檔案選擇事件
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        
        // 按鈕事件
        this.analyzeBtn.addEventListener('click', this.analyzeImage.bind(this));
        this.copyBtn.addEventListener('click', this.copyResult.bind(this));
        this.resetBtn.addEventListener('click', this.reset.bind(this));
        this.errorResetBtn.addEventListener('click', this.reset.bind(this));
    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.processFile(file);
        }
    }

    processFile(file) {
        // 檢查檔案類型
        if (!file.type.startsWith('image/')) {
            this.showError('請選擇圖片檔案');
            return;
        }

        // 檢查檔案大小 (限制 10MB)
        if (file.size > 10 * 1024 * 1024) {
            this.showError('檔案大小不能超過 10MB');
            return;
        }

        this.currentFile = file;
        this.showPreview(file);
    }

    showPreview(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.previewImage.src = e.target.result;
            this.hideAllSections();
            this.previewSection.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }

    async analyzeImage() {
        if (!this.currentFile) {
            this.showError('請先選擇圖片');
            return;
        }

        try {
            this.hideAllSections();
            this.loadingSection.style.display = 'block';

            // 轉換圖片為 Base64
            const base64Data = await this.fileToBase64(this.currentFile);
            
            // 調用 API
            const result = await this.callOCRAPI(base64Data);
            
            // 顯示結果
            this.showResult(result);
            
        } catch (error) {
            console.error('分析失敗:', error);
            this.showError(error.message || '分析失敗，請重試');
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // 移除 data:image/xxx;base64, 前綴
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async callOCRAPI(base64Data) {
        const requestData = {
            inputs: {
                base64: base64Data
            },
            response_mode: "blocking",
            user: this.config.user
        };

        const response = await fetch(`${this.config.apiBase}/v1/scenarios/run`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`API 錯誤: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return this.extractResponse(data);
    }

    extractResponse(apiResponse) {
        try {
            // 獲取 result.response
            const responseContent = apiResponse.result?.response;
            
            if (!responseContent) {
                throw new Error('API 回應格式錯誤');
            }

            // 檢查是否為 JSON 字符串
            if (typeof responseContent === 'string') {
                try {
                    // 嘗試解析為 JSON
                    const parsed = JSON.parse(responseContent);
                    // 如果是對象且包含文字內容，提取文字
                    if (typeof parsed === 'object' && parsed.text) {
                        return parsed.text;
                    }
                    return responseContent;
                } catch (jsonError) {
                    // 如果不是 JSON，直接返回文本
                    return responseContent;
                }
            } else if (typeof responseContent === 'object') {
                // 如果是對象，嘗試提取文字
                if (responseContent.text) {
                    return responseContent.text;
                }
                return JSON.stringify(responseContent, null, 2);
            }
            
            return String(responseContent);
            
        } catch (error) {
            throw new Error(`處理 API 回應失敗: ${error.message}`);
        }
    }

    showResult(text) {
        this.hideAllSections();
        // 保持圖片預覽顯示
        this.previewSection.style.display = 'block';
        this.resultText.value = text;
        this.resultSection.style.display = 'block';
    }

    async copyResult() {
        try {
            await navigator.clipboard.writeText(this.resultText.value);
            
            // 顯示複製成功提示
            const originalText = this.copyBtn.textContent;
            this.copyBtn.textContent = '已複製!';
            this.copyBtn.style.background = '#059669';
            
            setTimeout(() => {
                this.copyBtn.textContent = originalText;
                this.copyBtn.style.background = '#10b981';
            }, 2000);
            
        } catch (error) {
            console.error('複製失敗:', error);
            // 降級方案：選中文字
            this.resultText.select();
            this.resultText.setSelectionRange(0, 99999);
        }
    }

    showError(message) {
        this.hideAllSections();
        // 如果有圖片預覽，也保持顯示
        if (this.currentFile) {
            this.previewSection.style.display = 'block';
        }
        this.errorMessage.textContent = message;
        this.errorSection.style.display = 'block';
    }

    reset() {
        this.currentFile = null;
        this.fileInput.value = '';
        this.hideAllSections();
    }

    hideAllSections() {
        // this.previewSection.style.display = 'none';
        this.loadingSection.style.display = 'none';
        // this.resultSection.style.display = 'none';
        this.errorSection.style.display = 'none';
    }
}

// 初始化應用
document.addEventListener('DOMContentLoaded', () => {
    new OCRApp();
});