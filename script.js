class OCRApp {
    constructor() {
        this.initElements();
        this.bindEvents();
        this.currentFile = null;
        
        // API 配置
        this.config = {
            apiBase: 'https://qa.agent.authme.ai',
            token: 'app-kqIvQN4oB409qguyMYWjXE8z',
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
        this.formattedView = document.getElementById('formattedView');
        this.markdownView = document.getElementById('markdownView');
        this.copyBtn = document.getElementById('copyBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.errorSection = document.getElementById('errorSection');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorResetBtn = document.getElementById('errorResetBtn');
        this.currentMarkdown = '';
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
        
        // Tab 切換事件
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', this.switchTab.bind(this));
        });
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
            this.resultSection.style.display = 'none';
            
            // 上傳圖片檔案
            const fileId = await this.uploadFile(this.currentFile);
            
            // 調用 API
            const result = await this.callOCRAPI(fileId);
            
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

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user', this.config.user);

        const response = await fetch(`${this.config.apiBase}/v1/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.token}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`文件上傳失敗: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.id;
    }

    async callOCRAPI(fileId) {
        const requestData = {
            inputs: {
                image: {
                    transfer_method: "local_file",
                    upload_file_id: fileId,
                    type: "image"
                }
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
            // 獲取 workflow 執行結果
            const outputs = apiResponse.result.response
            
            if (!outputs) {
                throw new Error('API 回應格式錯誤：未找到輸出結果');
            }

            return String(outputs);
            
        } catch (error) {
            throw new Error(`處理 API 回應失敗: ${error.message}`);
        }
    }

    parseMarkdownToHTML(markdown) {
        // 設定 marked 選項
        marked.setOptions({
            breaks: true,
            gfm: true,
            tables: true,
            sanitize: false,
            smartLists: true,
            smartypants: true,
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (e) {}
                }
                return hljs.highlightAuto(code).value;
            }
        });
        
        // 使用 marked 解析 markdown
        return marked.parse(markdown);
    }
    
    showResult(text) {
        this.hideAllSections();
        // 保持圖片預覽顯示
        this.previewSection.style.display = 'block';
        
        // 儲存 markdown 原文
        this.currentMarkdown = text;
        this.markdownView.value = text;
        
        // 解析並顯示格式化的 HTML
        const htmlContent = this.parseMarkdownToHTML(text);
        this.formattedView.innerHTML = htmlContent;
        
        this.resultSection.style.display = 'block';
    }
    
    switchTab(e) {
        const targetView = e.target.dataset.view;
        
        // 更新標籤狀態
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        e.target.classList.add('active');
        
        // 切換視圖
        document.querySelectorAll('.result-view').forEach(view => {
            view.classList.remove('active');
        });
        
        if (targetView === 'formatted') {
            this.formattedView.classList.add('active');
        } else {
            this.markdownView.classList.add('active');
        }
    }

    async copyResult() {
        try {
            // 複製當前顯示的內容
            const activeTab = document.querySelector('.tab-btn.active');
            const textToCopy = activeTab.dataset.view === 'formatted' 
                ? this.formattedView.innerText 
                : this.currentMarkdown;
            
            await navigator.clipboard.writeText(textToCopy);
            
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
            if (document.querySelector('.tab-btn.active').dataset.view === 'markdown') {
                this.markdownView.select();
                this.markdownView.setSelectionRange(0, 99999);
            }
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