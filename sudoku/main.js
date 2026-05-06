/************************************************************
 * 數獨主程式（包含 Sudoku 類別 + UI 綁定）
 * - 註解為繁體中文
 * - 難度在最上方 DIFFICULTY_MAP 設定（固定挖洞數）
 * - 產生時會保證唯一解（countSolutions limit=2）
 * - 加上 DOMContentLoaded 包裹，確保在 DOM 準備好後才執行
 ************************************************************/

/* ----------------- 數獨核心（同你之前的 Sudoku） ----------------- */
class Sudoku {
    constructor() {
        this.board = new Array(81).fill(0);
        this.solution = new Array(81).fill(0);
        this.puzzleBoard = new Array(81).fill(0);
    }

    // 難易度表：value = 要「挖掉」幾格（固定挖洞數）
    // 注意：理論最大只能挖 64 格（至少保留 17 個提示才能保唯一解）
    static DIFFICULTY_MAP = {
        easy: 41,
        medium: 47,
        hard: 53,
        expert: 55,
        pro: 58,
        master: 60,
        hell: 64, // 修正為理論上可行的最大挖洞 64（若設 81 會造成不可預期）
    };

    idx(r, c) { return r * 9 + c; }
    rowCol(i) { return [Math.floor(i / 9), i % 9]; }
    copyBoard(b) { return b.slice(); }

    _generateFullSolution() {
        const base = [
            [1,2,3,4,5,6,7,8,9],
            [4,5,6,7,8,9,1,2,3],
            [7,8,9,1,2,3,4,5,6],
            [2,3,4,5,6,7,8,9,1],
            [5,6,7,8,9,1,2,3,4],
            [8,9,1,2,3,4,5,6,7],
            [3,4,5,6,7,8,9,1,2],
            [6,7,8,9,1,2,3,4,5],
            [9,1,2,3,4,5,6,7,8]
        ].map(r => r.slice());

        const rand = (n) => Math.floor(Math.random() * n);
        const swapRows = (b, r1, r2) => [b[r1], b[r2]] = [b[r2], b[r1]];
        const swapCols = (b, c1, c2) => {
            for (let r = 0; r < 9; r++)
                [b[r][c1], b[r][c2]] = [b[r][c2], b[r][c1]];
        };

        for (let t = 0; t < 20; t++) {
            const k = rand(5);
            if (k === 0) {
                const band = rand(3);
                const r1 = band * 3 + rand(3);
                let r2 = band * 3 + rand(3);
                while (r1 === r2) r2 = band * 3 + rand(3);
                swapRows(base, r1, r2);
            } else if (k === 1) {
                const stack = rand(3);
                const c1 = stack * 3 + rand(3);
                let c2 = stack * 3 + rand(3);
                while (c1 === c2) c2 = stack * 3 + rand(3);
                swapCols(base, c1, c2);
            } else if (k === 2) {
                const b1 = rand(3), b2 = rand(3);
                if (b1 !== b2) for (let i = 0; i < 3; i++) swapRows(base, b1*3 + i, b2*3 + i);
            } else if (k === 3) {
                const s1 = rand(3), s2 = rand(3);
                if (s1 !== s2) for (let i = 0; i < 3; i++) swapCols(base, s1*3 + i, s2*3 + i);
            } else {
                const map = [0,1,2,3,4,5,6,7,8,9];
                for (let i = 1; i <= 9; i++) {
                    const j = 1 + rand(9);
                    [map[i], map[j]] = [map[j], map[i]];
                }
                for (let r = 0; r < 9; r++)
                    for (let c = 0; c < 9; c++)
                        base[r][c] = map[base[r][c]];
            }
        }

        const flat = [];
        for (let r = 0; r < 9; r++) flat.push(...base[r]);
        return flat;
    }

    _validAt(board, index, value) {
        if (value === 0) return true;
        const [r, c] = this.rowCol(index);
        for (let cc = 0; cc < 9; cc++) if (cc !== c && board[this.idx(r, cc)] === value) return false;
        for (let rr = 0; rr < 9; rr++) if (rr !== r && board[this.idx(rr, c)] === value) return false;
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        for (let rr = 0; rr < 3; rr++)
            for (let cc = 0; cc < 3; cc++) {
                const ii = this.idx(br + rr, bc + cc);
                if (ii !== index && board[ii] === value) return false;
            }
        return true;
    }

