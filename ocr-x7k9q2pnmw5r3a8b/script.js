class OCRApp {
    constructor() {
        this.initElements();
        this.bindEvents();
        this.currentFile = null;

        // Access token is the first path segment (the slug used to reach this page).
        const slug = window.location.pathname.split('/').filter(Boolean)[0] || '';
        this.config = {
            apiUrl: '/api/ocr',
            accessToken: slug
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
        this.resultTabs = document.getElementById('resultTabs');
        this.emptyState = document.getElementById('emptyState');
        this.formattedView = document.getElementById('formattedView');
        this.markdownView = document.getElementById('markdownView');
        this.copyBtn = document.getElementById('copyBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.errorSection = document.getElementById('errorSection');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorResetBtn = document.getElementById('errorResetBtn');
        this.removeBtn = document.getElementById('removeBtn');
        this.statusDot = document.querySelector('.status-dot');
        this.statusText = document.querySelector('.status-text');
        this.currentMarkdown = '';
    }

    bindEvents() {
        this.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        this.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        this.analyzeBtn.addEventListener('click', this.analyzeImage.bind(this));
        this.removeBtn.addEventListener('click', this.reset.bind(this));
        this.copyBtn.addEventListener('click', this.copyResult.bind(this));
        this.resetBtn.addEventListener('click', this.reset.bind(this));
        this.errorResetBtn.addEventListener('click', this.reset.bind(this));

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', this.switchTab.bind(this));
        });
    }

    setStatus(state, text) {
        this.statusText.textContent = text;
        if (state === 'ready') {
            this.statusDot.style.background = '#22c55e';
            this.statusDot.style.boxShadow = '0 0 6px rgba(34,197,94,0.4)';
        } else if (state === 'processing') {
            this.statusDot.style.background = 'var(--accent)';
            this.statusDot.style.boxShadow = '0 0 6px rgba(96,165,250,0.4)';
        } else if (state === 'error') {
            this.statusDot.style.background = '#ef4444';
            this.statusDot.style.boxShadow = '0 0 6px rgba(239,68,68,0.4)';
        }
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
        if (files.length > 0) this.processFile(files[0]);
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) this.processFile(file);
    }

    async processFile(file) {
        if (!file.type.startsWith('image/')) {
            this.showError('Please select an image file');
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            this.showError('File size cannot exceed 50MB');
            return;
        }

        // Vercel serverless functions cap request body at ~4.5MB; leave buffer.
        const targetBytes = 4.3 * 1024 * 1024;
        let processed = file;
        if (file.size > targetBytes) {
            this.setStatus('processing', 'Compressing');
            try {
                processed = await this.compressImage(file, targetBytes);
            } catch (e) {
                this.showError('Image is too large to compress under 4.5MB');
                this.setStatus('ready', 'Ready');
                return;
            }
            this.setStatus('ready', 'Ready');
        }

        this.currentFile = processed;
        this.showPreview(processed);
    }

    compressImage(file, targetBytes) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = async () => {
                URL.revokeObjectURL(url);
                const maxDim = 2400;
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    const ratio = Math.min(maxDim / width, maxDim / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                for (const quality of [0.85, 0.7, 0.55, 0.4]) {
                    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
                    if (blob && blob.size <= targetBytes) {
                        const baseName = file.name.replace(/\.[^.]+$/, '');
                        resolve(new File([blob], baseName + '.jpg', { type: 'image/jpeg' }));
                        return;
                    }
                }
                reject(new Error('Compression failed'));
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Could not load image'));
            };
            img.src = url;
        });
    }

    showPreview(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.previewImage.src = e.target.result;
            this.uploadArea.parentElement.style.display = 'none';
            this.previewSection.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }

    async analyzeImage() {
        if (!this.currentFile) {
            this.showError('Please select an image first');
            return;
        }

        try {
            this.setStatus('processing', 'Analyzing');
            this.emptyState.style.display = 'none';
            this.resultSection.style.display = 'none';
            this.resultTabs.style.display = 'none';
            this.errorSection.style.display = 'none';
            this.loadingSection.style.display = 'flex';

            const result = await this.callOCRAPI(this.currentFile);
            this.showResult(result);
            this.setStatus('ready', 'Complete');
        } catch (error) {
            console.error('Analysis failed:', error);
            this.showError(error.message || 'Analysis failed, please retry');
            this.setStatus('error', 'Error');
        }
    }

    async callOCRAPI(file) {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(this.config.apiUrl, {
            method: 'POST',
            headers: {
                'X-Access-Token': this.config.accessToken
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
        return this.extractResponse(data);
    }

    extractResponse(apiResponse) {
        try {
            if (typeof apiResponse === 'string') return apiResponse;
            if (apiResponse.body) return String(apiResponse.body);
            if (apiResponse.result) return String(apiResponse.result);
            if (apiResponse.response) return String(apiResponse.response);
            if (apiResponse.text) return String(apiResponse.text);
            return JSON.stringify(apiResponse, null, 2);
        } catch (error) {
            throw new Error(`Failed to process response: ${error.message}`);
        }
    }

    parseMarkdownToHTML(markdown) {
        marked.setOptions({
            breaks: true,
            gfm: true,
            tables: true,
            sanitize: false,
            smartLists: true,
            smartypants: true,
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try { return hljs.highlight(code, { language: lang }).value; } catch (e) {}
                }
                return hljs.highlightAuto(code).value;
            }
        });

        // Protect math expressions from markdown's backslash-escape rules so MathJax can pick them up later.
        const mathBlocks = [];
        const stash = (m) => {
            mathBlocks.push(m);
            return `@@MATH${mathBlocks.length - 1}@@`;
        };
        const protectedMd = markdown
            .replace(/\\\[[\s\S]+?\\\]/g, stash)
            .replace(/\\\([\s\S]+?\\\)/g, stash);

        let html = marked.parse(protectedMd);
        html = html.replace(/@@MATH(\d+)@@/g, (_, i) => mathBlocks[Number(i)]);
        return html;
    }

    showResult(text) {
        this.loadingSection.style.display = 'none';
        this.emptyState.style.display = 'none';
        this.errorSection.style.display = 'none';

        this.currentMarkdown = text;
        this.markdownView.value = text;

        const htmlContent = this.parseMarkdownToHTML(text);
        this.formattedView.innerHTML = htmlContent;

        if (window.MathJax) {
            window.MathJax.typesetPromise([this.formattedView]).catch((e) => {
                console.error('MathJax rendering error:', e);
            });
        }

        this.resultTabs.style.display = 'flex';
        this.resultSection.style.display = 'flex';
    }

    switchTab(e) {
        const targetView = e.target.dataset.view;

        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        document.querySelectorAll('.result-view').forEach(view => view.classList.remove('active'));

        if (targetView === 'formatted') {
            this.formattedView.classList.add('active');
            if (window.MathJax) {
                window.MathJax.typesetPromise([this.formattedView]).catch((e) => {
                    console.error('MathJax rendering error:', e);
                });
            }
        } else {
            this.markdownView.classList.add('active');
        }
    }

    async copyResult() {
        try {
            const activeTab = document.querySelector('.tab-btn.active');
            const textToCopy = activeTab.dataset.view === 'formatted'
                ? this.formattedView.innerText
                : this.currentMarkdown;

            await navigator.clipboard.writeText(textToCopy);

            const btn = this.copyBtn;
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied';
            btn.style.borderColor = 'var(--success)';
            btn.style.color = 'var(--success)';

            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.borderColor = '';
                btn.style.color = '';
            }, 2000);
        } catch (error) {
            console.error('Copy failed:', error);
            if (document.querySelector('.tab-btn.active').dataset.view === 'markdown') {
                this.markdownView.select();
                this.markdownView.setSelectionRange(0, 99999);
            }
        }
    }

    showError(message) {
        this.loadingSection.style.display = 'none';
        this.emptyState.style.display = 'none';
        this.resultSection.style.display = 'none';
        this.resultTabs.style.display = 'none';
        this.errorMessage.textContent = message;
        this.errorSection.style.display = 'flex';
        this.setStatus('error', 'Error');
    }

    reset() {
        this.currentFile = null;
        this.fileInput.value = '';
        this.currentMarkdown = '';

        this.uploadArea.parentElement.style.display = '';
        this.previewSection.style.display = 'none';
        this.loadingSection.style.display = 'none';
        this.resultSection.style.display = 'none';
        this.resultTabs.style.display = 'none';
        this.errorSection.style.display = 'none';
        this.emptyState.style.display = '';

        this.formattedView.innerHTML = '';
        this.markdownView.value = '';

        this.setStatus('ready', 'Ready');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new OCRApp();
});
