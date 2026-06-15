class OCRApp {
    constructor() {
        this.initElements();
        this.bindEvents();
        this.initResizer();
        this.currentFiles = [];
        this.selectedCategory = 'salaried';
        this.isAnalyzing = false;
        this.abortController = null;
        // Bundled sample images, listed per category in test/samples/manifest.json.
        this.sampleManifest = null;
        this.sampleBase = '/test/samples';
        this.loadSampleManifest();

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
        this.stageEmpty = document.getElementById('stageEmpty');
        this.stageCount = document.getElementById('stageCount');
        this.sourceActions = document.getElementById('sourceActions');
        this.actionHint = document.getElementById('actionHint');
        this.sampleSection = document.getElementById('sampleSection');
        this.sampleGrid = document.getElementById('sampleGrid');
        this.sampleLoadAll = document.getElementById('sampleLoadAll');
        this.statusDot = document.querySelector('.status-dot');
        this.statusText = document.querySelector('.status-text');
        this.reportView = document.getElementById('reportView');
        this.ocrView = document.getElementById('ocrView');
        this.sourceView = document.getElementById('sourceView');
        this.lightbox = document.getElementById('lightbox');
        this.lightboxImg = document.getElementById('lightboxImg');
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
        // The center stage doubles as a drop target so documents can be dragged
        // straight onto the (wide) viewing area, not only the left rail's dropzone.
        if (this.stageEmpty) {
            this.stageEmpty.addEventListener('dragover', (e) => { e.preventDefault(); this.stageEmpty.classList.add('dragover'); });
            this.stageEmpty.addEventListener('dragleave', (e) => { e.preventDefault(); this.stageEmpty.classList.remove('dragover'); });
            this.stageEmpty.addEventListener('drop', (e) => {
                e.preventDefault();
                this.stageEmpty.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) this.processFiles(e.dataTransfer.files);
            });
        }
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        this.analyzeBtn.addEventListener('click', this.analyzeImage.bind(this));
        // Per-thumbnail remove / zoom (event delegation on the grid).
        this.previewGrid.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.thumb-remove');
            if (removeBtn) { this.removeFile(Number(removeBtn.dataset.idx)); return; }
            const zoom = e.target.closest('[data-zoom]');
            if (zoom) this.openLightbox(zoom.dataset.zoom);
        });
        this.copyBtn.addEventListener('click', this.copyResult.bind(this));
        this.resetBtn.addEventListener('click', this.reset.bind(this));
        this.errorResetBtn.addEventListener('click', this.reset.bind(this));

        this.categorySelect.addEventListener('change', (e) => {
            this.selectedCategory = e.target.value;
            this.renderSampleGallery();
        });

        // Sample picker: click a thumbnail to add that sample image; the corner
        // magnifier opens the full image in the lightbox instead of adding it.
        this.sampleGrid.addEventListener('click', (e) => {
            const zoom = e.target.closest('.sample-zoom');
            if (zoom) { this.openLightbox(zoom.dataset.zoom); return; }
            const cell = e.target.closest('.sample-cell');
            if (cell && !cell.classList.contains('loading')) {
                this.addSample(cell.dataset.path, cell.dataset.name);
            }
        });
        this.sampleLoadAll.addEventListener('click', this.loadAllSamples.bind(this));

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', this.switchTab.bind(this));
        });

        // Lightbox: click the backdrop (or the image) to close; Esc also closes.
        if (this.lightbox) {
            this.lightbox.addEventListener('click', () => this.closeLightbox());
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.lightbox && this.lightbox.classList.contains('open')) {
                this.closeLightbox();
            }
        });
    }

    // Drag the splitter between the center stage and the analysis column to
    // rebalance their widths. The center flexes; we only ever set the right
    // column's width (a CSS custom property), and remember it across visits.
    initResizer() {
        const main = document.querySelector('main');
        const resizer = document.getElementById('colResizer');
        const right = document.querySelector('.panel-output');
        if (!main || !resizer || !right) return;

        const MIN = 320;          // analysis column never narrower than this
        const RAIL = 280;         // left rail upper bound
        const CENTER_MIN = 360;   // keep the document stage usable
        const maxRight = () => Math.max(MIN, main.clientWidth - RAIL - CENTER_MIN - 6);
        const clampW = (w) => Math.max(MIN, Math.min(maxRight(), w));
        const apply = (w) => main.style.setProperty('--right-w', clampW(w) + 'px');
        const save = () => {
            try { localStorage.setItem('ocrRightW', main.style.getPropertyValue('--right-w')); } catch (e) {}
        };

        // Restore a saved width (re-clamped to the current viewport).
        try {
            const saved = parseFloat(localStorage.getItem('ocrRightW'));
            if (saved > 0) apply(saved);
        } catch (e) {}

        let startX = 0, startW = 0, dragging = false;
        resizer.addEventListener('pointerdown', (e) => {
            dragging = true;
            startX = e.clientX;
            startW = right.getBoundingClientRect().width;
            resizer.setPointerCapture(e.pointerId);
            resizer.classList.add('dragging');
            document.body.style.userSelect = 'none';
        });
        resizer.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            // Dragging the splitter left widens the right (analysis) column.
            apply(startW - (e.clientX - startX));
        });
        const end = (e) => {
            if (!dragging) return;
            dragging = false;
            resizer.classList.remove('dragging');
            document.body.style.userSelect = '';
            try { resizer.releasePointerCapture(e.pointerId); } catch (err) {}
            save();
        };
        resizer.addEventListener('pointerup', end);
        resizer.addEventListener('pointercancel', end);

        // Keyboard nudge for accessibility.
        resizer.addEventListener('keydown', (e) => {
            const cur = right.getBoundingClientRect().width;
            if (e.key === 'ArrowLeft') apply(cur + 24);
            else if (e.key === 'ArrowRight') apply(cur - 24);
            else return;
            e.preventDefault();
            save();
        });

        // Re-clamp when the viewport shrinks past the saved width.
        window.addEventListener('resize', () => {
            if (main.style.getPropertyValue('--right-w')) {
                apply(right.getBoundingClientRect().width);
            }
        });
    }

    openLightbox(src) {
        if (!src || !this.lightbox) return;
        this.lightboxImg.src = src;
        this.lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    closeLightbox() {
        if (!this.lightbox) return;
        this.lightbox.classList.remove('open');
        this.lightboxImg.src = '';
        document.body.style.overflow = '';
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
        this.renderPreview(true);
    }

    removeFile(idx) {
        if (!Number.isInteger(idx)) return;
        this.currentFiles.splice(idx, 1);
        if (this.currentFiles.length) {
            this.renderPreview();
        } else {
            this.reset();
        }
        this.syncSampleSelected();
    }

    // ---- Bundled sample images (test/samples/<category>/...) ----

    async loadSampleManifest() {
        try {
            const res = await fetch(`${this.sampleBase}/manifest.json`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`manifest ${res.status}`);
            const data = await res.json();
            // Guard against the SPA catch-all returning index.html as text.
            if (data && typeof data === 'object') {
                this.sampleManifest = data;
                this.renderSampleGallery();
            }
        } catch (e) {
            // No samples available (e.g. host blocks the path) — just hide the section.
            console.warn('Sample manifest unavailable:', e.message);
        }
    }

    sampleDisplayName(filename) {
        return filename.replace(/^\d+[_-]/, '').replace(/\.[^.]+$/, '');
    }

    sampleUrl(filename) {
        return `${this.sampleBase}/${this.selectedCategory}/${encodeURIComponent(filename)}`;
    }

    renderSampleGallery() {
        if (!this.sampleManifest) return;
        const files = this.sampleManifest[this.selectedCategory] || [];
        if (!files.length) {
            this.sampleSection.style.display = 'none';
            return;
        }
        this.sampleGrid.innerHTML = files.map((name) => {
            const url = this.sampleUrl(name);
            return `
            <button type="button" class="sample-cell" data-path="${url}" data-name="${this.escapeHtml(name)}" title="${this.escapeHtml(name)}">
                <img src="${url}" alt="${this.escapeHtml(name)}" loading="lazy">
                <span class="sample-zoom" data-zoom="${url}" title="放大檢視">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="7"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        <line x1="11" y1="8" x2="11" y2="14"></line>
                        <line x1="8" y1="11" x2="14" y2="11"></line>
                    </svg>
                </span>
                <span class="sample-name">${this.escapeHtml(this.sampleDisplayName(name))}</span>
                <span class="sample-check">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </span>
            </button>`;
        }).join('');
        this.sampleSection.style.display = 'block';
        this.syncSampleSelected();
    }

    // Reflect which samples are currently queued (matched by their source URL).
    syncSampleSelected() {
        const loaded = new Set(this.currentFiles.map((f) => f._sampleKey).filter(Boolean));
        this.sampleGrid.querySelectorAll('.sample-cell').forEach((cell) => {
            cell.classList.toggle('selected', loaded.has(cell.dataset.path));
        });
    }

    // Toggle a single sample: add it if not queued, remove it if already queued.
    async addSample(path, name) {
        const existingIdx = this.currentFiles.findIndex((f) => f._sampleKey === path);
        if (existingIdx >= 0) {
            this.removeFile(existingIdx);
            return;
        }
        const cell = this.sampleGrid.querySelector(`.sample-cell[data-path="${CSS.escape(path)}"]`);
        if (cell) cell.classList.add('loading');
        try {
            const file = await this.fetchSampleFile(path, name);
            this.currentFiles.push(file);
            await this.renderPreview(true);
        } catch (e) {
            this.showError('範例載入失敗，請稍後再試');
        } finally {
            if (cell) cell.classList.remove('loading');
            this.syncSampleSelected();
        }
    }

    async loadAllSamples() {
        const files = (this.sampleManifest && this.sampleManifest[this.selectedCategory]) || [];
        for (const name of files) {
            const url = this.sampleUrl(name);
            if (this.currentFiles.some((f) => f._sampleKey === url)) continue;
            try {
                const file = await this.fetchSampleFile(url, name);
                this.currentFiles.push(file);
            } catch (e) { /* skip the ones that fail */ }
        }
        if (this.currentFiles.length) await this.renderPreview(true);
        this.syncSampleSelected();
    }

    // Fetch a bundled sample, run it through the same optimize path as uploads,
    // and tag it with its source URL so the gallery can track selection.
    async fetchSampleFile(path, name) {
        const res = await fetch(path, { cache: 'force-cache' });
        if (!res.ok) throw new Error(`sample ${res.status}`);
        const blob = await res.blob();
        const raw = new File([blob], name, { type: blob.type || 'image/jpeg' });
        const processed = await this.prepareImage(raw, 3 * 1024 * 1024, 2400);
        processed._sampleKey = path;
        return processed;
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

    // Vercel serverless functions reject any request body over ~4.5MB (413). The
    // images go up as base64 JSON (~1.37x the raw bytes), so the LIMIT IS ON THE
    // COMBINED payload, not per image. Per-image optimization isn't enough — two
    // 3MB images already blow the cap. Here we enforce a shared raw-byte budget
    // across all queued images and re-encode (downscale + lower quality) only when
    // the total would overflow. 3.0MB raw -> ~4.1MB base64, safely under the cap.
    async packWithinBudget(files) {
        const TOTAL_RAW_BUDGET = 3.0 * 1024 * 1024;
        const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
        if (totalSize <= TOTAL_RAW_BUDGET) return files;
        // Split the budget evenly; tighten the dimension cap as the count grows so
        // each image actually converges to its (smaller) share.
        const per = Math.floor(TOTAL_RAW_BUDGET / files.length);
        const maxDim = files.length <= 2 ? 2200 : (files.length <= 4 ? 1800 : 1500);
        return Promise.all(files.map((f) => this.prepareImage(f, per, maxDim)));
    }

    async renderPreview(scrollToNew = false) {
        const urls = await Promise.all(this.currentFiles.map((f) => this.fileToDataURL(f)));
        this.previewGrid.innerHTML = urls.map((src, i) => {
            const idx = String(i + 1).padStart(2, '0');
            const name = this.escapeHtml(this.currentFiles[i].name || `文件 ${i + 1}`);
            return `
            <figure class="doc-card">
                <figcaption class="doc-head">
                    <span class="doc-index">${idx}</span>
                    <span class="doc-name" title="${name}">${name}</span>
                    <span class="doc-tools">
                        <button class="thumb-zoom" data-zoom="${src}" title="放大檢視">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="7"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                <line x1="11" y1="8" x2="11" y2="14"></line>
                                <line x1="8" y1="11" x2="14" y2="11"></line>
                            </svg>
                        </button>
                        <button class="thumb-remove" data-idx="${i}" title="移除這張">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </span>
                </figcaption>
                <div class="doc-image">
                    <img src="${src}" alt="Preview ${i + 1}" data-zoom="${src}" title="點擊放大檢視">
                </div>
            </figure>`;
        }).join('');
        const count = this.currentFiles.length;
        if (this.stageEmpty) this.stageEmpty.style.display = 'none';
        if (this.stageCount) {
            this.stageCount.textContent = `${count} 份`;
            this.stageCount.style.display = 'inline-flex';
        }
        // Keep the primary action visible in the left rail and reflect the count
        // there too, so the user sees the document was added without having to
        // scroll the (growing) center stage.
        if (this.sourceActions) this.sourceActions.style.display = 'flex';
        if (this.actionHint) this.actionHint.textContent = `已選 ${count} 份`;
        this.previewSection.style.display = 'flex';

        // After adding, scroll the new (last) page into view and flash it so the
        // user can tell their click landed even when the stack runs off-screen.
        // Wait for the new image to load first, otherwise the card has ~0 height
        // and scrollIntoView lands in the wrong place.
        if (scrollToNew) {
            const last = this.previewGrid.lastElementChild;
            if (last) {
                const reveal = () => {
                    last.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    last.classList.add('doc-card--flash');
                    last.addEventListener('animationend', () => last.classList.remove('doc-card--flash'), { once: true });
                };
                const img = last.querySelector('img');
                if (img && !img.complete) {
                    img.addEventListener('load', reveal, { once: true });
                    img.addEventListener('error', reveal, { once: true });
                } else {
                    reveal();
                }
            }
        }
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
        const packed = await this.packWithinBudget(files);
        const images = await Promise.all(packed.map((f) => this.fileToImagePart(f)));
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
        if (/\b413\b|content too large|payload too large|request entity too large/i.test(msg)) {
            return '圖片總量過大：上傳的圖片加總超過伺服器上限（約 4.5MB）。請減少圖片張數，或改用較小／壓縮過的圖片再試。';
        }
        if (/timeout after 30000|30000ms/i.test(msg)) {
            return '分析逾時：此工作流在平台端執行超過 30 秒上限而被中止。請改用較小／較清晰的圖片，或在平台端縮短工作流（減少 agent 步驟、換較快的模型），或改用非同步執行。';
        }
        return msg;
    }

    setProgress(pct) {
        this.progressFill.style.width = pct + '%';
        this.progressPct.textContent = pct + '%';
    }

    // Eases the bar slowly toward 95% on a timer; returns a stop function.
    // There's no real progress to read (async runs report nothing until done),
    // so the curve is tuned to feel like a multi-minute analysis rather than
    // racing to the cap in a few seconds: a gentle ease-out that then crawls.
    startSimulatedProgress() {
        let pct = 0;
        const cap = 95;
        this.setProgress(0);
        const id = setInterval(() => {
            pct += Math.max(0.12, (cap - pct) * 0.012);
            if (pct > cap) pct = cap;
            this.setProgress(Math.round(pct));
        }, 350);
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
                const source = data.source_markdown || '';
                return {
                    // The workflow appends the raw OCR (as a "原始文件" section) to the
                    // end of the report markdown. That same text already comes back
                    // separately as source_markdown and is shown in the 原文 OCR tab,
                    // so strip it here to keep 報告 = analysis only.
                    reportMarkdown: this.stripEmbeddedSource(data.report.markdown, source),
                    sourceMarkdown: source
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

    // Remove the trailing raw-OCR block that the workflow appends to the report
    // (a "### 原始文件" section, preceded by a horizontal-rule divider). The same
    // text is returned separately as source_markdown, so the 報告 tab should hold
    // only the analysis. Falls back to cutting where the source text begins if the
    // section heading is ever absent.
    stripEmbeddedSource(reportMd, sourceMd) {
        if (!reportMd) return reportMd;
        let cut = reportMd.search(/#{1,6}[ \t]*原始文件/);
        if (cut < 0 && sourceMd) {
            const anchor = sourceMd.split('\n').map((l) => l.trim()).find((l) => l.length > 6);
            if (anchor) {
                const i = reportMd.indexOf(anchor);
                if (i > 0) cut = i;
            }
        }
        if (cut < 0) return reportMd;
        // Drop a trailing divider (--- / *** / ___) that separated the section.
        return reportMd.slice(0, cut).replace(/\n+(?:-{3,}|\*{3,}|_{3,})[ \t]*\n*\s*$/, '\n').trimEnd();
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

        // Three tabs over the OCR markdown: 報告 (analysis, rendered), OCR (the raw
        // OCR markdown rendered to HTML so tables/headings display), and 原文 Markdown
        // (the same source as plain unrendered text). If the workflow returns no
        // separate source_markdown, fall back to the report markdown.
        const rawMarkdown = sourceMarkdown || reportMarkdown || '';
        this.currentReportMarkdown = reportMarkdown;
        this.currentSourceMarkdown = rawMarkdown;

        this.reportView.innerHTML = this.parseMarkdownToHTML(reportMarkdown);
        this.ocrView.innerHTML = rawMarkdown
            ? this.parseMarkdownToHTML(rawMarkdown)
            : '<p style="color:var(--text-muted)">（無原文）</p>';
        this.sourceView.innerHTML = rawMarkdown
            ? `<pre class="raw-markdown">${this.escapeHtml(rawMarkdown)}</pre>`
            : '<p style="color:var(--text-muted)">（無原文）</p>';

        // Reset to report tab
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === 'report'));
        this.reportView.classList.add('active');
        this.ocrView.classList.remove('active');
        this.sourceView.classList.remove('active');

        if (window.MathJax) {
            window.MathJax.typesetPromise([this.reportView, this.ocrView]).catch((e) => {
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
        this.ocrView.classList.toggle('active', targetView === 'ocr');
        this.sourceView.classList.toggle('active', targetView === 'source');

        // 報告 and OCR are rendered HTML (may contain math); 原文 Markdown is raw text.
        if (window.MathJax && targetView !== 'source') {
            const el = targetView === 'ocr' ? this.ocrView : this.reportView;
            window.MathJax.typesetPromise([el]).catch((e) => {
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
        this.renderSampleGallery();

        this.previewGrid.innerHTML = '';
        this.uploadArea.parentElement.style.display = '';
        if (this.stageEmpty) this.stageEmpty.style.display = '';
        if (this.stageCount) this.stageCount.style.display = 'none';
        if (this.sourceActions) this.sourceActions.style.display = 'none';
        if (this.actionHint) this.actionHint.textContent = '已選 0 份';
        this.previewSection.style.display = 'none';
        this.loadingSection.style.display = 'none';
        this.resultSection.style.display = 'none';
        this.resultTabs.style.display = 'none';
        this.errorSection.style.display = 'none';
        this.emptyState.style.display = '';

        this.reportView.innerHTML = '';
        this.ocrView.innerHTML = '';
        this.sourceView.innerHTML = '';

        this.setStatus('ready', 'Ready');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new OCRApp();
});