    countSolutions(board, limit = 2) {
        const b = board.slice();
        const getCand = (i) => {
            if (b[i] !== 0) return [];
            const arr = [];
            for (let v = 1; v <= 9; v++) if (this._validAt(b, i, v)) arr.push(v);
            return arr;
        };
        const findNext = () => {
            let best = -1;
            let bestLen = 10;
            for (let i = 0; i < 81; i++) {
                if (b[i] === 0) {
                    const cand = getCand(i);
                    if (cand.length === 0) return -2;
                    if (cand.length < bestLen) {
                        bestLen = cand.length;
                        best = i;
                        if (bestLen === 1) break;
                    }
                }
            }
            return best;
        };

        let solutions = 0;
        const dfs = () => {
            if (solutions >= limit) return;
            const next = findNext();
            if (next === -2) return;
            if (next === -1) { solutions++; return; }
            for (const v of getCand(next)) {
                b[next] = v;
                dfs();
                b[next] = 0;
                if (solutions >= limit) return;
            }
        };
        dfs();
        return solutions;
    }

    generate(difficulty = "easy") {
        // 取難度對應的「要挖掉幾格」，並做上限/下限保護
        let holes = Sudoku.DIFFICULTY_MAP[difficulty];
        if (holes === undefined) {
            console.warn(`未定義的難度 '${difficulty}'，改為 easy`);
            holes = Sudoku.DIFFICULTY_MAP['easy'];
        }
        // 上限 64（保證至少 17 個提示），下限 0
        holes = Math.max(0, Math.min(64, holes));

        // 1. 生成完整解
        this.solution = this._generateFullSolution();

        // 2. 複製為題目盤
        let puzzle = this.solution.slice();

        // 3. 隨機順序準備挖洞 (Fisher-Yates)
        let indices = Array.from({ length: 81 }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        // 4. 逐個嘗試挖洞，僅在仍然唯一解時才真正挖掉
        let removed = 0;
        for (const idx of indices) {
            if (removed >= holes) break;
            if (puzzle[idx] === 0) continue;
            const backup = puzzle[idx];
            puzzle[idx] = 0;
            const sols = this.countSolutions(puzzle, 2);
            if (sols !== 1) {
                puzzle[idx] = backup; // 還原，因為不唯一或無解
            } else {
                removed++;
            }
        }

        // 5. 最終存入
        this.board = puzzle.slice();
        this.puzzleBoard = puzzle.slice();
    }

    isBoardFilled(board) { return board.every(v => v !== 0); }

    validateBoard(board) {
        // 檢查每列/每行/每格是否合法並已填滿
        for (let r = 0; r < 9; r++) {
            const seen = new Set();
            for (let c = 0; c < 9; c++) {
                const v = board[this.idx(r,c)];
                if (v === 0) return false;
                if (seen.has(v)) return false;
                seen.add(v);
            }
        }
        for (let c = 0; c < 9; c++) {
            const seen = new Set();
            for (let r = 0; r < 9; r++) {
                const v = board[this.idx(r,c)];
                if (seen.has(v)) return false;
                seen.add(v);
            }
        }
        for (let br = 0; br < 3; br++) {
            for (let bc = 0; bc < 3; bc++) {
                const seen = new Set();
                for (let rr = 0; rr < 3; rr++) {
                    for (let cc = 0; cc < 3; cc++) {
                        const v = board[this.idx(br*3 + rr, bc*3 + cc)];
                        if (seen.has(v)) return false;
                        seen.add(v);
                    }
                }
            }
        }
        return true;
    }

    isSolved() {
        if (!this.isBoardFilled(this.board)) return false;
        return this.validateBoard(this.board);
    }

    solve() {
        if (this.solution && this.solution.length === 81) this.board = this.solution.slice();
    }

    findConflicts(index, board) {
        const conflicts = new Set();
        const value = board[index];
        if (value === 0) return conflicts;
        const [row, col] = this.rowCol(index);
        for (let i = 0; i < 9; i++) {
            const peerRow = this.idx(row, i);
            if (peerRow !== index && board[peerRow] === value) conflicts.add(peerRow);
            const peerCol = this.idx(i, col);
            if (peerCol !== index && board[peerCol] === value) conflicts.add(peerCol);
        }
        const br = Math.floor(row/3)*3;
        const bc = Math.floor(col/3)*3;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
            const peer = this.idx(br + r, bc + c);
            if (peer !== index && board[peer] === value) conflicts.add(peer);
        }
        if (conflicts.size > 0) conflicts.add(index);
        return conflicts;
    }
}

