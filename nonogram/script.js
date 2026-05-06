/* ==================== 可調整參數配置 ==================== */
const CONFIG = {
    // 畫布設定
    GRID_SIZES: [9, 15],             // 可選擇的格子大小
    DEFAULT_GRID_SIZE: 15,           // 預設格子大小（預設進入 15x15）
    
    // 愛心設定
    INITIAL_HEARTS: 20,              // 初始愛心數（每局固定 20 顆）
    MAX_GENERATION_ATTEMPTS: 30,     // 生成唯一解題目的最大嘗試次數
    
    // 難度設定
    DIFFICULTY_LEVELS: {
        easy: {
            name: '簡單',
            fillRate: [0.70, 0.88],  // 填滿率範圍 70%-88%
            minFilled: {
                9: 55,               // 9x9 最少填滿格子數（約 68%）
                15: 150              // 15x15 最少填滿格子數（約 66%）
            }
        },
        medium: {
            name: '中等',
            fillRate: [0.55, 0.70],  // 填滿率範圍 55%-70%
            minFilled: {
                9: 45,
                15: 120
            }
        },
        hard: {
            name: '困難',
            fillRate: [0.40, 0.55],  // 填滿率範圍 40%-55%
            minFilled: {
                9: 35,
                15: 95
            }
        }
    }
};

const linePatternCache = new Map();

/* ==================== 數織遊戲類別 ==================== */
class NonogramGame {
    constructor() {
        // 遊戲狀態
        this.gridSize = CONFIG.DEFAULT_GRID_SIZE;  // 當前格子大小
        this.difficulty = 'medium';                // 當前難度
        this.hearts = CONFIG.INITIAL_HEARTS;       // 剩餘愛心數
        this.heartsUsed = 0;                       // 已使用愛心數（累計答錯次數）
        this.gameStartTime = Date.now();           // 本局開始時間
        this.timerIntervalId = null;               // 計時器 interval id
        this.mode = 'fill';                        // 當前模式：'fill' 或 'mark'
        this.board = [];                           // 玩家答題狀態（NxN 二維陣列）
        this.solution = [];                        // 正確答案（NxN 二維陣列）
        this.isCompleted = false;                  // 是否完成
        this.isDragging = false;                   // 是否正在拖曳
        this.currentHints = null;                  // 快取目前謎題的提示
        
        this.init();
    }

    // 初始化遊戲
    init() {
        // 先同步 UI 預設值，避免下拉選單與實際狀態不一致
        const sizeSelect = document.getElementById('grid-size-select');
        const difficultySelect = document.getElementById('difficulty-select');
        if (sizeSelect) sizeSelect.value = String(this.gridSize);
        if (difficultySelect) difficultySelect.value = this.difficulty;

        // 先嘗試載入分享題目；若沒有則生成新題目
        const loadedFromShare = this.tryLoadSharedPuzzleFromQuery();
        if (!loadedFromShare) {
            this.generatePuzzle();
        }

        this.renderHearts();
        this.updateTimerDisplay(); // 初始化時計時顯示
        this.startTimer();         // 啟動每秒更新
        this.renderHints();
        this.renderBoard();
        this.setupEventListeners();
    }

