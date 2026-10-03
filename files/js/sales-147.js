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
        const cancelledWithPayment = []; // 一部入金後に解除された会計（レジが残額を自動補填）
        const corrections          = []; // 取引後訂正の明細（訂正ヒント用）

        let txLines = [];
        let txDate  = null;
        let txSeq   = 0; // 範囲内トランザクションの通し番号（前後関係の判定用）

        function parseDateFromLine(line) {
            const m = line.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
            if (!m) return null;
            return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
        }

        // スペース区切り数字を正規化: "\ 5 , 5 0 0" / "- 3 3 0" → 数値
        function parseSpacedAmount(str) {
            return parseInt(str.replace(/[\s\\¥,]/g, ''), 10) || 0;
        }

        let txItems = []; // 現在のトランザクションの明細（分類・単価・個数）

        function addToStats(category, price, qty) {
            if (!categoryStats[category]) categoryStats[category] = {};
            if (!categoryStats[category][price]) categoryStats[category][price] = 0;
            categoryStats[category][price] += qty;
            everRegistered.add(category);
            txItems.push({ category, unitPrice: price, qty });
        }

        // 明細を分類・単価ごとにまとめる
        function groupItems(items) {
            const out = [];
            for (const it of items) {
                const g = out.find(x => x.category === it.category && x.unitPrice === it.unitPrice);
                if (g) g.qty += it.qty; else out.push(Object.assign({}, it));
            }
            return out.filter(x => x.qty !== 0);
        }

        function commitTransaction(txLines, date) {
            if (!txLines || txLines.length === 0) return;

            const txText = txLines.join('\n');

            if (SKIP_KEYWORDS.some(kw => txText.includes(kw))) return;

            // 解除機能により中止:
            //   入金なし（取消→合計0）は会計ごと捨てる。
            //   入金後の解除は、レジが残額を自動補填して会計完了扱いにするため
            //   レジ日計どおり計上し、二重計上の可能性を警告に出す（メインレジと同じ扱い）。
            const hasPayment = txLines.some(l => /^(現金|信用)\s/.test(l.trim()));
            const cancelled  = txText.includes('解除機能により中止');
            if (cancelled && !hasPayment) return;

            txSeq++;
            txItems = [];
            const txNoMatch = txText.match(/000000#(\d+)/);
            const txNo      = txNoMatch ? txNoMatch[1] : null;
            let   txPayment = 0;

            const sign = txText.includes('取引後訂正') ? -1 : 1;

            let prevQuantityLine = null;

            for (let rawLine of txLines) {
                const line = rawLine.trim();

                // 支払い行（取引後訂正はマイナス）
                const cashMatch   = line.match(/^現金\s+(.+)/);
                const otsuriMatch = line.match(/^おつり\s+(.+)/);
                const creditMatch = line.match(/^信用\s+(.+)/);
                if (cashMatch) {
                    const v = parseSpacedAmount(cashMatch[1]);
                    paymentStats.cash += v * sign;
                    txPayment += v;
                    continue;
                }
                if (otsuriMatch) { paymentStats.cash -= parseSpacedAmount(otsuriMatch[1]) * sign; continue; }
                if (creditMatch) {
                    const v = parseSpacedAmount(creditMatch[1]);
                    paymentStats.credit += v * sign;
                    txPayment += v;
                    continue;
                }

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

            const items = groupItems(txItems);
            if (cancelled) {
                cancelledWithPayment.push({ txNo, date, payment: txPayment, items, seq: txSeq });
            }
            if (sign === -1) {
                for (const it of items) {
                    if (it.qty >= 0) continue;
                    corrections.push({
                        seq: txSeq, date, txNo, category: it.category, unitPrice: it.unitPrice,
                        qty: -it.qty, amount: it.unitPrice * -it.qty, kind: '取引後訂正',
                    });
                }
            }
        }

        for (const rawLine of lines) {
            const line = rawLine.trim();

            const dateStr = parseDateFromLine(line);
            if (dateStr) {
                commitTransaction(txLines, txDate);

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

        commitTransaction(txLines, txDate);
        window.SalesCorrectionHints.attach(cancelledWithPayment, corrections);
        return { categoryStats, paymentStats, cancelledWithPayment, everRegistered };
    },
};

// /sub/ ページ向け: window.SalesPage としても登録
window.SalesPage = window.SalesPageSub;