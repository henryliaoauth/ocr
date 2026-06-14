class OCRApp {
    constructor() {
        this.initElements();
        this.bindEvents();
        this.currentFiles = [];
        this.selectedCategory = 'salaried';
        this.isAnalyzing = false;
        this.abortController = null;

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
        this.previewGrid = document.getElementById('previewGrid');
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.loadingSection = document.getElementById('loadingSection');
        this.resultSection = document.getElementById('resultSection');
        this.resultTabs = document.getElementById('resultTabs');
        this.emptyState = document.getElementById('emptyState');
        this.copyBtn = document.getElementById('copyBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.errorSection = document.getElementById('errorSection');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorResetBtn = document.getElementById('errorResetBtn');
        this.categorySelect = document.getElementById('categorySelect');
        this.statusDot = document.querySelector('.status-dot');
        this.statusText = document.querySelector('.status-text');
        this.reportView = document.getElementById('reportView');
        this.sourceView = document.getElementById('sourceView');
        this.progressFill = document.getElementById('progressFill');
        this.progressPct = document.getElementById('progressPct');
        this.loadingText = document.getElementById('loadingText');
        this.currentReportMarkdown = '';
        this.currentSourceMarkdown = '';
    }

    bindEvents() {
        this.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        this.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        this.analyzeBtn.addEventListener('click', this.analyzeImage.bind(this));
        // Per-thumbnail remove (event delegation on the grid).
        this.previewGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.thumb-remove');
            if (btn) this.removeFile(Number(btn.dataset.idx));
        });
        this.copyBtn.addEventListener('click', this.copyResult.bind(this));
        this.resetBtn.addEventListener('click', this.reset.bind(this));
        this.errorResetBtn.addEventListener('click', this.reset.bind(this));

        this.categorySelect.addEventListener('change', (e) => {
            this.selectedCategory = e.target.value;
        });

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
        if (e.dataTransfer.files.length > 0) this.processFiles(e.dataTransfer.files);
    }

    handleFileSelect(e) {
        if (e.target.files.length > 0) this.processFiles(e.target.files);
        // Allow re-selecting the same file(s) again later.
        e.target.value = '';
    }

    // Validate + optimize each picked image and append it to currentFiles.
    async processFiles(fileList) {
        const files = Array.from(fileList);
        this.setStatus('processing', 'Optimizing');
        let skipped = 0;
        for (const file of files) {
            if (!file.type.startsWith('image/')) { skipped++; continue; }
            if (file.size > 50 * 1024 * 1024) { skipped++; continue; }
            // Always normalize before upload: downscale to a sane resolution and
            // re-encode as JPEG. Smaller payload (each image goes out as base64
            // JSON, ~1.37x; Vercel caps the body at ~4.5MB), strips EXIF, flattens
            // transparency, and unifies the format. Target raw size <= 3MB.
            try {
                const processed = await this.prepareImage(file, 3 * 1024 * 1024, 2400);
                this.currentFiles.push(processed);
            } catch (e) {
                skipped++;
            }
        }
        this.setStatus('ready', 'Ready');

        if (!this.currentFiles.length) {
            this.showError('沒有可用的圖片，請選擇圖片檔');
            return;
        }
        if (skipped) {
            this.setStatus('ready', `已略過 ${skipped} 個非圖片／過大檔案`);
        }
        this.renderPreview();
    }

    removeFile(idx) {
        if (!Number.isInteger(idx)) return;
        this.currentFiles.splice(idx, 1);
        if (this.currentFiles.length) {
            this.renderPreview();
        } else {
            this.reset();
        }
    }

    // Downscale (longest side <= maxDim, never upscale) and JPEG-encode, stepping
    // quality — and if needed, dimensions — down until the blob is <= targetBytes.
    prepareImage(file, targetBytes, maxDim) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = async () => {
                URL.revokeObjectURL(url);
                const baseName = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';

                const encodeAtScale = async (scale) => {
                    const w = Math.max(1, Math.round(img.width * scale));
                    const h = Math.max(1, Math.round(img.height * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    let last = null;
                    for (const q of [0.92, 0.82, 0.7, 0.55, 0.42]) {
                        const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
                        if (!blob) continue;
                        last = blob;
                        if (blob.size <= targetBytes) return blob;
                    }
                    return last; // smallest achievable at this scale
                };

                // Start by fitting the longest side to maxDim (only ever shrink).
                let scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                let blob = await encodeAtScale(scale);
                // Still too big at lowest quality? shrink dimensions and retry.
                for (let i = 0; blob && blob.size > targetBytes && i < 4; i++) {
                    scale *= 0.8;
                    blob = await encodeAtScale(scale);
                }
                if (!blob) {
                    reject(new Error('encode failed'));
                    return;
                }
                resolve(new File([blob], baseName + '.jpg', { type: 'image/jpeg' }));
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Could not load image'));
            };
            img.src = url;
        });
    }

    async renderPreview() {
        const urls = await Promise.all(this.currentFiles.map((f) => this.fileToDataURL(f)));
        this.previewGrid.innerHTML = urls.map((src, i) => `
            <div class="thumb">
                <img src="${src}" alt="Preview ${i + 1}">
                <button class="thumb-remove" data-idx="${i}" title="移除這張">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>`).join('');
        this.uploadArea.parentElement.style.display = 'none';
        this.previewSection.style.display = 'flex';
    }

    async analyzeImage() {
        // Guard against double-clicks: ignore while a run is already in flight.
        if (this.isAnalyzing) return;
        if (!this.currentFiles.length) {
            this.showError('Please select an image first');
            return;
        }

        this.isAnalyzing = true;
        this.analyzeBtn.disabled = true;
        this.abortController = new AbortController();

        try {
            this.setStatus('processing', 'Analyzing');
            this.emptyState.style.display = 'none';
            this.resultSection.style.display = 'none';
            this.resultTabs.style.display = 'none';
            this.errorSection.style.display = 'none';
            this.loadingSection.style.display = 'flex';

            const result = await this.callOCRAPI(this.currentFiles, this.abortController.signal);
            this.showResult(result);
            this.setStatus('ready', 'Complete');
        } catch (error) {
            if (error.name === 'AbortError') {
                // Cancelled (e.g. via reset) — leave the UI as the canceller set it.
                return;
            }
            console.error('Analysis failed:', error);
            this.showError(error.message || 'Analysis failed, please retry');
            this.setStatus('error', 'Error');
        } finally {
            this.isAnalyzing = false;
            this.abortController = null;
            this.analyzeBtn.disabled = false;
        }
    }

    fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Could not read file'));
            reader.readAsDataURL(file);
        });
    }

    // The workflow's `images` (files-type) input only ingests an array of file
    // objects { name, type, data } where data is RAW base64 (no data: prefix).
    // Plain data-URL strings are silently dropped ("未收到圖片"), so build the
    // object form here.
    async fileToImagePart(file) {
        const durl = await this.fileToDataURL(file);
        const comma = durl.indexOf(',');
        return {
            name: file.name || 'image.jpg',
            type: file.type || 'image/jpeg',
            data: comma >= 0 ? durl.slice(comma + 1) : durl,
        };
    }

    async errorMessage(response) {
        try {
            const j = JSON.parse(await response.text());
            return this.friendlyError(j.message || j.error || `API error: ${response.status}`);
        } catch {
            return `API error: ${response.status}`;
        }
    }

    async callOCRAPI(files, signal) {
        // Async flow: submit the images, get back a status path, then poll it
        // from the browser until the background run completes. This is the only
        // mode that escapes the platform's 30s synchronous-execution cap; the
        // tradeoff is no partial output (the poll returns until fully done).
        // Splitting submit and each poll into separate short requests keeps every
        // call well under Vercel's per-invocation time limit.
        const images = await Promise.all(files.map((f) => this.fileToImagePart(f)));
        const stopProgress = this.startSimulatedProgress();
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        try {
            // 1) Submit — returns a status path to poll.
            const subRes = await fetch(this.config.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Access-Token': this.config.accessToken
                },
                body: JSON.stringify({ images, category: this.selectedCategory }),
                signal
            });
            if (!subRes.ok) throw new Error(await this.errorMessage(subRes));
            const { statusPath } = await subRes.json();
            if (!statusPath) throw new Error('提交失敗：未取得查詢路徑');

            // 2) Poll until the background run finishes (cap ~9 min — multi-doc
            // analysis with several images can take a while).
            const deadline = Date.now() + 540000;
            while (Date.now() < deadline) {
                await sleep(2000);
                const pollRes = await fetch(
                    `${this.config.apiUrl}?status=${encodeURIComponent(statusPath)}`,
                    { headers: { 'X-Access-Token': this.config.accessToken }, signal }
                );
                if (!pollRes.ok) throw new Error(await this.errorMessage(pollRes));
                const data = await pollRes.json();

                if (data.status === 'completed') {
                    this.setProgress(100);
                    await sleep(200);
                    // data.output is the response node ({ __responseNode, body, ... }).
                    return this.extractResponse(data.output ?? data);
                }
                if (data.status === 'failed' || data.status === 'cancelled') {
                    const detail = typeof data.error === 'string'
                        ? data.error
                        : (data.error ? JSON.stringify(data.error) : '分析失敗');
                    throw new Error(this.friendlyError(detail));
                }
            }
            throw new Error('分析逾時：背景執行超過 9 分鐘仍未完成');
        } finally {
            stopProgress();
        }
    }

    // Turn a raw upstream payload (plain JSON or an SSE event stream) into the
    // { reportMarkdown, sourceMarkdown } result.
    extractFromText(text) {
        const trimmed = (text || '').trim();

        // Plain JSON body.
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try { return this.extractResponse(JSON.parse(trimmed)); } catch {}
        }

        // SSE stream: scan every `data:` line, parse the JSON event, and keep
        // the last one that contains a response node (execution:completed sits
        // at the end and carries it under data.outputs). Also watch for an
        // `event: error` frame the platform emits on timeout/failure.
        if (text.includes('data:')) {
            let found = null;
            let errorMsg = null;
            let inErrorEvent = false;
            for (const line of text.split('\n')) {
                const l = line.trim();
                if (l.startsWith('event:')) {
                    inErrorEvent = l.slice(6).trim() === 'error';
                    continue;
                }
                if (!l.startsWith('data:')) continue;
                const raw = l.slice(5).trim();
                if (!raw || raw === '[DONE]') continue;
                try {
                    const evt = JSON.parse(raw);
                    const node = this.findResponseNode(evt);
                    if (node) found = node;
                    if (evt.type === 'execution:failed' || evt.error) {
                        errorMsg = evt.message || evt.error || errorMsg;
                    }
                } catch {
                    // Non-JSON data line under an `event: error` frame = the error text.
                    if (inErrorEvent) errorMsg = raw;
                }
            }
            if (found) return this.extractResponse(found);
            if (errorMsg) throw new Error(this.friendlyError(errorMsg));
        }

        // Fallback: hand the raw text to extractResponse (last resort).
        return this.extractResponse(text);
    }

    // Map raw upstream error strings to clearer Chinese messages.
    friendlyError(msg) {
        if (/timeout after 30000|30000ms/i.test(msg)) {
            return '分析逾時：此工作流在平台端執行超過 30 秒上限而被中止。請改用較小／較清晰的圖片，或在平台端縮短工作流（減少 agent 步驟、換較快的模型），或改用非同步執行。';
        }
        return msg;
    }

    setProgress(pct) {
        this.progressFill.style.width = pct + '%';
        this.progressPct.textContent = pct + '%';
    }

    // Eases the bar toward 90% on a timer; returns a stop function.
    startSimulatedProgress() {
        let pct = 0;
        this.setProgress(0);
        const id = setInterval(() => {
            pct += Math.max(0.5, (90 - pct) * 0.07);
            if (pct > 90) pct = 90;
            this.setProgress(Math.round(pct));
        }, 200);
        return () => clearInterval(id);
    }

    // The workflow result is a graph of nodes; the one we want is flagged
    // __responseNode and may be nested under a container key, not at the top.
    findResponseNode(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 6) return null;
        if (obj.__responseNode) return obj;
        for (const key of Object.keys(obj)) {
            const found = this.findResponseNode(obj[key], depth + 1);
            if (found) return found;
        }
        return null;
    }

    extractResponse(apiResponse) {
        try {
            // Unwrap the response node ({ __responseNode: true, body: ... }),
            // wherever it sits in the node graph.
            let data = apiResponse;
            const node = this.findResponseNode(apiResponse);
            if (node) {
                data = node.body;
                // body might be double-encoded as a JSON string
                if (typeof data === 'string') {
                    try { data = JSON.parse(data); } catch {}
                }
            }

            // Envelope format from workflow
            if (data && data.report && data.report.markdown) {
                return {
                    reportMarkdown: data.report.markdown,
                    sourceMarkdown: data.source_markdown || ''
                };
            }
            // Fallback: plain OCR text (no structured analysis from workflow)
            const text = typeof data === 'string' ? data
                : data.result ? String(data.result)
                : data.response ? String(data.response)
                : data.text ? String(data.text)
                : JSON.stringify(data, null, 2);
            return { reportMarkdown: text, sourceMarkdown: text };
        } catch (error) {
            throw new Error(`Failed to process response: ${error.message}`);
        }
    }

    escapeHtml(s) {
        return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
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

    showResult({ reportMarkdown, sourceMarkdown }) {
        this.loadingSection.style.display = 'none';
        this.emptyState.style.display = 'none';
        this.errorSection.style.display = 'none';

        // 原文 OCR shows the raw markdown source (unrendered). If the workflow
        // returns no separate source_markdown, fall back to the report markdown
        // so this tab always holds the original markdown.
        const rawMarkdown = sourceMarkdown || reportMarkdown || '';
        this.currentReportMarkdown = reportMarkdown;
        this.currentSourceMarkdown = rawMarkdown;

        this.reportView.innerHTML = this.parseMarkdownToHTML(reportMarkdown);
        this.sourceView.innerHTML = rawMarkdown
            ? `<pre class="raw-markdown">${this.escapeHtml(rawMarkdown)}</pre>`
            : '<p style="color:var(--text-muted)">（無原文）</p>';

        // Reset to report tab
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === 'report'));
        this.reportView.classList.add('active');
        this.sourceView.classList.remove('active');

        if (window.MathJax) {
            window.MathJax.typesetPromise([this.reportView]).catch((e) => {
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

        this.reportView.classList.toggle('active', targetView === 'report');
        this.sourceView.classList.toggle('active', targetView === 'source');

        // Only the report is rendered; the source tab is raw markdown, so leave it alone.
        if (window.MathJax && targetView === 'report') {
            window.MathJax.typesetPromise([this.reportView]).catch((e) => {
                console.error('MathJax rendering error:', e);
            });
        }
    }

    async copyResult() {
        try {
            const activeTab = document.querySelector('.tab-btn.active');
            const textToCopy = activeTab.dataset.view === 'report'
                ? this.currentReportMarkdown
                : this.currentSourceMarkdown;

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
        // Terminate any in-flight analysis before clearing state.
        if (this.abortController) this.abortController.abort();
        this.isAnalyzing = false;
        this.analyzeBtn.disabled = false;

        this.currentFiles = [];
        this.fileInput.value = '';
        this.currentReportMarkdown = '';
        this.currentSourceMarkdown = '';
        this.selectedCategory = 'salaried';
        this.categorySelect.value = 'salaried';

        this.previewGrid.innerHTML = '';
        this.uploadArea.parentElement.style.display = '';
        this.previewSection.style.display = 'none';
        this.loadingSection.style.display = 'none';
        this.resultSection.style.display = 'none';
        this.resultTabs.style.display = 'none';
        this.errorSection.style.display = 'none';
        this.emptyState.style.display = '';

        this.reportView.innerHTML = '';
        this.sourceView.innerHTML = '';

        this.setStatus('ready', 'Ready');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new OCRApp();
});