    // 取得格式化耗時（mm:ss）
    formatElapsedTime(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // 更新畫面上的計時器文字
    updateTimerDisplay() {
        const timerEl = document.getElementById('timer-display');
        if (!timerEl) return;
        const elapsed = this.formatElapsedTime(Date.now() - this.gameStartTime);
        timerEl.textContent = `⏱️ 過關計時：${elapsed}`;
    }

    // 啟動每秒更新一次的計時器
    startTimer() {
        if (this.timerIntervalId) {
            clearInterval(this.timerIntervalId);
        }
        this.timerIntervalId = setInterval(() => {
            this.updateTimerDisplay();
        }, 1000);
    }

    // 停止計時器更新
    stopTimer() {
        if (this.timerIntervalId) {
            clearInterval(this.timerIntervalId);
            this.timerIntervalId = null;
        }
    }

    // 將目前題目序列化成可分享的 query 參數
    getSharePuzzleQuery() {
        const flatSolution = this.solution.flat().join('');
        const encodedPuzzle = btoa(flatSolution);
        const params = new URLSearchParams();
        params.set('s', String(this.gridSize));           // 幾乘幾（9 或 15）
        params.set('d', this.difficulty);                 // 難易度
        params.set('p', encodedPuzzle);                   // 題目內容（解答陣列）
        return params.toString();
    }

    // 取得完整分享網址
    getShareUrl() {
        const baseUrl = `${window.location.origin}${window.location.pathname}`;
        return `${baseUrl}?${this.getSharePuzzleQuery()}`;
    }

    // 套用分享題目到目前遊戲狀態
    applySharedPuzzle(gridSize, difficulty, flatSolution) {
        this.gridSize = gridSize;
        this.difficulty = difficulty;
        this.hearts = CONFIG.INITIAL_HEARTS;  // 愛心不共用，載入後重置
        this.heartsUsed = 0;                  // 用量不共用，載入後重置
        this.gameStartTime = Date.now();      // 時間不共用，載入後重新計時
        this.mode = 'fill';
        this.isCompleted = false;

        // 同步下拉選單顯示，讓 UI 與題目一致
        const sizeSelect = document.getElementById('grid-size-select');
        const difficultySelect = document.getElementById('difficulty-select');
        if (sizeSelect) sizeSelect.value = String(gridSize);
        if (difficultySelect) difficultySelect.value = difficulty;

        // 依序還原分享題目的解答棋盤
        this.solution = [];
        let index = 0;
        for (let i = 0; i < gridSize; i++) {
            this.solution[i] = [];
            for (let j = 0; j < gridSize; j++) {
                this.solution[i][j] = flatSolution[index] === '1' ? 1 : 0;
                index++;
            }
        }

        // 玩家棋盤重置為空白，並重新計算提示
        this.board = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
        this.currentHints = this.calculateHints();
        this.clearSuccessMessage();
    }

    // 從網址 query 載入分享題目，成功回傳 true
    tryLoadSharedPuzzleFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const sizeParam = params.get('s');
        const difficultyParam = params.get('d');
        const puzzleParam = params.get('p');

        if (!sizeParam || !difficultyParam || !puzzleParam) {
            return false;
        }

        const gridSize = parseInt(sizeParam, 10);
        if (!CONFIG.GRID_SIZES.includes(gridSize)) {
            return false;
        }

        if (!CONFIG.DIFFICULTY_LEVELS[difficultyParam]) {
            return false;
        }

        let decoded = '';
        try {
            decoded = atob(puzzleParam);
        } catch (error) {
            return false;
        }

        const expectedLength = gridSize * gridSize;
        const isValidPuzzle = decoded.length === expectedLength && /^[01]+$/.test(decoded);
        if (!isValidPuzzle) {
            return false;
        }

        this.applySharedPuzzle(gridSize, difficultyParam, decoded);

        // 套用一次分享題目後，立刻清除 query，避免重新整理再次套用
        const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
        window.history.replaceState({}, '', cleanUrl);
        return true;
    }

    // 顯示分享彈窗，並填入目前題目的分享網址
    showShareModal() {
        const overlay = document.getElementById('share-modal-overlay');
        const input = document.getElementById('share-url-input');
        const status = document.getElementById('share-copy-status');
        if (!overlay || !input) return;

        input.value = this.getShareUrl();
        if (status) status.textContent = '';
        overlay.classList.add('show');
    }

    // 隱藏分享彈窗
    hideShareModal() {
        const overlay = document.getElementById('share-modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    }

    // 複製分享網址到剪貼簿
    async copyShareUrl() {
        const input = document.getElementById('share-url-input');
        const status = document.getElementById('share-copy-status');
        if (!input) return;

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(input.value);
            } else {
                // 非安全環境下的相容寫法
                input.select();
                input.setSelectionRange(0, input.value.length);
                document.execCommand('copy');
            }
            if (status) {
                status.textContent = '✅ 已複製網址';
                status.style.color = '#34C759';
            }
        } catch (error) {
            if (status) {
                status.textContent = '❌ 複製失敗，請手動複製';
                status.style.color = '#FF3B30';
            }
        }
    }

