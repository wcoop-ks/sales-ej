// ======================================================
// sales.js - EJジャーナル分析 共通UI・ページ操作
//
// /main/, /sub/ ページ:
//   各ページ側で window.SalesPage を定義してから読み込む
//
// /common/ ページ:
//   window.SalesPageMain と window.SalesPageSub を両方定義してから読み込む
//   ファイル内容の 責任\d+ の有無でメイン/サブを自動判定し
//   window.SalesPage に動的にセットする
// ======================================================

document.addEventListener('DOMContentLoaded', function () {

    // ---- DOM参照 ----
    const dropZone                = document.getElementById('drop-zone');
    const fileInput               = document.getElementById('journal_file');
    const fileNameDisplay         = document.getElementById('file-name-display');
    const dropZoneText            = document.getElementById('drop-zone-text');
    const runButton               = document.getElementById('run-button');
    const rerunButton             = document.getElementById('rerun-button');
    const uploadFormSection       = document.getElementById('upload-form-section');
    const resultSection           = document.getElementById('result-section');
    const resultTitle             = document.getElementById('result-title');
    const resultTables            = document.getElementById('result-tables');
    const resetButton             = document.getElementById('reset-button');
    const errorMessage            = document.getElementById('error-message');
    const journalDisplayContainer = document.getElementById('journal-display-container');
    const journalContent          = document.getElementById('journal-content');
    const journalPre              = document.getElementById('journal-pre');
    const journalToggleButton     = document.getElementById('journal-toggle-button');
    const rerunToggleButton       = document.getElementById('rerun-toggle-button');
    const rerunDatePanel          = document.getElementById('rerun-date-panel');
    const folderInput             = document.getElementById('journal_folder');
    const folderButton            = document.getElementById('folder-button');
    const regChoice               = document.getElementById('reg-choice');

    // ---- 選択中のファイルと読み込み済みジャーナル ----
    let selectedFiles  = [];
    let selectedLabel  = '';
    let currentJournal = null;

    // ---- 出力用データ保持 ----
    window.SalesExportData = {
        analysisResult:  null,
        filteredContent: null,
        startDate:       null,
        endDate:         null,
        regLabel:        null,
    };

    // ---- レジ自動判定 ----
    function detectAndSetSalesPage(utf8Content) {
        if (!window.SalesPageMain || !window.SalesPageSub) return;
        window.SalesPage = /責任\d+/.test(utf8Content)
            ? window.SalesPageMain
            : window.SalesPageSub;
    }

    // ---- SalesPage プロパティへのアクセサ ----
    function getCacheContentKey()  { return window.SalesPage.CACHE_CONTENT_KEY; }
    function getCacheFilenameKey() { return window.SalesPage.CACHE_FILENAME_KEY; }
    function getCategoryClassMap() { return window.SalesPage.CATEGORY_CLASS_MAP; }
    function getCategoryOrder()    { return window.SalesPage.CATEGORY_ORDER; }

    // ---- キャッシュ操作 ----
    function setJournalCache(content, fileName) {
        try {
            localStorage.setItem(getCacheContentKey(), content || '');
            localStorage.setItem(getCacheFilenameKey(), fileName || '');
        } catch (e) {}
    }

    function getJournalCache() {
        try {
            return {
                content:  localStorage.getItem(getCacheContentKey())  || '',
                fileName: localStorage.getItem(getCacheFilenameKey()) || '',
            };
        } catch (e) {
            return { content: '', fileName: '' };
        }
    }

    function clearJournalCache() {
        currentJournal = null;
        try {
            if (window.SalesPageMain) {
                localStorage.removeItem(window.SalesPageMain.CACHE_CONTENT_KEY);
                localStorage.removeItem(window.SalesPageMain.CACHE_FILENAME_KEY);
            }
            if (window.SalesPageSub) {
                localStorage.removeItem(window.SalesPageSub.CACHE_CONTENT_KEY);
                localStorage.removeItem(window.SalesPageSub.CACHE_FILENAME_KEY);
            }
            localStorage.removeItem(getCacheContentKey());
            localStorage.removeItem(getCacheFilenameKey());
        } catch (e) {}
    }

    // ---- 終了日オプション制御 ----
    function setupEndDateToggle(checkboxId, selectorId) {
        const checkbox = document.getElementById(checkboxId);
        const selector = document.getElementById(selectorId);
        if (!checkbox || !selector) return;

        function update() {
            selector.classList.toggle('disabled', !checkbox.checked);
        }

        checkbox.addEventListener('change', update);
        update();
    }

    setupEndDateToggle('end-date-enable', 'end-date-selector');
    setupEndDateToggle('rerun-end-date-enable', 'rerun-end-date-selector');

    // ---- 終了日が明示指定されているか ----
    function isEndDateExplicit(prefix) {
        const cbId = prefix === 'rerun_end' ? 'rerun-end-date-enable' : 'end-date-enable';
        const cb = document.getElementById(cbId);
        return cb ? cb.checked : true;
    }

    // ---- 日付ユーティリティ ----
    function getDateString(prefix) {
        const y = document.getElementById(prefix + '_year_input').value;
        const m = document.getElementById(prefix + '_month_input').value;
        const d = document.getElementById(prefix + '_day_input').value;
        if (!y || !m || !d) return null;
        return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }

    // 終了日: チェックOFF→開始日と同じ値、チェックON→入力値
    function getEndDateString(startPrefix, endPrefix) {
        if (!isEndDateExplicit(endPrefix)) return getDateString(startPrefix);
        return getDateString(endPrefix);
    }

    function setDateInputs(prefix, dateStr) {
        if (!dateStr) return;
        const parts = dateStr.split('-');
        if (parts.length !== 3) return;
        document.getElementById(prefix + '_year_input').value  = parseInt(parts[0], 10);
        document.getElementById(prefix + '_month_input').value = parseInt(parts[1], 10);
        document.getElementById(prefix + '_day_input').value   = parseInt(parts[2], 10);
    }

    function setupDateMaxDays(prefix) {
        const y = document.getElementById(prefix + '_year_input');
        const m = document.getElementById(prefix + '_month_input');
        const d = document.getElementById(prefix + '_day_input');
        if (!y || !m || !d) return;

        function updateMax() {
            const year    = parseInt(y.value) || 2026;
            const month   = parseInt(m.value) || 1;
            const maxDays = new Date(year, month, 0).getDate();
            d.max = maxDays;
            if (parseInt(d.value) > maxDays) d.value = maxDays;
        }

        y.addEventListener('input', updateMax);
        m.addEventListener('input', updateMax);
    }

    setupDateMaxDays('start');
    setupDateMaxDays('end');
    setupDateMaxDays('rerun_start');
    setupDateMaxDays('rerun_end');

    // ---- マウスホイールで日付入力を増減 ----
    function setupWheelInput(prefix) {
        const y = document.getElementById(prefix + '_year_input');
        const m = document.getElementById(prefix + '_month_input');
        const d = document.getElementById(prefix + '_day_input');

        function addWheel(el, min, max) {
            el.addEventListener('wheel', function (e) {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 1 : -1;
                let val = parseInt(el.value) || min;
                val = Math.min(max, Math.max(min, val + delta));
                el.value = val;
                el.dispatchEvent(new Event('input'));
            }, { passive: false });
        }

        if (y) addWheel(y, 2020, 2100);
        if (m) addWheel(m, 1, 12);
        if (d) addWheel(d, 1, 31);
    }

    setupWheelInput('start');
    setupWheelInput('end');
    setupWheelInput('rerun_start');
    setupWheelInput('rerun_end');

    // ---- 日付行パース ----
    function parseDateFromLine(line) {
        const m = line.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
        if (!m) return null;
        return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    }

    // ---- 日付フィルタリング ----
    function filterJournalByDate(content, startDate, endDate) {
        if (!startDate && !endDate) return content;

        const lines    = content.split('\n');
        const filtered = [];
        let include    = false;

        for (const line of lines) {
            const dateStr = parseDateFromLine(line);
            if (dateStr) {
                include = true;
                if (startDate && dateStr < startDate) include = false;
                if (endDate   && dateStr > endDate)   include = false;
            }
            if (include) filtered.push(line);
        }

        return filtered.join('\n');
    }

    // ---- Shift-JIS → UTF-8 変換 ----
    function decodeFileContent(arrayBuffer) {
        const uint8 = new Uint8Array(arrayBuffer);

        if (typeof Encoding !== 'undefined') {
            const detected = Encoding.detect(uint8);
            if (detected && detected !== 'UNICODE') {
                const unicode = Encoding.convert(uint8, { to: 'UNICODE', from: detected });
                return Encoding.codeToString(unicode);
            }
        }

        try {
            return new TextDecoder('shift_jis').decode(uint8);
        } catch (e) {
            return new TextDecoder('utf-8').decode(uint8);
        }
    }

    // ---- 複数ファイルの結合 ----
    // 途中でSD書き込みした日はジャーナルが複数ファイルに分かれる。
    // 日付行ごとの取引ブロックに分け、日時+取引番号が同じブロックは1つにする
    // （メインレジの「書込のみ」は後のファイルが前の内容を含むため、重なりを除く）。
    // ファイルは先頭ブロックの日時が早い順に並べる。
    function splitTransactionBlocks(content) {
        const blocks = [];
        let current  = null;

        for (const line of content.split('\n')) {
            const m = line.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{2})/);
            if (m) {
                current = {
                    time:  m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') +
                           ' ' + m[4].padStart(2, '0') + ':' + m[5],
                    lines: [line],
                };
                blocks.push(current);
            } else if (current) {
                current.lines.push(line);
            }
        }

        for (const b of blocks) {
            const txLine = b.lines.find(l => /^000000#\d+/.test(l.trim()));
            b.key = txLine
                ? b.time + ' ' + txLine.trim().match(/^000000#(\d+)/)[1]
                : b.lines.join('\n');
        }
        return blocks;
    }

    function mergeJournalContents(contents) {
        if (contents.length === 1) return contents[0];

        const files = contents
            .map(c => splitTransactionBlocks(c))
            .filter(blocks => blocks.length > 0)
            .sort((a, b) => a[0].time < b[0].time ? -1 : a[0].time > b[0].time ? 1 : 0);

        const seen   = new Set();
        const merged = [];
        for (const blocks of files) {
            for (const b of blocks) {
                if (seen.has(b.key)) continue;
                seen.add(b.key);
                merged.push(b.lines.join('\n'));
            }
        }
        return merged.join('\n');
    }

    // ---- 数値フォーマット ----
    function numFmt(n) {
        return Number(n).toLocaleString('ja-JP');
    }

    // ---- HTMLエスケープ ----
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ---- 時間帯別分析 ----
    // トランザクション単位に分割（各ブロックは日付行で始まる）
    function splitTransactions(content) {
        const lines  = content.split('\n');
        const blocks = [];
        let cur = null;
        for (const raw of lines) {
            const line = raw.trim();
            if (parseDateFromLine(line)) {
                if (cur) blocks.push(cur);
                const tm = line.match(/(\d{1,2}):(\d{2})/);
                const minutes = tm ? (parseInt(tm[1], 10) * 60 + parseInt(tm[2], 10)) : null;
                cur = { minutes: minutes, lines: [line] };
            } else if (cur) {
                cur.lines.push(line);
            }
        }
        if (cur) blocks.push(cur);
        return blocks;
    }

    function getBandMinutes() {
        const sel = document.getElementById('timeband-granularity');
        const v = sel ? parseInt(sel.value, 10) : 60;
        return (v && v > 0) ? v : 60;
    }

    function bandLabel(startMin, bandMinutes) {
        const pad = n => String(n).padStart(2, '0');
        const sh = Math.floor(startMin / 60), sm = startMin % 60;
        if (bandMinutes === 60 && sm === 0) return sh + '時台';
        const end = startMin + bandMinutes;
        return pad(sh) + ':' + pad(sm) + '–' + pad(Math.floor(end / 60)) + ':' + pad(end % 60);
    }

    // カテゴリ別の個数・金額を1バンドから取得
    function bandCatQtyAmt(band, cat) {
        const pb = band.categoryStats[cat];
        let q = 0, a = 0;
        if (pb) for (const p in pb) { q += pb[p]; a += Number(p) * pb[p]; }
        return { q: q, a: a };
    }

    // 既存パーサをトランザクション単位で再利用して時間帯別に集計
    function analyzeByTimeBand(content, bandMinutes) {
        const parser = window.SalesPage;
        if (!parser || !content) return { bands: [], categories: [] };

        const bandMap = {}; // startMin -> { count, categoryStats }
        const catSet  = new Set();

        for (const b of splitTransactions(content)) {
            if (b.minutes == null) continue;
            const res = parser.parseJournalContent(b.lines.join('\n'));
            const cs  = res.categoryStats || res;

            let qty = 0, amt = 0;
            for (const cat in cs) for (const p in cs[cat]) { qty += cs[cat][p]; amt += Number(p) * cs[cat][p]; }

            const startMin = Math.floor(b.minutes / bandMinutes) * bandMinutes;
            if (!bandMap[startMin]) bandMap[startMin] = { count: 0, categoryStats: {} };
            const band = bandMap[startMin];

            for (const cat in cs) {
                catSet.add(cat);
                if (!band.categoryStats[cat]) band.categoryStats[cat] = {};
                for (const p in cs[cat]) {
                    band.categoryStats[cat][p] = (band.categoryStats[cat][p] || 0) + cs[cat][p];
                }
            }
            // 売上のある会計のみカウント（両替・入金なし解除は0なので除外される）
            if (qty !== 0 || amt !== 0) band.count++;
        }

        const CATEGORY_ORDER = getCategoryOrder();
        const categories = [...catSet].sort((a, b) => {
            if (!CATEGORY_ORDER) return a.localeCompare(b);
            const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
            return (ia === -1 ? CATEGORY_ORDER.length : ia) - (ib === -1 ? CATEGORY_ORDER.length : ib);
        });

        const bands = Object.keys(bandMap).map(Number).sort((a, b) => a - b)
            .filter(startMin => bandMap[startMin].count > 0) // 売上のない空バンド（両替のみ等）は除外
            .map(startMin => ({
                startMin:      startMin,
                label:         bandLabel(startMin, bandMinutes),
                count:         bandMap[startMin].count,
                categoryStats: bandMap[startMin].categoryStats,
            }));

        return { bands: bands, categories: categories };
    }

    // PC向け: 時間帯×カテゴリのマトリクス表（各セル「個数 / 金額」）
    function buildTimeBandMatrix(bands, categories) {
        const CCM = getCategoryClassMap();
        let head = '<th>時間帯</th><th class="amount">会計件数</th>';
        for (const c of categories) {
            head += `<th class="amount category-${escHtml(CCM[c] || '')}">${escHtml(c)}</th>`;
        }
        head += '<th class="amount">金額合計</th>';

        const totals = { count: 0, cat: {}, amt: 0 };
        let rows = '';
        for (const b of bands) {
            let bandAmt = 0, cells = '';
            for (const c of categories) {
                const { q, a } = bandCatQtyAmt(b, c);
                bandAmt += a;
                totals.cat[c] = totals.cat[c] || { q: 0, a: 0 };
                totals.cat[c].q += q; totals.cat[c].a += a;
                const qd = (c === 'パン') ? '—' : numFmt(q);
                cells += `<td class="amount">${(q !== 0 || a !== 0) ? qd + ' / ¥' + numFmt(a) : '—'}</td>`;
            }
            totals.count += b.count; totals.amt += bandAmt;
            rows += `<tr><td>${escHtml(b.label)}</td><td class="amount">${numFmt(b.count)}</td>${cells}<td class="amount">¥${numFmt(bandAmt)}</td></tr>`;
        }

        let tcells = '';
        for (const c of categories) {
            const t = totals.cat[c] || { q: 0, a: 0 };
            const qd = (c === 'パン') ? '—' : numFmt(t.q);
            tcells += `<td class="amount">${qd} / ¥${numFmt(t.a)}</td>`;
        }
        const totalRow = `<tr class="timeband-total"><td>合計</td><td class="amount">${numFmt(totals.count)}</td>${tcells}<td class="amount">¥${numFmt(totals.amt)}</td></tr>`;

        return `<div class="timeband-matrix-wrap">
            <table class="timeband-matrix">
                <thead><tr>${head}</tr></thead>
                <tbody>${rows}${totalRow}</tbody>
            </table>
            <p class="timeband-legend">各カテゴリのセル：個数 / 金額</p>
        </div>`;
    }

    // SP向け: 時間帯ごとのミニ表
    function buildTimeBandCards(bands, categories) {
        const CCM = getCategoryClassMap();
        let html = '<div class="timeband-cards">';
        for (const b of bands) {
            let body = '', bandAmt = 0;
            for (const c of categories) {
                const { q, a } = bandCatQtyAmt(b, c);
                if (q === 0 && a === 0) continue;
                bandAmt += a;
                const qd = (c === 'パン') ? '—' : numFmt(q);
                body += `<tr class="category-${escHtml(CCM[c] || '')}"><td>${escHtml(c)}</td><td class="amount">${qd}</td><td class="amount">¥${numFmt(a)}</td></tr>`;
            }
            html += `<div class="timeband-card">
                <div class="timeband-card-head">${escHtml(b.label)}　会計${numFmt(b.count)}件　¥${numFmt(bandAmt)}</div>
                <table class="timeband-card-table">
                    <thead><tr><th>分類</th><th class="amount">個数</th><th class="amount">金額</th></tr></thead>
                    <tbody>${body || '<tr><td colspan="3">—</td></tr>'}</tbody>
                </table>
            </div>`;
        }
        return html + '</div>';
    }

    function renderTimeBand(content) {
        const section   = document.getElementById('timeband-section');
        const container = document.getElementById('timeband-tables');
        if (!section || !container) return;

        if (!content || !window.SalesPage) { section.style.display = 'none'; return; }

        const { bands, categories } = analyzeByTimeBand(content, getBandMinutes());
        if (bands.length === 0) { section.style.display = 'none'; return; }

        section.style.display = '';
        container.innerHTML = buildTimeBandMatrix(bands, categories) + buildTimeBandCards(bands, categories);
    }

    // ---- 結果テーブル描画 ----
    function renderResults(analysisResult, paymentStats, cancelledWithPayment, everRegistered, startDate, endDate, filteredContent, endExplicit) {
        const CATEGORY_CLASS_MAP = getCategoryClassMap();
        const CATEGORY_ORDER     = getCategoryOrder();

        // タイトル: 同じ日付なら1日だけ表示
        let titleText = '分析結果';
        if (startDate) {
            if (!endExplicit || startDate === endDate) {
                titleText += ' (' + startDate + ')';
            } else {
                titleText += ' (' + startDate + ' 〜 ' + endDate + ')';
            }
        }
        resultTitle.textContent = titleText;

        const regLabel = (window.SalesPage === window.SalesPageMain)
            ? 'メインレジ (XE-A207)'
            : (window.SalesPage === window.SalesPageSub)
                ? 'サブレジ (XE-A147)'
                : null;

        const regIndicator = document.getElementById('reg-indicator');
        if (regIndicator) {
            regIndicator.textContent = regLabel || '';
            regIndicator.style.display = regLabel ? '' : 'none';
        }

        // 出力用にデータを保持
        window.SalesExportData.analysisResult        = analysisResult;
        window.SalesExportData.paymentStats          = paymentStats;
        window.SalesExportData.cancelledWithPayment  = cancelledWithPayment;
        window.SalesExportData.filteredContent       = filteredContent;
        window.SalesExportData.startDate             = startDate;
        window.SalesExportData.endDate               = endDate;
        window.SalesExportData.regLabel              = regLabel;

        if (!analysisResult || Object.keys(analysisResult).length === 0) {
            resultTables.innerHTML = '<p>指定された期間のデータがありません。</p>';
        } else {
            const sortedCategories = Object.keys(analysisResult).sort((a, b) => {
                if (!CATEGORY_ORDER) return a.localeCompare(b);
                const ia = CATEGORY_ORDER.indexOf(a);
                const ib = CATEGORY_ORDER.indexOf(b);
                const oa = ia === -1 ? CATEGORY_ORDER.length : ia;
                const ob = ib === -1 ? CATEGORY_ORDER.length : ib;
                return oa - ob;
            });

            // 集計テーブル
            let totalQty    = 0;
            let totalAmount = 0;
            let summaryRows = '';

            for (const category of sortedCategories) {
                const priceBreakdown = analysisResult[category];
                let catQty    = 0;
                let catAmount = 0;

                for (const [price, count] of Object.entries(priceBreakdown)) {
                    if (count === 0) continue;
                    catQty    += count;
                    catAmount += Number(price) * count;
                }

                const isBread = category === 'パン';

                // パン以外は0件をスキップ
                if (!isBread && catQty === 0) continue;

                totalQty    += catQty;
                totalAmount += catAmount;
                const cls = CATEGORY_CLASS_MAP[category] || '';

                // パンは件数セルを非表示（—表示）、他は通常表示
                const qtyCell = isBread
                    ? `<td class="amount">—</td>`
                    : `<td class="amount">${numFmt(catQty)}</td>`;

                summaryRows += `<tr class="category-${escHtml(cls)}">
                    <td>${escHtml(category)}</td>
                    ${qtyCell}
                    <td class="amount">${numFmt(catAmount)}</td>
                </tr>`;
            }

            // パンがデータに存在しない場合、一度でも登録されていれば行を表示
            if (!sortedCategories.includes('パン')) {
                const wasEverRegistered = !everRegistered || everRegistered.has('パン');
                if (wasEverRegistered) {
                    const cls = CATEGORY_CLASS_MAP['パン'] || '';
                    summaryRows += `<tr class="category-${escHtml(cls)}">
                        <td>パン</td>
                        <td class="amount">—</td>
                        <td class="amount">0</td>
                    </tr>`;
                }
            }

            summaryRows += `<tr style="font-weight:bold;background-color:#f0f0f0;">
                <td>合計</td>
                <td class="amount">${numFmt(totalQty)}</td>
                <td class="amount">${numFmt(totalAmount)}</td>
            </tr>`;

            // 支払方法行
            if (paymentStats) {
                summaryRows += `<tr style="background-color:#e8f4fd;">
                    <td>—</td>
                    <td class="amount">現金</td>
                    <td class="amount">${numFmt(paymentStats.cash)}</td>
                </tr>`;
                summaryRows += `<tr style="background-color:#e8f4fd;">
                    <td>—</td>
                    <td class="amount">${escHtml(window.SalesPage.CREDIT_LABEL || 'クレジット')}</td>
                    <td class="amount">${numFmt(paymentStats.credit)}</td>
                </tr>`;
            }

            // 明細テーブル
            let detailRows = '';
            for (const category of sortedCategories) {
                const priceBreakdown = analysisResult[category];
                const sortedPrices   = Object.keys(priceBreakdown)
                    .map(Number)
                    .sort((a, b) => b - a);

                for (const price of sortedPrices) {
                    const count = priceBreakdown[price];
                    if (count === 0) continue;
                    const subtotal = price * count;
                    const cls = CATEGORY_CLASS_MAP[category] || '';
                    detailRows += `<tr class="category-${escHtml(cls)}">
                        <td>${escHtml(category)}</td>
                        <td class="amount">${numFmt(price)}</td>
                        <td>${numFmt(count)}</td>
                        <td class="amount">${numFmt(subtotal)}</td>
                    </tr>`;
                }
            }

            resultTables.innerHTML = `
                <h3 class="summary-heading" style="margin-top:40px;">集計結果</h3>
                <table class="summaryTable">
                    <thead>
                        <tr>
                            <th>カテゴリ</th>
                            <th class="amount">販売数合計</th>
                            <th class="amount">販売額合計</th>
                        </tr>
                    </thead>
                    <tbody>${summaryRows}</tbody>
                </table>

                <h3 class="detail-heading" style="margin-top:40px;">詳細</h3>
                <table class="detailTable">
                    <thead>
                        <tr>
                            <th>カテゴリ</th>
                            <th>金額</th>
                            <th>販売数</th>
                            <th class="amount">小計</th>
                        </tr>
                    </thead>
                    <tbody>${detailRows}</tbody>
                </table>
            `;
        }

        // 一部入金後解除の警告
        const warningContainer = document.getElementById('cancelled-payment-warning');
        if (warningContainer) {
            if (cancelledWithPayment && cancelledWithPayment.length > 0) {
                let rows = cancelledWithPayment.map(tx =>
                    `<tr>
                        <td>${escHtml(tx.date || '')}</td>
                        <td>#${escHtml(tx.txNo || '')}</td>
                        <td class="amount">${numFmt(tx.payment)}</td>
                    </tr>`
                ).join('');
                warningContainer.innerHTML = `
                    <div class="cancelled-payment-warning">
                        <p class="warning-title"><i class="fa-solid fa-triangle-exclamation"></i> 一部入金後に取り消された会計があります</p>
                        <p class="warning-desc">以下の会計はレジ日計に売上・入金として計上されていますが、このツールでは取り消しています。レジ日計との差異が生じます。</p>
                        <table class="warning-table">
                            <thead><tr><th>日付</th><th>No.</th><th class="amount">入金額</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>`;
                warningContainer.style.display = '';

                // ポップアップ表示
                showWarningPopup(cancelledWithPayment);
            } else {
                warningContainer.innerHTML = '';
                warningContainer.style.display = 'none';
            }
        }

        // 時間帯別分析
        renderTimeBand(filteredContent);

        // ジャーナル表示
        if (filteredContent) {
            journalPre.textContent = filteredContent;
            journalDisplayContainer.style.display = '';
        } else {
            journalDisplayContainer.style.display = 'none';
        }

        // 表示切り替え
        uploadFormSection.classList.add('hidden');
        resultSection.classList.add('visible');
        if (resetButtonFixed) resetButtonFixed.classList.add('visible');

        // データがある場合のみrerunパネルを閉じる
        if (analysisResult && Object.keys(analysisResult).length > 0) {
            rerunDatePanel.classList.remove('visible');
            rerunToggleButton.setAttribute('aria-expanded', 'false');
        }
        journalContent.classList.remove('visible');
        journalToggleButton.setAttribute('aria-expanded', 'false');

        // rerunパネルの日付・チェックボックスを同期
        if (startDate) setDateInputs('rerun_start', startDate);
        const rerunCb  = document.getElementById('rerun-end-date-enable');
        const rerunSel = document.getElementById('rerun-end-date-selector');
        if (rerunCb)  rerunCb.checked = endExplicit;
        if (rerunSel) rerunSel.classList.toggle('disabled', !endExplicit);
        setDateInputs('rerun_end', endExplicit ? endDate : startDate);
    }

    // ---- 分析実行 ----
    function runAnalysis(utf8Content, fileName, startDate, endDate, endExplicit) {
        currentJournal = { content: utf8Content, fileName: fileName || '' };
        setJournalCache(utf8Content, fileName || '');
        const filtered = filterJournalByDate(utf8Content, startDate, endDate);
        const parsed   = window.SalesPage.parseJournalContent(utf8Content, startDate, endDate);

        // 旧形式（categoryStatsのみ返す）との互換性
        const categoryStats        = parsed.categoryStats        || parsed;
        const paymentStats         = parsed.paymentStats         || null;
        const cancelledWithPayment = parsed.cancelledWithPayment || [];
        const everRegistered       = parsed.everRegistered       || null;

        renderResults(categoryStats, paymentStats, cancelledWithPayment, everRegistered, startDate, endDate, filtered, endExplicit);
    }

    // ---- ファイル読み込み ----
    function readFileAsArrayBuffer(file) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload  = function (e) { resolve(e.target.result); };
            reader.onerror = function () { reject(reader.error); };
            reader.readAsArrayBuffer(file);
        });
    }

    function readAndAnalyze(files, label, startDate, endDate, endExplicit) {
        Promise.all(files.map(readFileAsArrayBuffer)).then(function (buffers) {
            // 取引が1件もないファイル（書き込み直後の空ファイルなど）は判定から外す
            const contents = buffers.map(decodeFileContent)
                .filter(c => /\d{4}年\s*\d{1,2}月\s*\d{1,2}日/.test(c));
            if (contents.length === 0) {
                alert('ジャーナルのデータが見つかりませんでした。');
                return;
            }

            // メイン/サブの混在チェック
            const isMain = contents.map(c => /責任\d+/.test(c));
            if (isMain.some(v => v !== isMain[0])) {
                alert('メインレジとサブレジのファイルが混在しています。SDカードの ECRXXX10（メイン）か ECRXXX15（サブ）のどちらか一方を選択してください。');
                return;
            }

            const utf8 = mergeJournalContents(contents);
            detectAndSetSalesPage(utf8);
            clearJournalCache();
            runAnalysis(utf8, label, startDate, endDate, endExplicit);
        }).catch(function () {
            alert('ファイルの読み込みに失敗しました。');
        });
    }

    // ---- 読み込み対象の選別 ----
    // フォルダ指定時は EJ/日付-n/EJFILE.TXT だけを拾う。
    // EJPRINT（印刷用の写し）と Mac が作る ._ ファイルは除く。
    function isJournalPath(path) {
        const parts = path.split('/');
        const name  = parts[parts.length - 1];
        if (name.startsWith('._')) return false;
        if (name.toUpperCase() !== 'EJFILE.TXT') return false;
        return !parts.some(p => p.toUpperCase() === 'EJPRINT');
    }

    function isTxtFile(name) {
        return name.toLowerCase().endsWith('.txt') && !name.startsWith('._');
    }

    // フォルダ名の表示用: 選択したフォルダ（パスの先頭）
    function topFolderName(paths) {
        const tops = new Set(paths.map(p => p.split('/')[0]));
        return Array.from(tops).join(', ');
    }

    // ---- 選択の確定と表示 ----
    function setSelectedFiles(files, label) {
        clearJournalCache();
        selectedFiles = files;
        selectedLabel = label;
        fileNameDisplay.innerHTML = escHtml(label) + '<br>別のファイルをアップロード';
        dropZoneText.classList.add('hidden');
    }

    function selectFiles(files) {
        hideRegChoice();
        const txtFiles = files.filter(f => isTxtFile(f.name));
        if (txtFiles.length === 0) {
            alert('.txtファイルのみアップロード可能です。');
            return;
        }
        const label = txtFiles.length === 1
            ? 'ファイル: ' + txtFiles[0].name
            : 'ファイル: ' + txtFiles.length + '件（' + txtFiles.map(f => f.name).join(', ') + '）';
        setSelectedFiles(txtFiles, label);
    }

    // SDカードの機種フォルダ: ECRXXX10 = メイン (XE-A207)、ECRXXX15 = サブ (XE-A147)
    const MODEL_FOLDERS = [
        { key: 'main', folder: 'ECRXXX10', label: 'メインレジ (XE-A207)' },
        { key: 'sub',  folder: 'ECRXXX15', label: 'サブレジ (XE-A147)' },
    ];

    function modelOfPath(path) {
        const parts = path.toUpperCase().split('/');
        const m = MODEL_FOLDERS.find(mf => parts.includes(mf.folder));
        return m ? m.key : null;
    }

    // items: [{ file, path }]（path はフォルダからの相対パス）
    function selectFolderItems(items) {
        hideRegChoice();
        const journals = items.filter(it => isJournalPath(it.path));
        if (journals.length === 0) {
            alert('フォルダ内に EJFILE.TXT が見つかりません。SDカードの SHARP / ECRXXX10 / ECRXXX15 フォルダを選択してください。');
            return;
        }

        // SHARP ごと選ばれた場合は機種フォルダで分け、どちらを分析するか選ばせる
        const groups = MODEL_FOLDERS
            .map(mf => Object.assign({}, mf, { items: journals.filter(it => modelOfPath(it.path) === mf.key) }))
            .filter(g => g.items.length > 0);
        if (groups.length > 1) {
            showRegChoice(groups, topFolderName(journals.map(it => it.path)));
            return;
        }

        const label = 'フォルダ: ' + topFolderName(journals.map(it => it.path)) +
                      '（EJFILE.TXT ' + journals.length + '件）';
        setSelectedFiles(journals.map(it => it.file), label);
    }

    // ---- メイン/サブの選択（SHARP フォルダごと選ばれたとき）----
    function showRegChoice(groups, top) {
        if (!regChoice) return;
        regChoice.innerHTML = '<span class="reg-choice-title">分析するレジ</span>' + groups.map((g, i) =>
            `<label class="reg-choice-option"><input type="radio" name="reg-choice" value="${i}"${i === 0 ? ' checked' : ''}> ` +
            `${escHtml(g.label)}（${g.items.length}件）</label>`
        ).join('');
        regChoice.style.display = '';

        function apply(i) {
            const g = groups[i];
            setSelectedFiles(g.items.map(it => it.file),
                'フォルダ: ' + top + ' / ' + g.folder + '（EJFILE.TXT ' + g.items.length + '件）');
        }
        regChoice.querySelectorAll('input[name="reg-choice"]').forEach(function (radio) {
            radio.addEventListener('change', function () { apply(Number(radio.value)); });
        });
        apply(0);
    }

    function hideRegChoice() {
        if (!regChoice) return;
        regChoice.innerHTML = '';
        regChoice.style.display = 'none';
    }

    // ---- ドロップされたフォルダの展開 ----
    function readAllEntries(dirReader) {
        return new Promise(function (resolve, reject) {
            const all = [];
            (function next() {
                dirReader.readEntries(function (entries) {
                    if (entries.length === 0) { resolve(all); return; }
                    all.push(...entries);
                    next();
                }, reject);
            })();
        });
    }

    function collectFromEntry(entry) {
        if (entry.isFile) {
            return new Promise(function (resolve, reject) {
                entry.file(f => resolve([{ file: f, path: entry.fullPath.replace(/^\//, '') }]), reject);
            });
        }
        if (entry.isDirectory) {
            return readAllEntries(entry.createReader())
                .then(entries => Promise.all(entries.map(collectFromEntry)))
                .then(lists => [].concat(...lists));
        }
        return Promise.resolve([]);
    }

    // ---- エラー表示 ----
    function hideError() {
        if (errorMessage) errorMessage.style.display = 'none';
    }

    // ---- 一部入金後解除の警告ポップアップ ----
    function showWarningPopup(cancelledList) {
        const modal = document.getElementById('warning-popup-modal');
        const body  = document.getElementById('warning-popup-body');
        if (!modal || !body) return;

        let rows = cancelledList.map(tx =>
            `<tr>
                <td>${escHtml(tx.date || '')}</td>
                <td>#${escHtml(tx.txNo || '')}</td>
                <td class="amount">${numFmt(tx.payment)}</td>
            </tr>`
        ).join('');

        body.innerHTML = `
            <p class="warning-desc">以下の会計はレジ日計に売上・入金として計上されていますが、このツールでは取り消しています。レジ日計との差異が生じます。</p>
            <table class="warning-table">
                <thead><tr><th>日付</th><th>No.</th><th class="amount">入金額</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;

        modal.classList.add('visible');
        modal.setAttribute('aria-hidden', 'false');
    }

    // ---- ドロップゾーン ----
    if (dropZone) {
        dropZone.addEventListener('click', function (e) {
            e.preventDefault();
            fileInput.click();
        });
        dropZone.addEventListener('touchend', function (e) {
            e.preventDefault();
            fileInput.click();
        });
        dropZone.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInput.click();
            }
        });
        dropZone.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');

            // フォルダが含まれていれば中を辿る（エントリはイベント中に取得する必要がある）
            const entries = Array.from(e.dataTransfer.items || [])
                .map(it => it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)
                .filter(Boolean);
            if (entries.some(en => en.isDirectory)) {
                Promise.all(entries.map(collectFromEntry))
                    .then(lists => selectFolderItems([].concat(...lists)))
                    .catch(() => alert('フォルダの読み込みに失敗しました。'));
                return;
            }

            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) selectFiles(files);
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', function () {
            if (fileInput.files.length > 0) selectFiles(Array.from(fileInput.files));
            fileInput.value = '';
        });
    }

    if (folderButton && folderInput) {
        folderButton.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            folderInput.click();
        });
        folderInput.addEventListener('change', function () {
            const files = Array.from(folderInput.files);
            selectFolderItems(files.map(f => ({ file: f, path: f.webkitRelativePath || f.name })));
            folderInput.value = '';
        });
    }

    // ---- 分析実行ボタン ----
    if (runButton) {
        runButton.addEventListener('click', function () {
            const startDate   = getDateString('start');
            const endExplicit = isEndDateExplicit('end');
            const endDate     = getEndDateString('start', 'end');

            if (startDate && endDate && endDate < startDate) {
                alert('日付の入力が不正です');
                return;
            }

            if (selectedFiles.length === 0) {
                alert('ファイルが選択されていません。');
                return;
            }

            document.activeElement.blur();
            if (!endExplicit) setDateInputs('end', startDate);
            readAndAnalyze(selectedFiles, selectedLabel, startDate, endDate, endExplicit);
        });
    }

    // ---- 再計算ボタン ----
    if (rerunButton) {
        rerunButton.addEventListener('click', function () {
            // 何か月分も読み込むと localStorage に入りきらないので、メモリー上の内容を優先する
            const cache = currentJournal || getJournalCache();
            if (!cache.content) {
                alert('保持されたファイル情報がありません。再度ファイルをアップロードしてください。');
                return;
            }
            const startDate   = getDateString('rerun_start');
            const endExplicit = isEndDateExplicit('rerun_end');
            const endDate     = getEndDateString('rerun_start', 'rerun_end');

            if (startDate && endDate && endDate < startDate) {
                alert('日付の入力が不正です');
                return;
            }

            rerunToggleButton.setAttribute('aria-expanded', 'false');
            rerunDatePanel.classList.remove('visible');

            runAnalysis(cache.content, cache.fileName, startDate, endDate, endExplicit);

            if (startDate) setDateInputs('start', startDate);
            if (endExplicit && endDate) setDateInputs('end', endDate);
            if (!endExplicit) setDateInputs('rerun_end', startDate);
        });
    }

    // ---- 日付変更パネルトグル ----
    if (rerunToggleButton && rerunDatePanel) {
        rerunToggleButton.addEventListener('click', function () {
            const isVisible = rerunDatePanel.classList.contains('visible');
            rerunDatePanel.classList.toggle('visible');
            rerunToggleButton.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
        });
    }

    // ---- ジャーナル表示トグル ----
    if (journalToggleButton && journalContent) {
        journalToggleButton.addEventListener('click', function () {
            const isVisible = journalContent.classList.contains('visible');
            journalContent.classList.toggle('visible');
            journalToggleButton.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
        });
    }

    // ---- リセットボタン ----
    const resetButtonFixed = document.getElementById('reset-button-fixed');

    function doReset() {
        uploadFormSection.classList.remove('hidden');
        resultSection.classList.remove('visible');
        if (resetButtonFixed) resetButtonFixed.classList.remove('visible');

        fileInput.value = '';
        if (folderInput) folderInput.value = '';
        selectedFiles = [];
        selectedLabel = '';
        hideRegChoice();
        fileNameDisplay.textContent = '';
        dropZoneText.classList.remove('hidden');
        clearJournalCache();
        hideError();

        // 終了日チェックボックスをリセット
        ['end-date-enable', 'rerun-end-date-enable'].forEach(function (id) {
            const cb = document.getElementById(id);
            if (cb) {
                cb.checked = false;
                cb.dispatchEvent(new Event('change'));
            }
        });
    }

    if (resetButton)      resetButton.addEventListener('click', doReset);
    if (resetButtonFixed) resetButtonFixed.addEventListener('click', doReset);

    // ---- 当日の日付を初期値にセット ----
    const today  = new Date();
    const todayY = today.getFullYear();
    const todayM = today.getMonth() + 1;
    const todayD = today.getDate();

    for (const prefix of ['start', 'end', 'rerun_start', 'rerun_end']) {
        document.getElementById(prefix + '_year_input').value  = todayY;
        document.getElementById(prefix + '_month_input').value = todayM;
        document.getElementById(prefix + '_day_input').value   = todayD;
    }

    // ---- 警告ポップアップ ----
    const warningPopupModal = document.getElementById('warning-popup-modal');
    const warningPopupClose = document.getElementById('warning-popup-close');

    if (warningPopupClose) {
        warningPopupClose.addEventListener('click', function () {
            warningPopupModal.classList.remove('visible');
            warningPopupModal.setAttribute('aria-hidden', 'true');
        });
    }
    if (warningPopupModal) {
        warningPopupModal.addEventListener('click', function (e) {
            if (e.target === warningPopupModal) {
                warningPopupModal.classList.remove('visible');
                warningPopupModal.setAttribute('aria-hidden', 'true');
            }
        });
    }

    // ---- 時間帯別分析: 区切り変更で再描画 ----
    const timebandGranularity = document.getElementById('timeband-granularity');
    if (timebandGranularity) {
        timebandGranularity.addEventListener('change', function () {
            renderTimeBand(window.SalesExportData.filteredContent);
        });
    }

    // ---- ヘルプモーダル ----
    const helpButton = document.getElementById('help-button');
    const helpModal  = document.getElementById('help-modal');
    const helpClose  = document.getElementById('help-close');

    if (helpButton && helpModal) {
        helpButton.addEventListener('click', function () {
            helpModal.classList.add('visible');
            helpModal.setAttribute('aria-hidden', 'false');
        });
        helpClose.addEventListener('click', function () {
            helpModal.classList.remove('visible');
            helpModal.setAttribute('aria-hidden', 'true');
        });
        helpModal.addEventListener('click', function (e) {
            if (e.target === helpModal) {
                helpModal.classList.remove('visible');
                helpModal.setAttribute('aria-hidden', 'true');
            }
        });
    }

    // ---- 初期状態 ----
    resultSection.classList.remove('visible');
    uploadFormSection.classList.remove('hidden');
});