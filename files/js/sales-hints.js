// ======================================================
// sales-hints.js - 一部入金後解除の訂正ヒント（メイン・サブ共通）
//
// 一部入金後に解除すると、レジは残額を自動補填して会計完了扱いにする。
// 担当者が後で打ち消していることが多い（メイン: 戻品、サブ: 取引後訂正）。
// 同じ日の打ち消し会計を時刻順に見て、それより前の「同じ分類・同じ単価」の
// 解除会計へ、直前のものから順に個数を割り当てる
// （まとめて戻品した「60x -4」が複数の解除会計を打ち消す場合にも対応）。
// 単価まで見るのは、別の打ち間違いを戻した高額の戻品を誤って当てないため。
// 集計値は動かさず、警告に表示する手がかりだけを付ける。
//
// cancelled:  [{ txNo, date, seq, items: [{ category, unitPrice, qty }] }]
// correcting: [{ txNo, date, seq, category, unitPrice, qty, amount, kind }]
//   seq はトランザクションの通し番号（前後関係の判定用）、kind は表示名（戻品 / 取引後訂正）
// ======================================================

window.SalesCorrectionHints = {
    attach: function (cancelled, correcting) {
        const needs = []; // 解除会計の分類・単価ごとの未訂正個数
        for (const tx of cancelled) {
            tx.correction = { need: 0, covered: 0, returns: [] };
            for (const it of tx.items || []) {
                if (it.qty <= 0) continue;
                needs.push({ tx, category: it.category, unitPrice: it.unitPrice, rest: it.qty });
                tx.correction.need += it.unitPrice * it.qty;
            }
        }

        for (const r of correcting) {
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
                    n.tx.correction.returns.push({ txNo: r.txNo, amount: r.amount, kind: r.kind });
                }
            }
        }

        for (const tx of cancelled) {
            const c = tx.correction;
            c.status = c.covered === 0 ? 'none' : (c.covered >= c.need ? 'full' : 'partial');
        }
    },
};