    // 生成謎題
    generatePuzzle() {
        const config = CONFIG.DIFFICULTY_LEVELS[this.difficulty];
        const [minRate, maxRate] = config.fillRate;
        const maxAttempts = CONFIG.MAX_GENERATION_ATTEMPTS;
        let attempts = 0;
        this.currentHints = null;

        while (attempts < maxAttempts) {
            attempts++;
            const fillRate = minRate + Math.random() * (maxRate - minRate);
            this.solution = [];
            for (let i = 0; i < this.gridSize; i++) {
                this.solution[i] = [];
                for (let j = 0; j < this.gridSize; j++) {
                    this.solution[i][j] = Math.random() < fillRate ? 1 : 0;
                }
            }

            this.ensureMinimumFilled(config.minFilled[this.gridSize]);
            const hints = this.calculateHints();

            if (this.hasUniqueSolution(hints.rowHints, hints.colHints)) {
                this.currentHints = hints;
                break;
            }
        }

        if (!this.currentHints) {
            this.currentHints = this.calculateHints();
        }

        this.board = Array(this.gridSize).fill().map(() => 
            Array(this.gridSize).fill(0)
        );
        
        this.isCompleted = false;
    }

    // 確保最少填滿數量
    ensureMinimumFilled(minFilled) {
        let filledCount = 0;
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                if (this.solution[i][j] === 1) filledCount++;
            }
        }
        
        while (filledCount < minFilled) {
            const row = Math.floor(Math.random() * this.gridSize);
            const col = Math.floor(Math.random() * this.gridSize);
            if (this.solution[row][col] === 0) {
                this.solution[row][col] = 1;
                filledCount++;
            }
        }
    }

    // 計算提示數字
    calculateHints() {
        const rowHints = [];
        const colHints = [];

        // 計算每行的提示
        for (let i = 0; i < this.gridSize; i++) {
            const hints = [];
            let count = 0;
            for (let j = 0; j < this.gridSize; j++) {
                if (this.solution[i][j] === 1) {
                    count++;
                } else {
                    if (count > 0) {
                        hints.push(count);
                        count = 0;
                    }
                }
            }
            if (count > 0) hints.push(count);
            rowHints.push(hints.length > 0 ? hints : [0]);
        }

        // 計算每列的提示
        for (let j = 0; j < this.gridSize; j++) {
            const hints = [];
            let count = 0;
            for (let i = 0; i < this.gridSize; i++) {
                if (this.solution[i][j] === 1) {
                    count++;
                } else {
                    if (count > 0) {
                        hints.push(count);
                        count = 0;
                    }
                }
            }
            if (count > 0) hints.push(count);
            colHints.push(hints.length > 0 ? hints : [0]);
        }

        return { rowHints, colHints };
    }

    normalizeLineHints(hints) {
        if (!hints) return [];
        if (hints.length === 1 && hints[0] === 0) {
            return [];
        }
        return [...hints];
    }

    generateLineOptions(hints, length) {
        const normalized = this.normalizeLineHints(hints);
        const key = `${length}|${normalized.join(',') || 'empty'}`;
        if (linePatternCache.has(key)) {
            return linePatternCache.get(key);
        }

        if (normalized.length === 0) {
            const emptyPattern = [new Array(length).fill(0)];
            linePatternCache.set(key, emptyPattern);
            return emptyPattern;
        }

        const patterns = [];
        const suffixRequirements = new Array(normalized.length).fill(0);
        let suffixSum = 0;
        for (let i = normalized.length - 1; i >= 0; i--) {
            suffixSum += normalized[i];
            suffixRequirements[i] = suffixSum + (normalized.length - i - 1);
        }

        const line = new Array(length).fill(0);
        const build = (hintIndex, position) => {
            const blockLength = normalized[hintIndex];
            const maxStart = length - suffixRequirements[hintIndex];
            for (let start = position; start <= maxStart; start++) {
                for (let idx = position; idx < start; idx++) {
                    line[idx] = 0;
                }

                for (let idx = 0; idx < blockLength; idx++) {
                    line[start + idx] = 1;
                }

                if (hintIndex === normalized.length - 1) {
                    for (let idx = start + blockLength; idx < length; idx++) {
                        line[idx] = 0;
                    }
                    patterns.push(line.slice());
                } else {
                    const nextPosition = start + blockLength + 1;
                    if (start + blockLength < length) {
                        line[start + blockLength] = 0;
                    }
                    if (nextPosition <= length) {
                        build(hintIndex + 1, nextPosition);
                    }
                }
            }
        };

        build(0, 0);
        linePatternCache.set(key, patterns);
        return patterns;
    }

    countSolutions(rowHints, colHints, maxSolutions = 2) {
        const size = this.gridSize;
        const rowPatterns = rowHints.map(hints => this.generateLineOptions(hints, size));
        const colPatterns = colHints.map(hints => this.generateLineOptions(hints, size));

        if (rowPatterns.some(patterns => patterns.length === 0) || colPatterns.some(patterns => patterns.length === 0)) {
            return 0;
        }

        const colStates = colPatterns.map(patterns => ({
            options: patterns,
            active: patterns.map(() => true),
            activeCount: patterns.length
        }));

        let solutionCount = 0;

        const backtrack = (rowIndex) => {
            if (solutionCount >= maxSolutions) return;
            if (rowIndex === size) {
                solutionCount++;
                return;
            }

            const patterns = rowPatterns[rowIndex];
            for (let p = 0; p < patterns.length; p++) {
                const pattern = patterns[p];
                let valid = true;
                const removedStack = [];

                for (let col = 0; col < size; col++) {
                    const value = pattern[col];
                    const state = colStates[col];
                    const removed = [];

                    for (let optIdx = 0; optIdx < state.options.length; optIdx++) {
                        if (!state.active[optIdx]) continue;
                        if (state.options[optIdx][rowIndex] !== value) {
                            state.active[optIdx] = false;
                            state.activeCount--;
                            removed.push(optIdx);
                        }
                    }

                    removedStack.push({ col, indices: removed });

                    if (state.activeCount === 0) {
                        valid = false;
                        break;
                    }
                }

                if (valid) {
                    backtrack(rowIndex + 1);
                }

                for (let r = removedStack.length - 1; r >= 0; r--) {
                    const { col, indices } = removedStack[r];
                    const state = colStates[col];
                    for (let idx = 0; idx < indices.length; idx++) {
                        const optIdx = indices[idx];
                        if (!state.active[optIdx]) {
                            state.active[optIdx] = true;
                            state.activeCount++;
                        }
                    }
                }

                if (solutionCount >= maxSolutions) {
                    return;
                }
            }
        };

        backtrack(0);
        return solutionCount;
    }

    hasUniqueSolution(rowHints, colHints) {
        return this.countSolutions(rowHints, colHints, 2) === 1;
    }

    // 渲染愛心
    renderHearts() {
        const container = document.getElementById('hearts-container');
        container.innerHTML = '';
        
        for (let i = 0; i < CONFIG.INITIAL_HEARTS; i++) {
            const heart = document.createElement('span');
            heart.className = 'heart';
            
            // 從右邊開始扣除：計算從右邊數來第幾個
            const rightIndex = CONFIG.INITIAL_HEARTS - 1 - i;
            if (rightIndex < this.hearts) {
                heart.classList.add('filled');
                heart.textContent = '❤';
            } else {
                heart.classList.add('empty');
                heart.textContent = '♡';
            }
            
            container.appendChild(heart);
        }
    }

    // 渲染提示數字
    renderHints() {
        if (!this.currentHints) {
            this.currentHints = this.calculateHints();
        }
        const { rowHints, colHints } = this.currentHints;
        
        // 根據螢幕寬度和格子數量動態計算格子大小
        const isMobile = window.innerWidth <= 768;
        const isTablet = window.innerWidth > 768 && window.innerWidth <= 1023;
        
        // 獲取實際容器寬度
        const container = document.getElementById('app-container');
        const containerWidth = container ? container.offsetWidth : window.innerWidth;
        
        // 計算最大提示數量
        const maxColHintCount = Math.max(...colHints.map(h => h.length));
        const maxRowHintCount = Math.max(...rowHints.map(h => h.length));
        
        // 調整提示區域的字體大小和間距（縮小間距，放大文字）
        let hintNumSize;
        if (isMobile) {
            hintNumSize = this.gridSize === 9 ? 20 : 16;
        } else if (isTablet) {
            hintNumSize = this.gridSize === 9 ? 28 : 22;
        } else {
            hintNumSize = this.gridSize === 9 ? 30 : 24;
        }

        const hintSpacingFactor = 0.78;
        const topHintSpacingFactor = 1.2;
        const hintPadding = Math.round(hintNumSize * (isMobile ? 0.6 : 0.75));
        const topHintHeight = Math.max(
            hintNumSize + 6,
            Math.round(maxColHintCount * hintNumSize * topHintSpacingFactor + hintPadding)
        );
        const leftHintWidth = Math.max(
            hintNumSize + 6,
            Math.round(maxRowHintCount * hintNumSize * hintSpacingFactor + hintPadding)
        );

        // 計算可用寬度（扣除左側提示和最小邊距）
        const columnGap = 10
        ; // 與 CSS grid gap 保持一致，避免總寬度超出
        const boardPadding = isMobile ? 12 : (isTablet ? 16 : 20);
        const minCellSize = isMobile
            ? (this.gridSize === 9 ? 24 : 18)
            : (isTablet ? (this.gridSize === 9 ? 30 : 22) : (this.gridSize === 9 ? 36 : 26));
        const availableBoardWidth = Math.max(
            containerWidth - leftHintWidth - columnGap - boardPadding,
            this.gridSize * minCellSize
        );
        const cellSize = Math.floor(availableBoardWidth / this.gridSize);
        const boardFontSize = Math.max(18, Math.floor(cellSize * 0.6));
        
        // 渲染上方提示
        const topHints = document.getElementById('top-hints');
        topHints.innerHTML = '';
        topHints.style.gridTemplateColumns = `repeat(${this.gridSize}, ${cellSize}px)`;
        topHints.style.marginLeft = '0px';
        topHints.style.width = `${cellSize * this.gridSize}px`;
        
        for (let j = 0; j < this.gridSize; j++) {
            const col = document.createElement('div');
            col.className = 'top-hint-col';
            col.style.height = `${topHintHeight}px`;
            col.style.width = `${cellSize}px`;
            
            colHints[j].forEach(num => {
                const span = document.createElement('span');
                span.className = 'hint-number';
                span.style.fontSize = `${hintNumSize}px`;
                span.style.marginBottom = `${Math.max(2, Math.round(hintNumSize * 0.15))}px`;
                span.textContent = num;
                col.appendChild(span);
            });
            
            topHints.appendChild(col);
        }
        
        // 渲染左側提示
        const leftHints = document.getElementById('left-hints');
        leftHints.innerHTML = '';
        
        for (let i = 0; i < this.gridSize; i++) {
            const row = document.createElement('div');
            row.className = 'left-hint-row';
            row.style.width = `${leftHintWidth}px`;
            row.style.height = `${cellSize}px`;
            row.style.padding = isMobile ? '2px 2px' : '3px 2px';
            
            rowHints[i].forEach(num => {
                const span = document.createElement('span');
                span.className = 'hint-number';
                span.style.fontSize = `${hintNumSize}px`;
                span.style.marginLeft = '2px';
                span.style.marginRight = '1px';
                span.textContent = num;
                row.appendChild(span);
            });
            
            leftHints.appendChild(row);
        }
        
        // 儲存 cellSize 供 renderBoard 使用
        this.currentCellSize = cellSize;
        this.currentFontSize = boardFontSize;
    }

    // 渲染遊戲棋盤
    renderBoard() {
        const board = document.getElementById('game-board');
        board.innerHTML = '';
        
        // 使用 renderHints 中計算好的 cellSize
        const cellSize = this.currentCellSize;
        const fontSize = this.currentFontSize;
        const blockSize = this.gridSize === 9 ? 3 : 5;
        
        board.style.gridTemplateColumns = `repeat(${this.gridSize}, ${cellSize}px)`;
        board.style.gridTemplateRows = `repeat(${this.gridSize}, ${cellSize}px)`;
        
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.style.width = `${cellSize}px`;
                cell.style.height = `${cellSize}px`;
                cell.style.fontSize = `${fontSize}px`;
                
                // 每N格加粗邊框
                if ((j + 1) % blockSize === 0 && j < this.gridSize - 1) {
                    cell.classList.add('border-right');
                }
                if ((i + 1) % blockSize === 0 && i < this.gridSize - 1) {
                    cell.classList.add('border-bottom');
                }
                
                this.updateCellDisplay(cell, i, j);
                
                // 點擊事件
                cell.addEventListener('click', () => {
                    this.handleCellClick(i, j);
                });
                
                // 拖曳事件
                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.isDragging = true;
                    this.handleCellClick(i, j);
                });
                
                cell.addEventListener('mouseenter', () => {
                    if (this.isDragging) {
                        this.handleCellClick(i, j);
                    }
                });
                
                cell.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.isDragging = true;
                    this.handleCellClick(i, j);
                });
                
                cell.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    if (this.isDragging) {
                        const touch = e.touches[0];
                        const element = document.elementFromPoint(touch.clientX, touch.clientY);
                        if (element && element.classList.contains('cell')) {
                            const row = parseInt(element.dataset.row);
                            const col = parseInt(element.dataset.col);
                            this.handleCellClick(row, col);
                        }
                    }
                });
                
                board.appendChild(cell);
            }
        }
    }

    // 更新格子顯示
    updateCellDisplay(cell, row, col) {
        const value = this.board[row][col];
        
        // 移除所有狀態class
        cell.classList.remove('filled', 'marked');
        cell.textContent = '';
        
        if (value === 1) {
            // 填入黑色方塊
            cell.classList.add('filled');
        } else if (value === -1) {
            // 填入叉叉
            cell.classList.add('marked');
            cell.textContent = '✖︎';
        }
    }

    // 處理格子點擊
    handleCellClick(row, col) {
        // 如果遊戲已完成，不處理
        if (this.isCompleted) return;
        
        const currentValue = this.board[row][col];
        
        // 如果格子已經有答案(黑色方塊或叉叉),完全不允許修改
        if (currentValue === 1 || currentValue === -1) {
            return;
        }
        
        let newValue = 0;
        
        if (this.mode === 'fill') {
            // 填滿模式：只能從 0 改成 1
            newValue = 1;
        } else {
            // 標記模式：只能從 0 改成 -1
            newValue = -1;
        }
        
        // 更新棋盤
        this.board[row][col] = newValue;
        
        // 更新顯示
        const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        this.updateCellDisplay(cell, row, col);
        
        // 立即檢查這一格是否正確
        this.checkCell(row, col, newValue);
    }

    // 檢查單一格子是否正確
    checkCell(row, col, value) {
        let isWrong = false;
        
        // 判斷規則：
        // - 如果正確答案是1（應該填黑色），但玩家填了-1（叉叉），算錯
        // - 如果正確答案是0（應該空白或叉叉），但玩家填了1（黑色），算錯
        
        if (this.solution[row][col] === 1 && value === -1) {
            // 應該是黑色但填了叉叉
            isWrong = true;
        } else if (this.solution[row][col] === 0 && value === 1) {
            // 應該是空白但填了黑色
            isWrong = true;
        }
        
        if (isWrong) {
            // 扣除愛心（從右邊開始）
            this.hearts--;
            this.heartsUsed++; // 每次答錯都累計已使用愛心
            this.renderHearts();
            
            // 顯示正確答案
            if (this.solution[row][col] === 1) {
                this.board[row][col] = 1;
            } else {
                this.board[row][col] = -1;
            }
            const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            this.updateCellDisplay(cell, row, col);
            
            // 如果愛心用完，顯示問題彈窗
            if (this.hearts <= 0) {
                this.showChallengeModal();
                return;
            }
        }
        
        // 檢查是否該行或該列已完成，自動填入剩餘叉叉
        this.autoCompleteRowCol(row, col);
        
        // 檢查是否完成
        this.checkIfComplete();
    }

    // 自動完成行列（當該行或該列的所有黑色方塊都已填入時）
    autoCompleteRowCol(row, col) {
        // 檢查該行
        let rowComplete = true;
        for (let j = 0; j < this.gridSize; j++) {
            if (this.solution[row][j] === 1 && this.board[row][j] !== 1) {
                rowComplete = false;
                break;
            }
        }
        
        if (rowComplete) {
            // 該行的所有黑色方塊都已填入，自動填入剩餘的叉叉
            for (let j = 0; j < this.gridSize; j++) {
                if (this.solution[row][j] === 0 && this.board[row][j] === 0) {
                    this.board[row][j] = -1;
                    const cell = document.querySelector(`[data-row="${row}"][data-col="${j}"]`);
                    this.updateCellDisplay(cell, row, j);
                }
            }
        }
        
        // 檢查該列
        let colComplete = true;
        for (let i = 0; i < this.gridSize; i++) {
            if (this.solution[i][col] === 1 && this.board[i][col] !== 1) {
                colComplete = false;
                break;
            }
        }
        
        if (colComplete) {
            // 該列的所有黑色方塊都已填入，自動填入剩餘的叉叉
            for (let i = 0; i < this.gridSize; i++) {
                if (this.solution[i][col] === 0 && this.board[i][col] === 0) {
                    this.board[i][col] = -1;
                    const cell = document.querySelector(`[data-row="${i}"][data-col="${col}"]`);
                    this.updateCellDisplay(cell, i, col);
                }
            }
        }
    }

    // 檢查是否全部完成
    checkIfComplete() {
        // 檢查所有應該填黑色的格子是否都填了
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                if (this.solution[i][j] === 1 && this.board[i][j] !== 1) {
                    // 還有未完成的格子
                    return;
                }
            }
        }
        
        // 全部完成！
        this.isCompleted = true;
        this.showSuccessMessage();
    }

    // 顯示成功訊息
    showSuccessMessage() {
        const message = document.getElementById('success-message');
        const elapsed = this.formatElapsedTime(Date.now() - this.gameStartTime);
        message.textContent = `😄 恭喜完成！耗時 ${elapsed}，使用 ${this.heartsUsed} 顆愛心`;
        message.style.color = '#34C759';
        this.stopTimer();
    }

    // 顯示解答訊息（直接看答案或挑戰失敗選 X）
    showRevealAnswerMessage() {
        const message = document.getElementById('success-message');
        message.textContent = '已為您顯示完整解答';
        message.style.color = '#007AFF';
        this.stopTimer();
    }

    // 清除成功訊息
    clearSuccessMessage() {
        const message = document.getElementById('success-message');
        message.textContent = '';
    }

    // 顯示挑戰失敗彈窗（愛心用完時）
    showChallengeModal() {
        const modal = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('challenge-title');
        const questionEl = document.getElementById('challenge-question');
        
        // 顯示按鈕（O: 繼續挑戰、X: 直接看答案）
        const answerOBtn = document.getElementById('answer-o-btn');
        const answerXBtn = document.getElementById('answer-x-btn');
        answerOBtn.style.display = 'block';
        answerXBtn.style.display = 'block';
        answerOBtn.textContent = 'O';
        answerXBtn.textContent = 'X';
        
        // 依需求顯示固定文案
        titleEl.textContent = '挑戰失敗，請問要繼續挑戰嗎?';
        titleEl.style.color = '#1C1C1E';
        questionEl.textContent = '按 O 繼續挑戰，按 X 直接顯示答案';
        questionEl.style.color = '#1C1C1E';
        modal.classList.add('show');
    }

    // 隱藏問題彈窗
    hideChallengeModal() {
        const modal = document.getElementById('modal-overlay');
        modal.classList.remove('show');
    }

    // 處理挑戰失敗彈窗的選擇
    // - 選 O：補滿愛心並繼續
    // - 選 X：直接顯示答案（同「直接看答案」功能）
    handleChallengeChoice(continueGame) {
        if (continueGame) {
            this.hearts = CONFIG.INITIAL_HEARTS; // 繼續挑戰時補滿愛心
            this.renderHearts();
            this.hideChallengeModal();
            return;
        }

        // X：直接看答案
        this.hideChallengeModal();
        this.showAnswer({ isRevealOnly: true });
    }

    // 直接看答案
    showAnswer(options = {}) {
        const { isRevealOnly = false } = options;
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                if (this.solution[i][j] === 1) {
                    this.board[i][j] = 1;
                } else {
                    this.board[i][j] = -1;
                }
                const cell = document.querySelector(`[data-row="${i}"][data-col="${j}"]`);
                this.updateCellDisplay(cell, i, j);
            }
        }
        this.isCompleted = true;

        // 依情境顯示不同訊息
        if (isRevealOnly) {
            this.showRevealAnswerMessage();
        } else {
            this.showSuccessMessage();
        }
    }

    // 新遊戲
    newGame() {
        // 重置遊戲狀態
        this.gridSize = parseInt(document.getElementById('grid-size-select').value);
        this.difficulty = document.getElementById('difficulty-select').value;
        this.hearts = CONFIG.INITIAL_HEARTS;
        this.heartsUsed = 0;              // 新局重置愛心用量
        this.gameStartTime = Date.now();  // 新局重新計時
        this.mode = 'fill';
        this.isCompleted = false;
        
        // 重置模式按鈕
        document.getElementById('fill-btn').classList.add('active');
        document.getElementById('mark-btn').classList.remove('active');
        
        // 清除成功訊息
        this.clearSuccessMessage();

        // 重新啟動計時器
        this.updateTimerDisplay();
        this.startTimer();
        
        // 生成新謎題
        this.generatePuzzle();
        this.renderHearts();
        this.renderHints();
        this.renderBoard();
    }

    // 設置事件監聽器
    setupEventListeners() {
        // 格子大小選擇
        document.getElementById('grid-size-select').addEventListener('change', () => {
            this.newGame();
        });
        
        // 難度選擇
        document.getElementById('difficulty-select').addEventListener('change', () => {
            this.newGame();
        });
        
        // 模式切換按鈕
        document.getElementById('fill-btn').addEventListener('click', () => {
            this.mode = 'fill';
            document.getElementById('fill-btn').classList.add('active');
            document.getElementById('mark-btn').classList.remove('active');
        });
        
        document.getElementById('mark-btn').addEventListener('click', () => {
            this.mode = 'mark';
            document.getElementById('mark-btn').classList.add('active');
            document.getElementById('fill-btn').classList.remove('active');
        });
        
        // 功能按鈕
        document.getElementById('show-answer-btn').addEventListener('click', () => {
            if (confirm('確定要直接看答案嗎？')) {
                this.showAnswer({ isRevealOnly: true });
            }
        });
        
        document.getElementById('new-game-btn').addEventListener('click', () => {
            this.newGame();
        });

        // 分享按鈕
        document.getElementById('share-btn').addEventListener('click', () => {
            this.showShareModal();
        });

        // 分享彈窗按鈕
        document.getElementById('copy-share-url-btn').addEventListener('click', async () => {
            await this.copyShareUrl();
        });

        document.getElementById('close-share-modal-btn').addEventListener('click', () => {
            this.hideShareModal();
        });

        // 點擊分享彈窗外層時可關閉
        document.getElementById('share-modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'share-modal-overlay') {
                this.hideShareModal();
            }
        });
        
        // 挑戰失敗彈窗按鈕
        document.getElementById('answer-o-btn').addEventListener('click', () => {
            this.handleChallengeChoice(true);
        });
        
        document.getElementById('answer-x-btn').addEventListener('click', () => {
            this.handleChallengeChoice(false);
        });
        
        // 視窗大小改變時重新渲染（避免頻繁觸發）
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                this.renderHints();
                this.renderBoard();
            }, 250);
        });
        
        // 全域滑鼠放開事件，結束拖曳
        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
        
        document.addEventListener('touchend', () => {
            this.isDragging = false;
        });
    }
}

/* ==================== 啟動遊戲 ==================== */
document.addEventListener('DOMContentLoaded', () => {
    const game = new NonogramGame();
});