/* ----------------- UI 綁定：確保在 DOMContentLoaded 執行 ----------------- */
document.addEventListener('DOMContentLoaded', () => {
    // 取 DOM 元素（請確認 HTML 中有對應 id）
    const boardEl = document.getElementById('game-board');
    const numberPaletteEl = document.getElementById('number-palette');
    const difficultySelector = document.getElementById('difficulty');
    const timerDisplayEl = document.getElementById('timer-display');
    const validationResultEl = document.getElementById('validation-result');
    const checkBtn = document.getElementById('check-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    const shareBtn = document.getElementById('share-btn');
    const solveBtn = document.getElementById('solve-btn');
    const shareModalOverlay = document.getElementById('share-modal-overlay');
    const shareUrlInput = document.getElementById('share-url-input');
    const copyShareUrlBtn = document.getElementById('copy-share-url-btn');
    const closeShareModalBtn = document.getElementById('close-share-modal-btn');
    const shareCopyStatus = document.getElementById('share-copy-status');

    // 若任一元素找不到，顯示錯誤並停止
    if (!boardEl || !numberPaletteEl || !difficultySelector || !timerDisplayEl || !validationResultEl || !checkBtn || !newGameBtn || !shareBtn || !solveBtn || !shareModalOverlay || !shareUrlInput || !copyShareUrlBtn || !closeShareModalBtn || !shareCopyStatus) {
        console.error('某些 DOM 元素未找到，請確認 HTML 中有正確的 id（game-board, number-palette, difficulty, timer-display, validation-result, check-btn, new-game-btn, share-btn, solve-btn, share-modal-overlay, share-url-input, copy-share-url-btn, close-share-modal-btn, share-copy-status）');
        if (validationResultEl) validationResultEl.textContent = '初始化失敗：缺少 DOM 元素，請檢查 HTML。';
        return;
    }

    let sudoku = new Sudoku();
    let selectedCellIndex = -1;
    let selectedNumber = null;
    let gameStartTime = Date.now();
    let timerIntervalId = null;
    // 格式化經過時間（mm:ss）
    function formatElapsedTime(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // 更新計時器文字
    function updateTimerDisplay() {
        const elapsed = formatElapsedTime(Date.now() - gameStartTime);
        timerDisplayEl.textContent = `⏱️ 計時：${elapsed}`;
    }

    // 啟動每秒更新計時器
    function startTimer() {
        if (timerIntervalId) clearInterval(timerIntervalId);
        timerIntervalId = setInterval(() => {
            updateTimerDisplay();
        }, 1000);
    }

    // 停止計時器
    function stopTimer() {
        if (timerIntervalId) {
            clearInterval(timerIntervalId);
            timerIntervalId = null;
        }
    }

    // 將陣列序列化成 base64（用於分享）
    function encodeBoard(board) {
        return btoa(board.join(''));
    }

    // 反序列化 base64 到 81 格陣列
    function decodeBoard(encoded) {
        let decoded = '';
        try {
            decoded = atob(encoded);
        } catch (error) {
            return null;
        }

        if (!/^[0-9]{81}$/.test(decoded)) {
            return null;
        }
        return decoded.split('').map(ch => parseInt(ch, 10));
    }

    // 取得分享網址（帶 difficulty + puzzle + solution）
    function getShareUrl() {
        const params = new URLSearchParams();
        params.set('d', difficultySelector.value);         // 難易度
        params.set('p', encodeBoard(sudoku.puzzleBoard));  // 題目盤
        params.set('s', encodeBoard(sudoku.solution));     // 解答盤
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }

    // 顯示分享彈窗
    function showShareModal() {
        shareUrlInput.value = getShareUrl();
        shareCopyStatus.textContent = '';
        shareModalOverlay.classList.add('show');
    }

    // 隱藏分享彈窗
    function hideShareModal() {
        shareModalOverlay.classList.remove('show');
    }

    // 複製分享網址
    async function copyShareUrl() {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(shareUrlInput.value);
            } else {
                shareUrlInput.select();
                shareUrlInput.setSelectionRange(0, shareUrlInput.value.length);
                document.execCommand('copy');
            }
            shareCopyStatus.textContent = '✅ 已複製網址';
            shareCopyStatus.style.color = '#27ae60';
        } catch (error) {
            shareCopyStatus.textContent = '❌ 複製失敗，請手動複製';
            shareCopyStatus.style.color = '#c0392b';
        }
    }

    // 套用分享題目
    function applySharedPuzzle(difficulty, puzzleBoard, solutionBoard) {
        sudoku = new Sudoku();
        sudoku.puzzleBoard = puzzleBoard.slice();
        sudoku.board = puzzleBoard.slice();
        sudoku.solution = solutionBoard.slice();

        difficultySelector.value = difficulty;
        selectedCellIndex = -1;
        selectedNumber = null;

        // 分享題目要從同一條起跑線開始：重置狀態與計時
        validationResultEl.textContent = '';
        validationResultEl.className = '';
        checkBtn.disabled = false;
        gameStartTime = Date.now();
        updateTimerDisplay();
        startTimer();
        render();
    }

    // 嘗試從網址 query 載入分享題目，成功回傳 true
    function tryLoadSharedPuzzleFromQuery() {
        const params = new URLSearchParams(window.location.search);
        const difficulty = params.get('d');
        const puzzleEncoded = params.get('p');
        const solutionEncoded = params.get('s');

        if (!difficulty || !puzzleEncoded || !solutionEncoded) {
            return false;
        }

        if (!Object.prototype.hasOwnProperty.call(Sudoku.DIFFICULTY_MAP, difficulty)) {
            return false;
        }

        const puzzleBoard = decodeBoard(puzzleEncoded);
        const solutionBoard = decodeBoard(solutionEncoded);
        if (!puzzleBoard || !solutionBoard) {
            return false;
        }

        applySharedPuzzle(difficulty, puzzleBoard, solutionBoard);

        // 套用後移除 query，避免重新整理再次載入同題
        const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
        window.history.replaceState({}, '', cleanUrl);
        return true;
    }


    // 更新數字盤（按鈕狀態）
    function updateNumberPalette() {
        const counts = Array(10).fill(0);
        sudoku.board.forEach(d => { if (d > 0) counts[d]++; });
        numberPaletteEl.querySelectorAll('button[data-number]').forEach(btn => {
            const num = parseInt(btn.dataset.number);
            btn.classList.toggle('completed', counts[num] === 9);
            btn.classList.toggle('selected', num === selectedNumber);
        });
    }

    // 產生數字按鈕與橡皮擦
    function generateNumberPalette() {
        numberPaletteEl.innerHTML = '';
        for (let i = 1; i <= 9; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.dataset.number = i;
            btn.addEventListener('click', () => {
                const num = parseInt(btn.dataset.number);
                selectedNumber = (selectedNumber === num) ? null : num;
                render();
            });
            numberPaletteEl.appendChild(btn);
        }
        const eraser = document.createElement('button');
        eraser.textContent = 'X';
        eraser.addEventListener('click', () => {
            if (selectedCellIndex !== -1 && sudoku.puzzleBoard[selectedCellIndex] === 0) {
                sudoku.board[selectedCellIndex] = 0;
                render();
            }
        });
        numberPaletteEl.appendChild(eraser);
    }

    // 繪製棋盤
    function render() {
        boardEl.innerHTML = '';
        let allConflicts = new Set();
        for (let i = 0; i < 81; i++) {
            const cs = sudoku.findConflicts(i, sudoku.board);
            cs.forEach(x => allConflicts.add(x));
        }

        for (let i = 0; i < 81; i++) {
            const cell = document.createElement('div');
            const [row, col] = sudoku.rowCol(i);

            cell.classList.add('cell');
            cell.dataset.index = i;

            if ((row + col) % 2 === 0) cell.classList.add('checkerboard-dark');
            if ((col + 1) % 3 === 0 && col < 8) cell.classList.add('border-right');
            if ((row + 1) % 3 === 0 && row < 8) cell.classList.add('border-bottom');

            if (i === selectedCellIndex) cell.classList.add('selected');
            if (selectedCellIndex !== -1) {
                if (row === Math.floor(selectedCellIndex / 9) || col === selectedCellIndex % 9) {
                    cell.classList.add('highlight-row-col');
                }
            }

            const digit = sudoku.board[i];
            const isGiven = sudoku.puzzleBoard[i] !== 0;

            if (digit !== 0) {
                cell.textContent = digit;
                if (isGiven) cell.classList.add('given-digit');
                else cell.classList.add('user-digit');
                if (allConflicts.has(i)) cell.classList.add('conflict');
                if (digit === selectedNumber) cell.classList.add('highlight-number');
            }

            cell.addEventListener('click', () => {
                selectedCellIndex = i;
                if (selectedNumber !== null && sudoku.puzzleBoard[selectedCellIndex] === 0) {
                    // 仍允許放入以顯示衝突（若想禁止可改成檢查有效性才放）
                    sudoku.board[selectedCellIndex] = selectedNumber;
                }
                render();
            });

            boardEl.appendChild(cell);
        }
        updateNumberPalette();
    }

    // 建立新遊戲 (包 try/catch 顯示錯誤)
    function startNewGame() {
        try {
            const difficulty = difficultySelector.value;
            sudoku.generate(difficulty);
            selectedCellIndex = -1;
            selectedNumber = null;
            validationResultEl.textContent = '';
            validationResultEl.className = '';

            // 新局重置驗證狀態與計時
            checkBtn.disabled = false;
            gameStartTime = Date.now();
            updateTimerDisplay();
            startTimer();
            render();
        } catch (err) {
            console.error('生成新遊戲錯誤', err);
            validationResultEl.textContent = '生成題目時發生錯誤，請查看 console。';
        }
    }

    // 綁定按鈕
    checkBtn.addEventListener('click', () => {
        validationResultEl.className = '';
        if (!sudoku.isBoardFilled(sudoku.board)) {
            validationResultEl.textContent = '尚未填完所有格子。';
            validationResultEl.classList.add('validation-error');
            return;
        }
        if (sudoku.isSolved()) {
            const elapsed = formatElapsedTime(Date.now() - gameStartTime);
            validationResultEl.textContent = `恭喜！答案正確！🥳（耗時 ${elapsed}）`;
            validationResultEl.classList.add('validation-success');
            stopTimer();
        } else {
            validationResultEl.textContent = '噢！還有一些錯誤，請再試一次。😢';
            validationResultEl.classList.add('validation-error');
        }
    });

    newGameBtn.addEventListener('click', startNewGame);
    difficultySelector.addEventListener('change', startNewGame);

    // 分享功能按鈕
    shareBtn.addEventListener('click', showShareModal);
    copyShareUrlBtn.addEventListener('click', async () => {
        await copyShareUrl();
    });
    closeShareModalBtn.addEventListener('click', hideShareModal);
    shareModalOverlay.addEventListener('click', (e) => {
        if (e.target === shareModalOverlay) {
            hideShareModal();
        }
    });

    solveBtn.addEventListener('click', () => {
        sudoku.solve();
        selectedCellIndex = -1;
        selectedNumber = null;
        validationResultEl.className = '';
        validationResultEl.textContent = '已為您顯示完整解答';

        // 直接看答案後，不需再驗證，故停用驗證按鈕
        checkBtn.disabled = true;
        stopTimer();
        render();
    });

    // 初始建立數字面板並開始遊戲
    generateNumberPalette();

    // 先嘗試載入分享題目；若沒有再開新局
    const loadedFromShare = tryLoadSharedPuzzleFromQuery();
    if (!loadedFromShare) {
        startNewGame();
    }
});
