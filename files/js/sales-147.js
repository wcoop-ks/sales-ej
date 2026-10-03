// ======================================================
// sales-147.js - EJジャーナル分析 サブレジ固有設定
// 共通UI処理は sales.js に記述
// /common/ では window.SalesPageSub として登録し自動判定に使用
// ======================================================

window.SalesPageSub = {

    CACHE_CONTENT_KEY:  'wcoop.sales.b.journal.content',
    CACHE_FILENAME_KEY: 'wcoop.sales.b.journal.filename',

    CATEGORY_CLASS_MAP: {
        'グッズ': 'goods',
        'パン':   'bread',
        '井荻':   'iogi',
        '文具':   'stationery',
        '検定':   'exam',
        '飲料':   'drink',
    },

    CATEGORY_ORDER: null,

    // 信用売りキーの印字名（結果表・出力の行名に使う）
    CREDIT_LABEL: '信用',

    SKIP_KEYWORDS: ['両替', '*SDカード*', '日計', '電子ジャーナル'],

    // ---- ジャーナル解析・集計（トランザクションバッファ方式）----
    parseJournalContent: function (content, startDate, endDate) {
        const SKIP_KEYWORDS = this.SKIP_KEYWORDS;
        const lines         = content.split('\n');
        const categoryStats  = {};
        const paymentStats   = { cash: 0, credit: 0 };
        const everRegistered = new Set();

        let txLines = [];
        let txDate  = null;

        function parseDateFromLine(line) {
            const m = line.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
            if (!m) return null;
            return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
        }

        // スペース区切り数字を正規化: "\ 5 , 5 0 0" / "- 3 3 0" → 数値
        function parseSpacedAmount(str) {
            return parseInt(str.replace(/[\s\\¥,]/g, ''), 10) || 0;
        }

        function addToStats(category, price, qty) {
            if (!categoryStats[category]) categoryStats[category] = {};
            if (!categoryStats[category][price]) categoryStats[category][price] = 0;
            categoryStats[category][price] += qty;
            everRegistered.add(category);
        }

        function commitTransaction(txLines) {
            if (!txLines || txLines.length === 0) return;

            const txText = txLines.join('\n');

            if (txText.includes('解除機能により中止')) return;
            if (SKIP_KEYWORDS.some(kw => txText.includes(kw))) return;

            const sign = txText.includes('取引後訂正') ? -1 : 1;

            let prevQuantityLine = null;

            for (let rawLine of txLines) {
                const line = rawLine.trim();

                // 支払い行（取引後訂正はマイナス）
                const cashMatch   = line.match(/^現金\s+(.+)/);
                const otsuriMatch = line.match(/^おつり\s+(.+)/);
                const creditMatch = line.match(/^信用\s+(.+)/);
                if (cashMatch)   { paymentStats.cash   += parseSpacedAmount(cashMatch[1])   * sign; continue; }
                if (otsuriMatch) { paymentStats.cash   -= parseSpacedAmount(otsuriMatch[1]) * sign; continue; }
                if (creditMatch) { paymentStats.credit += parseSpacedAmount(creditMatch[1]) * sign; continue; }

                const qtyMatch = line.match(/^(\d+[,]?\d*)x\s*(\d+)/);
                if (qtyMatch) {
                    prevQuantityLine = {
                        unitPrice: parseInt(qtyMatch[1].replace(/,/g, ''), 10),
                        quantity:  parseInt(qtyMatch[2], 10),
                    };
                    continue;
                }

                const corrMatch = line.match(/^([^\s*]+)\s+内\s*訂-([\d,]+)/);
                if (corrMatch) {
                    addToStats(corrMatch[1], parseInt(corrMatch[2].replace(/,/g, ''), 10), -1);
                    continue;
                }

                const negMatch = line.match(/^([^\s*]+)\s+内.*-([\d,]+)/);
                if (negMatch) {
                    addToStats(negMatch[1], parseInt(negMatch[2].replace(/,/g, ''), 10), -1);
                    continue;
                }

                const normalMatch = line.match(/^([^\s*]+)\s+内\s*[\\¥]([\d,]+)/);
                if (normalMatch) {
                    const category = normalMatch[1];
                    const amount   = parseInt(normalMatch[2].replace(/,/g, ''), 10);

                    let price, qty;
                    if (prevQuantityLine) {
                        const { unitPrice, quantity } = prevQuantityLine;
                        if (unitPrice * quantity === amount) {
                            price = unitPrice;
                            qty   = quantity * sign;
                        } else {
                            price = amount;
                            qty   = 1 * sign;
                        }
                        prevQuantityLine = null;
                    } else {
                        price = amount;
                        qty   = 1 * sign;
                    }

                    addToStats(category, price, qty);
                    continue;
                }

                const corrFallback = line.match(/^訂\s*-([\d,]+)/);
                if (corrFallback) {
                    addToStats('訂', parseInt(corrFallback[1].replace(/,/g, ''), 10), -1);
                    continue;
                }

                if (!line.match(/^(\d+[,]?\d*)x\s*(\d+)/)) {
                    prevQuantityLine = null;
                }
            }
        }

        for (const rawLine of lines) {
            const line = rawLine.trim();

            const dateStr = parseDateFromLine(line);
            if (dateStr) {
                commitTransaction(txLines);

                if ((startDate && dateStr < startDate) ||
                    (endDate   && dateStr > endDate)) {
                    txDate  = null;
                    txLines = [];
                    continue;
                }

                txDate  = dateStr;
                txLines = [];
                continue;
            }

            if (txDate !== null) {
                txLines.push(line);
            }
        }

        commitTransaction(txLines);
        return { categoryStats, paymentStats, everRegistered };
    },
};

// /sub/ ページ向け: window.SalesPage としても登録
window.SalesPage = window.SalesPageSub;