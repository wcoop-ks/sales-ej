// ======================================================
// sales-207.js - EJジャーナル分析 メインレジ固有設定
// 共通UI処理は sales.js に記述
// /common/ では window.SalesPageMain として登録し自動判定に使用
// ======================================================

window.SalesPageMain = {

    CACHE_CONTENT_KEY:  'wcoop.sales.a.journal.content',
    CACHE_FILENAME_KEY: 'wcoop.sales.a.journal.filename',

    CATEGORY_CLASS_MAP: {
        'グッズ': 'goods',
        'パン':   'bread',
        '飲料':   'drink',
        '井荻':   'iogi',
        '文具':   'stationery',
        '検定':   'exam',
        '教科書': 'text',
        '副教材': 'supplement',
    },

    CATEGORY_ORDER: ['グッズ', '井荻', '文具', 'パン', '飲料', '教科書', '副教材', '検定'],

    // 信用売りキーの印字名（結果表・出力の行名に使う）
    CREDIT_LABEL: 'クレジット',

    SKIP_KEYWORDS: ['両替', '*SDカード*', '日計', '電子ジャーナル'],

    // ---- ジャーナル解析・集計（pending record方式）----
    parseJournalContent: function (content, startDate, endDate) {
        const SKIP_KEYWORDS = this.SKIP_KEYWORDS;
        const lines         = content.split('\n');
        const categoryStats        = {};
        const paymentStats         = { cash: 0, credit: 0 };
        const cancelledWithPayment = [];
        const everRegistered       = new Set(); // 一度でも登録されたカテゴリ // 一部入金後に解除されたトランザクション

        let currentDate      = null;
        let prevQuantityLine = null;
        let pendingRecord    = null;
        let txSnapshot       = null;
        let currentTxNo      = null; // 現在のトランザクション番号
        let currentTxDate    = null; // 現在のトランザクション日付
        let txHasPayment     = false; // 現在のトランザクションに入金があるか
        let txPaymentAmount  = 0;    // 現在のトランザクションの入金額
        let txSeq            = 0;    // 範囲内トランザクションの通し番号（前後関係の判定用）
        let txReturns        = [];   // 現在のトランザクションの戻品
        const returns        = [];   // 確定した戻品（一部入金後解除の訂正ヒント用）

        // スペース区切り数字を正規化: "\ 6 , 6 0 0" / "\100" / "\\4,000" → 数値
        function parseSpacedAmount(str) {
            return parseInt(str.replace(/[\s\\¥,]/g, ''), 10) || 0;
        }

        function parseDateFromLine(line) {
            const m = line.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
            if (!m) return null;
            return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
        }

        function snapshotStats() {
            // categoryStats と paymentStats のディープコピーを保存
            const snap = {};
            for (const cat in categoryStats) {
                snap[cat] = Object.assign({}, categoryStats[cat]);
            }
            txSnapshot = { categoryStats: snap, paymentStats: Object.assign({}, paymentStats) };
        }

        function rollbackStats() {
            // スナップショット時点に戻す
            if (!txSnapshot) return;
            for (const cat in categoryStats) {
                delete categoryStats[cat];
            }
            for (const cat in txSnapshot.categoryStats) {
                categoryStats[cat] = Object.assign({}, txSnapshot.categoryStats[cat]);
            }
            paymentStats.cash   = txSnapshot.paymentStats.cash;
            paymentStats.credit = txSnapshot.paymentStats.credit;
            txSnapshot = null;
        }

        function commitPending() {
            if (!pendingRecord) return;
            const { category, unitPrice, quantity } = pendingRecord;
            if (!categoryStats[category]) categoryStats[category] = {};
            if (!categoryStats[category][unitPrice]) categoryStats[category][unitPrice] = 0;
            categoryStats[category][unitPrice] += quantity;
            everRegistered.add(category);
            pendingRecord = null;
        }

        for (let rawLine of lines) {
            const line = rawLine.trim();

            // 解除機能により中止
            if (line.includes('解除機能により中止')) {
                if (txHasPayment) {
                    // 一部入金後解除（真phantom）: XE-A207は残額を自動補填して会計完了扱いに
                    // するため、レジ日計には売上・入金として計上される。ツールでもロールバック
                    // せずそのまま計上し、二重計上の可能性を警告で知らせる。
                    commitPending(); // 最後の保留商品を確定

                    // 警告用の内訳（分類・単価・個数）をスナップショット差分から算出
                    const items = [];
                    if (txSnapshot) {
                        for (const cat in categoryStats) {
                            const snap = txSnapshot.categoryStats[cat] || {};
                            for (const price in categoryStats[cat]) {
                                const qty = categoryStats[cat][price] - (snap[price] || 0);
                                if (qty !== 0) {
                                    items.push({ category: cat, unitPrice: Number(price), qty });
                                }
                            }
                        }
                    }

                    cancelledWithPayment.push({
                        txNo:    currentTxNo,
                        date:    currentTxDate,
                        payment: txPaymentAmount,
                        items:   items,
                        seq:     txSeq,
                    });

                    txSnapshot = null; // ロールバックせずスナップショットのみ破棄
                } else {
                    // 通常の解除（入金なし・合計0）: 従来どおり開始時点にロールバック
                    pendingRecord = null;
                    rollbackStats();
                    txReturns = [];
                }

                pendingRecord    = null;
                prevQuantityLine = null;
                currentDate      = null;
                txHasPayment     = false;
                txPaymentAmount  = 0;
                continue;
            }

            // 日付行
            const dateStr = parseDateFromLine(line);
            if (dateStr) {
                commitPending();
                prevQuantityLine = null;
                txHasPayment     = false;
                txPaymentAmount  = 0;
                returns.push(...txReturns);
                txReturns = [];

                if (startDate && dateStr < startDate) { currentDate = null; txSnapshot = null; continue; }
                if (endDate   && dateStr > endDate)   { currentDate = null; txSnapshot = null; continue; }

                currentDate     = dateStr;
                currentTxDate   = dateStr;
                txSeq++;
                snapshotStats();
                continue;
            }

            // トランザクション番号行: "000000#1062       永見"
            const txNoMatch = line.match(/^000000#(\d+)/);
            if (txNoMatch) {
                currentTxNo = txNoMatch[1];
                continue;
            }

            // 有効な日付範囲外
            if (!currentDate) {
                commitPending();
                prevQuantityLine = null;
                continue;
            }

            // スキップキーワード
            if (SKIP_KEYWORDS.some(kw => line.includes(kw))) {
                commitPending();
                currentDate      = null;
                prevQuantityLine = null;
                continue;
            }

            // 数量行: "11x 3" / "3,700x 2" / "66x -2"
            const qtyMatch = line.match(/^(\d+[,]?\d*)x\s*(-?\d+)/);
            if (qtyMatch) {
                commitPending();
                prevQuantityLine = {
                    unitPrice: parseInt(qtyMatch[1].replace(/,/g, ''), 10),
                    quantity:  parseInt(qtyMatch[2], 10),
                };
                continue;
            }

            // カテゴリ行（通常）: "グッズ    内 \160" / "グッズ    内 ¥160"
            const normalMatch = line.match(/^([^\s*]+)\s+内\s*[\\¥]([\d,]+)/);
            if (normalMatch) {
                commitPending();
                const category = normalMatch[1];
                const amount   = parseInt(normalMatch[2].replace(/,/g, ''), 10);

                if (prevQuantityLine) {
                    const { unitPrice, quantity } = prevQuantityLine;
                    if (unitPrice * quantity === amount) {
                        pendingRecord = { category, unitPrice, quantity };
                    } else {
                        pendingRecord = { category, unitPrice: amount, quantity: 1 };
                    }
                    prevQuantityLine = null;
                } else {
                    pendingRecord = { category, unitPrice: amount, quantity: 1 };
                }
                continue;
            }

            // カテゴリ行（戻品）: "飲料    内戻-500" / "66x -2" + "文具    内 戻-132"
            const returnMatch = line.match(/^([^\s*]+)\s+内\s*戻-([\d,]+)/);
            if (returnMatch) {
                commitPending();
                const category = returnMatch[1];
                const amount   = parseInt(returnMatch[2].replace(/,/g, ''), 10);

                if (prevQuantityLine) {
                    const { unitPrice, quantity } = prevQuantityLine;
                    if (unitPrice * Math.abs(quantity) === amount) {
                        pendingRecord = { category, unitPrice, quantity };
                    } else {
                        pendingRecord = { category, unitPrice: amount, quantity: -1 };
                    }
                    prevQuantityLine = null;
                } else {
                    pendingRecord = { category, unitPrice: amount, quantity: -1 };
                }
                txReturns.push({
                    seq: txSeq, date: currentDate, txNo: currentTxNo, category, amount,
                    unitPrice: pendingRecord.unitPrice, qty: Math.abs(pendingRecord.quantity),
                });
                continue;
            }

            // 訂正行（カテゴリ付き）: "XXX 内 訂-120"
            const corrMatch = line.match(/^([^\s*]+)\s+内\s*訂-([\d,]+)/);
            if (corrMatch) {
                commitPending();
                pendingRecord = {
                    category:  corrMatch[1],
                    unitPrice: parseInt(corrMatch[2].replace(/,/g, ''), 10),
                    quantity:  -1,
                };
                prevQuantityLine = null;
                continue;
            }

            // 訂正行（カテゴリなし）: "訂 -120"
            const corrFallback = line.match(/^訂\s*-([\d,]+)/);
            if (corrFallback) {
                commitPending();
                pendingRecord = {
                    category:  '訂',
                    unitPrice: parseInt(corrFallback[1].replace(/,/g, ''), 10),
                    quantity:  -1,
                };
                prevQuantityLine = null;
                continue;
            }

            // それ以外: 数量行でなければ prevQuantityLine をリセット
            if (!line.match(/^(\d+[,]?\d*)x\s*(-?\d+)/)) {
                prevQuantityLine = null;
            }

            // 現金・おつり・クレジット行（スペース区切り数字・\\区切りに対応）
            const cashMatch   = line.match(/^現金\s+(.+)/);
            const otsriMatch  = line.match(/^おつり\s+(.+)/);
            const creditMatch = line.match(/^クレジット\s+(.+)/);

            if (cashMatch) {
                const v = parseSpacedAmount(cashMatch[1]);
                paymentStats.cash   += v;
                txHasPayment    = true;
                txPaymentAmount += v;
            }
            if (otsriMatch)  paymentStats.cash   -= parseSpacedAmount(otsriMatch[1]);
            if (creditMatch) {
                const v = parseSpacedAmount(creditMatch[1]);
                paymentStats.credit += v;
                txHasPayment    = true;
                txPaymentAmount += v;
            }
        }

        commitPending();
        returns.push(...txReturns);
        attachCorrectionHints(cancelledWithPayment, returns);
        return { categoryStats, paymentStats, cancelledWithPayment, everRegistered };

        // ---- 一部入金後解除の訂正ヒント ----
        // 担当者が後で戻品して打ち消していることが多い。同じ日の戻品を時刻順に見て、
        // それより前の「同じ分類・同じ単価」の解除会計へ、直前のものから順に個数を割り当てる
        // （まとめて戻品した「60x -4」が複数の解除会計を打ち消す場合にも対応）。
        // 単価まで見るのは、別の打ち間違いを戻した高額の戻品を誤って当てないため。
        // 集計値は動かさず、警告に表示する手がかりだけを付ける。
        function attachCorrectionHints(cancelled, returnList) {
            const needs = []; // 解除会計の分類・単価ごとの未訂正個数
            for (const tx of cancelled) {
                tx.correction = { need: 0, covered: 0, returns: [] };
                for (const it of tx.items || []) {
                    if (it.qty <= 0) continue;
                    needs.push({ tx, category: it.category, unitPrice: it.unitPrice, rest: it.qty });
                    tx.correction.need += it.unitPrice * it.qty;
                }
            }

            for (const r of returnList) {
                let left = r.qty;
                const targets = needs
                    .filter(n => n.tx.date === r.date && n.tx.seq < r.seq && n.rest > 0 &&
                                 n.category === r.category && n.unitPrice === r.unitPrice)
                    .sort((a, b) => b.tx.seq - a.tx.seq);
                for (const n of targets) {
                    if (left <= 0) break;
                    const use = Math.min(left, n.rest);
                    n.rest -= use;
                    left   -= use;
                    n.tx.correction.covered += use * n.unitPrice;
                    if (!n.tx.correction.returns.some(x => x.txNo === r.txNo)) {
                        n.tx.correction.returns.push({ txNo: r.txNo, amount: r.amount });
                    }
                }
            }

            for (const tx of cancelled) {
                const c = tx.correction;
                c.status = c.covered === 0 ? 'none' : (c.covered >= c.need ? 'full' : 'partial');
            }
        }
    },
};

// /main/ ページ向け: window.SalesPage としても登録
window.SalesPage = window.SalesPageMain;