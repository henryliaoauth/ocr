#!/usr/bin/env python3
"""
Generate synthetic financial-proof document images for testing the OCR workflow.

Styled to resemble the real Taiwan government / bank document examples shown on
Taishin's "身分/財力證明文件上傳教學" page: dense black-and-white official forms in
明體 (UMing), with a red 樣張 stamp, a faint diagonal watermark, footnotes (附註),
issuing authority + ROC (民國) dates; plus a Richart-style digital passbook and a
健保快易通 app-screenshot for the health-insurance record.

One coherent person per workflow category; all values & identities are FAKE and
every page carries a test-sample footer. Output: test/samples/<category>/.
"""

import os
import json
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "samples")
MING_PATH = "/usr/share/fonts/truetype/arphic/uming.ttc"   # AR PL UMing TW = index 2
SANS_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"

BLACK = (15, 15, 15)
GRAY = (90, 90, 90)
WM = (224, 224, 224)        # watermark light gray
RED = (196, 30, 38)
TEAL = (0, 138, 130)        # 健保 / Richart band
RICH = (227, 30, 70)        # Richart accent

_cache = {}


def MING(sz):
    k = ("m", sz)
    if k not in _cache:
        _cache[k] = ImageFont.truetype(MING_PATH, sz, index=2)
    return _cache[k]


def SANS(sz):
    k = ("s", sz)
    if k not in _cache:
        _cache[k] = ImageFont.truetype(SANS_PATH, sz, index=0)
    return _cache[k]


def roc(y, m, d):
    return f"{y - 1911}/{m:02d}/{d:02d}"


def _is_number(txt):
    s = txt.replace(",", "").replace(".", "").replace("-", "").strip()
    return s.isdigit() and s != ""


def center(d, cx, y, text, f, fill=BLACK):
    tw = d.textlength(text, font=f)
    d.text((cx - tw / 2, y), text, font=f, fill=fill)


def stamp(d, w):
    """Red 樣張 stamp, top-right corner."""
    x2, y1 = w - 40, 30
    x1, y2 = x2 - 150, y1 + 64
    for o in range(4):
        d.rectangle([x1 - o, y1 - o, x2 + o, y2 + o], outline=RED)
    d.text((x1 + 18, y1 + 6), "樣張", font=MING(44), fill=RED)


def watermark(img, text="樣張"):
    """Big faint diagonal watermark, drawn behind the content."""
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    f = MING(min(230, int(w * 0.32)))
    tw = ld.textlength(text, font=f)
    ld.text(((w - tw) / 2, h / 2 - 130), text, font=f, fill=WM + (255,))
    layer = layer.rotate(28, expand=False, resample=Image.BICUBIC)
    img.alpha_composite(layer)


def grid(d, x, y, cols, rows, col_w, row_h=38, fs=18, header=True, center_head=True):
    w = sum(col_w)
    yy = y
    f = MING(fs)
    if header:
        cx = x
        for i, c in enumerate(cols):
            if center_head:
                center(d, cx + col_w[i] / 2, yy + (row_h - fs) / 2 - 2, c, f)
            else:
                d.text((cx + 10, yy + (row_h - fs) / 2 - 2), c, font=f, fill=BLACK)
            cx += col_w[i]
        yy += row_h
    for row in rows:
        cx = x
        for i, cell in enumerate(row):
            txt = str(cell)
            ty = yy + (row_h - fs) / 2 - 2
            if i > 0 and _is_number(txt):
                tw = d.textlength(txt, font=f)
                d.text((cx + col_w[i] - 10 - tw, ty), txt, font=f, fill=BLACK)
            else:
                d.text((cx + 10, ty), txt, font=f, fill=BLACK)
            cx += col_w[i]
        yy += row_h
    n = len(rows) + (1 if header else 0)
    d.rectangle([x, y, x + w, y + n * row_h], outline=BLACK, width=1)
    cx = x
    for i in range(len(cols) - 1):
        cx += col_w[i]
        d.line([cx, y, cx, y + n * row_h], fill=BLACK, width=1)
    ly = y
    for _ in range(n + 1):
        d.line([x, ly, x + w, ly], fill=BLACK, width=1)
        ly += row_h
    return y + n * row_h


def field_row(d, x, y, pairs, f=None, lw=120, vw=200):
    f = f or MING(18)
    cx = x
    for label, val in pairs:
        d.text((cx, y), label, font=f, fill=GRAY)
        d.text((cx + lw, y), str(val), font=f, fill=BLACK)
        cx += lw + vw
    return y + 32


def footnotes(d, x, y, w, lines, head="附註："):
    fs = 13
    f = MING(fs)
    d.text((x, y), head, font=f, fill=GRAY)
    y += 20
    for ln in lines:
        d.text((x, y), ln, font=f, fill=GRAY)
        y += 18
    return y


def official(w, h, title_zh, title_en=None, wm="樣張"):
    img = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    watermark(img, wm)
    d = ImageDraw.Draw(img)
    cx = w / 2
    center(d, cx, 36, title_zh, MING(30))
    yt = 76
    if title_en:
        center(d, cx, yt, title_en, MING(16), fill=GRAY)
        yt += 26
    stamp(d, w)
    return img, d, yt + 8


def save(img, category, name):
    out = os.path.join(ROOT, category)
    os.makedirs(out, exist_ok=True)
    img = img.convert("RGB")
    w, h = img.size
    d = ImageDraw.Draw(img)
    d.text((40, h - 30),
           "※ 系統自動產生之測試樣本，數值與姓名均為虛構，僅供 OCR 測試，非真實財力證明。",
           font=SANS(15), fill=GRAY)
    path = os.path.join(out, name)
    img.save(path, "JPEG", quality=88)
    print("  wrote", os.path.relpath(path, ROOT))


def write_manifest(categories):
    # The frontend reads samples/manifest.json to build the per-category gallery.
    # It MUST be committed (and deployed) alongside the images, or the whole
    # "範例資料" section stays hidden on the live site. Regenerate it here from
    # the files actually on disk so it can never drift out of sync.
    def num_prefix(fn):
        m = re.match(r"(\d+)", fn)
        return int(m.group(1)) if m else 0

    manifest = {}
    for cat in categories:
        d = os.path.join(ROOT, cat)
        if not os.path.isdir(d):
            continue
        files = [f for f in os.listdir(d) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
        manifest[cat] = sorted(files, key=lambda f: (num_prefix(f), f))

    path = os.path.join(ROOT, "manifest.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("  wrote manifest.json", {k: len(v) for k, v in manifest.items()})


def passbook_richart(category, fname, period, holder, acct, branch, rows):
    """台新 Richart 數位存摺 transaction page (detail-2-2 style)."""
    w = 760
    h = 250 + len(rows) * 40 + 140
    img = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(img)
    d.text((40, 34), "Richart", font=SANS(38), fill=RICH)
    d.text((44, 78), "by Taishin Bank", font=SANS(14), fill=GRAY)
    bx1, by1 = w - 320, 36
    d.rectangle([bx1, by1, w - 40, by1 + 34], outline=RICH, width=2)
    d.text((bx1 + 12, by1 + 6), f"期間 {period}", font=SANS(18), fill=BLACK)
    cols = ["帳務日期", "摘要", "支出", "存入", "餘額"]
    cw = [150, 200, 130, 130, 0]
    cw[4] = w - 80 - sum(cw[:4])
    y = 140
    cx = 40
    for i, c in enumerate(cols):
        d.text((cx + 8, y), c, font=SANS(18), fill=GRAY)
        cx += cw[i]
    y += 30
    d.line([40, y, w - 40, y], fill=(220, 220, 220), width=1)
    y += 6
    for r in rows:
        cx = 40
        for i, cell in enumerate(r):
            txt = str(cell)
            if i >= 2 and _is_number(txt):
                tw = d.textlength(txt, font=SANS(17))
                d.text((cx + cw[i] - 14 - tw, y), txt, font=SANS(17), fill=BLACK)
            else:
                d.text((cx + 8, y), txt, font=SANS(17), fill=BLACK)
            cx += cw[i]
        y += 40
    y += 6
    d.rectangle([0, h - 118, w, h - 44], fill=TEAL)
    d.text((40, h - 106), f"戶名 {holder}", font=SANS(18), fill="white")
    d.text((40, h - 78), f"台新銀行 (812) ｜ {branch} 帳號 {acct}",
           font=SANS(18), fill="white")
    save(img, category, fname)


# ============================================================ 上班族 — 王小明
P1 = dict(name="王小明", idn="A12******7", emp="A100237", title="資深工程師",
          company="宏達創新科技股份有限公司", acct="0123-45-678901-2", branch="內湖分行 (0021)")


def s_payslip():
    """detail-4 style payslip with three boxed sub-tables."""
    w, h = 900, 760
    img = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    watermark(img, "樣張")
    d = ImageDraw.Draw(img)
    center(d, w / 2, 36, P1["company"], MING(30))
    center(d, w / 2, 78, "114 年 03 月薪資發放明細表", MING(24))
    stamp(d, w)
    field_row(d, 50, 130, [("姓名", P1["name"]), ("職位", P1["title"])], lw=70, vw=220)
    field_row(d, 50, 162, [("入帳帳號", P1["acct"]), ("發薪日期", roc(2025, 3, 5))], lw=90, vw=300)
    bw = 270
    boxes = [
        ("約定薪資結構", [("本薪", "62,000"), ("伙食津貼", "2,400"),
                          ("全勤獎金", "1,500"), ("職務津貼", "8,000")], "小計(A)", "73,900"),
        ("非固定支付項目", [("平日加班費", "4,260"), ("假日加班費", "0"),
                            ("休息日加班", "0"), ("", "")], "小計(B)", "4,260"),
        ("應代扣項目", [("勞保費", "1,234"), ("健保費", "1,420"),
                        ("勞退自提", "0"), ("所得稅", "1,000")], "小計(C)", "3,654"),
    ]
    x = 50
    top = 210
    for title, items, sub, subv in boxes:
        rows = [(k, v) for k, v in items] + [(sub, subv)]
        d.rectangle([x, top, x + bw, top + 36], outline=BLACK, width=1)
        center(d, x + bw / 2, top + 8, title, MING(18))
        grid(d, x, top + 36, ["項目", "金額"], rows, [bw - 110, 110], row_h=40, fs=17)
        x += bw + 15
    yb = top + 36 + 6 * 40  # title box (36) + header row + 5 data rows
    d.rectangle([w - 360, yb + 20, w - 50, yb + 60], outline=BLACK, width=1)
    d.text((w - 350, yb + 30), "實領金額 (A)+(B)-(C)", font=MING(18), fill=BLACK)
    d.text((w - 130, yb + 28), "74,506", font=MING(22), fill=BLACK)
    save(img, "salaried", "1_薪資單.jpg")


def s_passbook():
    passbook_richart("salaried", "2_薪資轉帳存摺.jpg",
                     f"{roc(2025,1,1)} ~ {roc(2025,3,31)}", P1["name"],
                     "0123-45-678901-2", P1["branch"],
                     [(roc(2025, 1, 5), "薪資轉帳", "", "74,506", "186,402"),
                      (roc(2025, 1, 20), "ATM提款", "10,000", "", "176,402"),
                      (roc(2025, 2, 5), "薪資轉帳", "", "74,506", "250,908"),
                      (roc(2025, 2, 18), "信用卡扣繳", "23,140", "", "227,768"),
                      (roc(2025, 3, 5), "薪資轉帳", "", "74,506", "302,274"),
                      (roc(2025, 3, 22), "轉帳支出", "15,000", "", "287,274")])


def s_withholding():
    """detail-3 style bilingual withholding statement."""
    w, h = 900, 620
    img, d, y = official(w, h, "各類所得扣繳暨免扣繳憑單",
                         "Withholding & Non-Withholding Tax Statement（電子申報專用）")
    y += 10
    grid(d, 50, y, ["扣繳單位統一編號", "稽徵機關", "製單編號", "格式代號"],
         [("53912345", "財政部臺北國稅局", "1140000288", "50 薪資")],
         [220, 220, 220, 140], row_h=42)
    y += 84 + 14
    grid(d, 50, y, ["所得人姓名", "所得人統一編號", "所得所屬年度"],
         [(P1["name"], P1["idn"], "113")], [260, 280, 260], row_h=42)
    y += 84 + 14
    grid(d, 50, y, ["所得人地址"],
         [("臺北市內湖區舊宗路二段 207 號 3 樓",)], [800], row_h=42, center_head=False)
    y += 84 + 14
    grid(d, 50, y, ["給付總額", "扣繳稅額", "給付淨額"],
         [("937,920", "12,000", "925,920")], [270, 265, 265], row_h=42)
    y += 84 + 20
    y = field_row(d, 50, y, [("扣繳單位名稱", P1["company"])], lw=130, vw=600)
    footnotes(d, 50, h - 110, w,
              ["一、本憑單所載給付總額應併入綜合所得總額辦理結算申報。",
               "二、所得格式代號：50 薪資所得。"])
    save(img, "salaried", "3_扣繳憑單.jpg")


def s_health():
    """健保快易通 app-screenshot style 投保紀錄查詢."""
    w, h = 600, 900
    img = Image.new("RGB", (w, h), (244, 248, 248))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 88], fill=TEAL)
    d.text((28, 22), "健保快易通 ｜ 投保紀錄查詢", font=SANS(24), fill="white")
    d.text((28, 56), "衛生福利部中央健康保險署", font=SANS(15), fill=(220, 240, 238))

    def card(y, rows, h2):
        d.rounded_rectangle([24, y, w - 24, y + h2], 14, fill="white",
                            outline=(220, 228, 228), width=1)
        yy = y + 18
        for k, v in rows:
            d.text((44, yy), k, font=SANS(17), fill=GRAY)
            tw = d.textlength(str(v), font=SANS(18))
            d.text((w - 44 - tw, yy), str(v), font=SANS(18), fill=BLACK)
            yy += 36
        return y + h2 + 18

    y = 116
    y = card(y, [("投保對象", P1["name"]), ("身分證號", P1["idn"]),
                 ("查詢期間", "近一年（截至 114/03/31）")], 150)
    d.text((36, y), "現職投保紀錄", font=SANS(18), fill=TEAL)
    y += 34
    y = card(y, [("投保單位", P1["company"]), ("投保身分", "本人 (受僱者)"),
                 ("加保生效日", roc(2019, 7, 1)), ("最近薪調日期", roc(2024, 1, 1)),
                 ("投保金額", "45,800")], 230)
    d.rounded_rectangle([24, y, w - 24, y + 70], 12, fill=(232, 246, 244))
    d.text((44, y + 14), "● 投保金額達 29,500 元以上，", font=SANS(17), fill=TEAL)
    d.text((44, y + 40), "   且為本人投保於現職公司。", font=SANS(17), fill=TEAL)
    save(img, "salaried", "4_健保投保資料.jpg")


def s_labor():
    """detail-5 style 勞保投保資料表(明細)."""
    w, h = 900, 720
    img, d, y = official(w, h, "勞工保險被保險人投保資料表（明細）", wm="樣本")
    y += 6
    y = field_row(d, 50, y, [("姓名", P1["name"]), ("身分證號", P1["idn"])], lw=70, vw=300)
    y = field_row(d, 50, y, [("出生日期", "民國 78 年 10 月"), ("頁次", "1 / 1")], lw=80, vw=300)
    y += 10
    grid(d, 50, y, ["保險證號", "投保單位名稱", "投保薪資", "生效日期", "退保日期"],
         [("05103455H", "宏達創新科技股份有限公司", "45,800", roc(2019, 7, 1), ""),
          ("05103455H", "（調薪）", "45,800", roc(2022, 1, 1), ""),
          ("05103455H", "（在保中）", "45,800", roc(2025, 3, 31), "")],
         [170, 320, 130, 140, 140], row_h=40)
    d.text((w / 2 - 150, h - 150), "勞動部勞工保險局　製發", font=MING(26), fill=GRAY)
    save(img, "salaried", "5_勞保異動明細.jpg")


# ====================================================== 自營商/負責人 — 陳大華
P2 = dict(name="陳大華", idn="B22******5", company="大華實業有限公司",
          uni="24681357", acct="2233-44-556677-8", branch="松山分行 (0035)")


def e_income_list():
    """detail-1 style 綜合所得稅各類所得資料清單."""
    w, h = 980, 820
    img, d, y = official(w, h, "113 年度綜合所得稅各類所得資料清單")
    y += 4
    y = field_row(d, 50, y, [("核發單位", "財政部臺北國稅局"), ("查調日期", roc(2025, 4, 1))],
              lw=90, vw=340)
    y = field_row(d, 50, y, [("納稅義務人", P2["name"]), ("統一編號", P2["idn"])],
                  lw=100, vw=340)
    y += 8
    y = grid(d, 50, y, ["所得格式", "所得類別", "扣繳單位名稱", "給付總額", "扣繳稅額", "可扣抵稅額"],
             [("87", "營利所得", "大華實業有限公司", "1,200,000", "0", "0"),
              ("50", "薪資所得", "大華實業有限公司", "600,000", "0", "0"),
              ("5A", "利息所得", "台新國際商業銀行", "35,600", "0", "0")],
             [110, 130, 280, 160, 110, 110], row_h=40)
    y += 8
    grid(d, 50, y, ["", "所得總額合計", "扣繳稅額合計"],
         [("共 3 筆", "1,835,600", "0")], [320, 280, 280], row_h=40, header=False)
    footnotes(d, 50, h - 130, w,
              ["一、本清單係由各扣繳單位申報之資料彙整，僅供參考。",
               "二、所得格式：50 薪資、87 營利、5A 利息。",
               "三、清單所列資料，請依個人資料保護法規定使用。"])
    save(img, "self_employed", "1_綜合所得清單.jpg")


def e_time_deposit():
    """Bank time-deposit certificate."""
    w, h = 900, 560
    img, d, y = official(w, h, "定期存款存單", "Time Deposit Certificate",
                         wm="存單")
    y += 16
    grid(d, 50, y, ["存款人", "帳號", "存單號碼"],
         [(P2["name"], P2["acct"], "TD-2024-008812")], [260, 280, 260], row_h=42)
    y += 84 + 12
    grid(d, 50, y, ["存單種類", "存入日期", "到期日期", "存款期間", "年利率"],
         [("整存整付", roc(2024, 9, 15), roc(2025, 9, 15), "12 個月", "1.78%")],
         [180, 170, 170, 140, 140], row_h=42)
    y += 84 + 20
    d.rectangle([50, y, 850, y + 56], outline=BLACK, width=1)
    d.text((66, y + 14), "存款本金 NT$", font=MING(22), fill=BLACK)
    d.text((300, y + 12), "2,000,000", font=MING(26), fill=BLACK)
    d.text((560, y + 16), "台新國際商業銀行　" + P2["branch"], font=MING(18), fill=GRAY)
    save(img, "self_employed", "2_定期存款.jpg")


def passbook_paper(category, fname, holder, acct, branch, rows, wm="存摺"):
    """Traditional paper passbook inner page (ruled, B&W)."""
    w, h = 900, 220 + len(rows) * 40 + 120
    img, d, y = official(w, h, "存款存摺交易明細", wm=wm)
    y += 6
    y = field_row(d, 50, y, [("戶名", holder), ("帳號", acct)], lw=60, vw=320)
    y = field_row(d, 50, y, [("銀行／分行", "台新銀行　" + branch), ("幣別", "新臺幣")],
                  lw=110, vw=360)
    y += 8
    grid(d, 50, y, ["交易日期", "摘要", "支出", "存入", "結餘"], rows,
         [160, 240, 150, 150, 100], row_h=40)
    save(img, category, fname)


def e_passbook():
    passbook_paper("self_employed", "3_存款存摺明細.jpg", P2["name"], P2["acct"], P2["branch"],
                   [(roc(2024, 10, 10), "貨款匯入", "", "320,000", "1,420,000"),
                    (roc(2024, 11, 15), "貨款匯入", "", "280,000", "1,700,000"),
                    (roc(2024, 12, 20), "進貨支出", "210,000", "", "1,490,000"),
                    (roc(2025, 1, 12), "貨款匯入", "", "350,000", "1,840,000"),
                    (roc(2025, 2, 18), "稅款繳納", "120,000", "", "1,720,000"),
                    (roc(2025, 3, 25), "貨款匯入", "", "200,000", "1,920,000")])


def e_realestate():
    """detail-8 style 建物登記謄本."""
    w, h = 900, 720
    img, d, y = official(w, h, "建物登記（簿）謄本", "Building Registration Transcript",
                         wm="謄本")
    y += 8
    y = field_row(d, 50, y, [("登記機關", "臺北市內湖地政事務所"), ("列印日期", roc(2025, 3, 20))],
              lw=90, vw=340)
    y += 8
    grid(d, 50, y, ["建物標示", "內容"],
         [("建號", "內湖區○○段 123 建號"),
          ("基地坐落", "內湖區○○段 45 地號"),
          ("建物門牌", "臺北市內湖區舊宗路二段 207 號 3 樓"),
          ("主建物面積", "98.52 平方公尺"),
          ("層次／用途", "三層／住家用"),
          ("建築完成日期", "民國 105 年 05 月")],
         [220, 580], row_h=44, center_head=False)
    y += 7 * 44 + 14
    grid(d, 50, y, ["所有權人", "權利範圍", "登記日期", "登記原因"],
         [(P2["name"], "所有權全部", roc(2016, 5, 20), "買賣")],
         [220, 220, 200, 160], row_h=44)
    save(img, "self_employed", "4_不動產權狀.jpg")


def e_house_tax():
    w, h = 900, 560
    img, d, y = official(w, h, "房屋稅繳款書", "House Tax Payment Notice", wm="稅單")
    y += 12
    grid(d, 50, y, ["納稅義務人", "稅籍編號", "課稅所屬期間"],
         [(P2["name"], "00112233445", "113 年期")], [260, 280, 260], row_h=42)
    y += 84 + 12
    grid(d, 50, y, ["房屋坐落", "課稅現值", "本期應納稅額"],
         [("內湖區舊宗路二段 207 號 3 樓", "1,860,000", "18,600")],
         [420, 190, 190], row_h=42, center_head=False)
    y += 84 + 20
    d.text((50, y), "繳納期限：114 年 05 月 31 日　　承辦：臺北市稅捐稽徵處",
           font=MING(18), fill=GRAY)
    save(img, "self_employed", "5_房屋稅單.jpg")


def e_business_tax():
    """detail-10 style 401 form."""
    w, h = 980, 700
    img, d, y = official(w, h, "營業人銷售額與稅額申報書（401）",
                         "（一般稅額計算－專營應稅營業人使用）")
    y += 8
    y = field_row(d, 50, y, [("營業人名稱", P2["company"]), ("負責人", P2["name"])],
              lw=110, vw=380)
    y = field_row(d, 50, y, [("統一編號", P2["uni"]), ("稅籍編號", "00112233"),
                                 ("所屬期", "114年01-02月")], lw=90, vw=230)
    y += 10
    y = grid(d, 50, y, ["項目", "銷售額", "稅額"],
             [("應稅 (1)", "3,250,000", "162,500"),
              ("零稅率 (3)", "0", "0"),
              ("進項可扣抵 (5)", "3,000,000", "150,100"),
              ("本期應納稅額 (售-進)", "", "12,400")],
             [380, 250, 250], row_h=42, center_head=False)
    y += 24
    d.rectangle([w - 360, y, w - 50, y + 70], outline=RED, width=2)
    d.text((w - 348, y + 12), "401/403 稅單需有", font=SANS(18), fill=RED)
    d.text((w - 348, y + 40), "國稅局申報收件章", font=SANS(18), fill=RED)
    save(img, "self_employed", "6_營業稅401.jpg")


def e_property_list():
    """detail-7 style 全國財產稅總歸戶財產查詢清單."""
    w, h = 980, 820
    img, d, y = official(w, h, "全國財產稅總歸戶財產查詢清單")
    y += 4
    y = field_row(d, 50, y, [("核發單位", "財政部臺北國稅局"), ("公文文號", "1140611-5291")],
              lw=90, vw=360)
    y = field_row(d, 50, y, [("財產申請人", P2["name"]), ("統一編號", P2["idn"]),
                                 ("查詢別", "個人")], lw=110, vw=220)
    y += 10
    y = grid(d, 50, y, ["財產別", "標示／坐落", "權利範圍", "持分", "課稅現值／價值"],
             [("土地", "內湖區○○段 45 地號", "全部", "1/1", "6,800,000"),
              ("房屋", "舊宗路二段 207 號 3 樓", "全部", "1/1", "1,860,000"),
              ("投資", "大華實業有限公司 股權", "—", "—", "3,000,000"),
              ("汽車", "自用小客車 1 輛", "全部", "1/1", "840,000")],
             [110, 360, 130, 110, 200], row_h=42)
    y += 8
    grid(d, 50, y, ["", "財產總額合計"], [("以下空白", "12,500,000")],
         [560, 360], row_h=42, header=False)
    footnotes(d, 50, h - 120, w,
              ["一、本清單資料係由各稽徵機關、地政機關提供建檔，僅供參考。",
               "二、本清單所列資料，請依稅捐稽徵法第 33 條及個人資料保護法規定使用。",
               f"中華民國 114 年 06 月 11 日"])
    save(img, "self_employed", "7_財產清單.jpg")


# ===================================================== 家管/退休/自由業 — 林秀琴
P3 = dict(name="林秀琴", idn="C20******3", acct="5566-77-889900-1", branch="板橋分行 (0048)")


def h_pension():
    passbook_richart("homemaker", "1_退休金轉帳.jpg",
                     f"{roc(2024,10,1)} ~ {roc(2025,3,31)}", P3["name"],
                     "5566-77-889900-1", P3["branch"],
                     [(roc(2024, 10, 1), "月退休金", "", "42,300", "612,300"),
                      (roc(2024, 11, 1), "月退休金", "", "42,300", "598,600"),
                      (roc(2024, 12, 1), "月退休金", "", "42,300", "640,900"),
                      (roc(2025, 1, 1), "月退休金", "", "42,300", "655,200"),
                      (roc(2025, 2, 1), "月退休金", "", "42,300", "690,500"),
                      (roc(2025, 3, 1), "月退休金", "", "42,300", "712,800")])


def h_time_deposit():
    w, h = 900, 560
    img, d, y = official(w, h, "定期存款存單", "Time Deposit Certificate", wm="存單")
    y += 16
    grid(d, 50, y, ["存款人", "帳號", "存單號碼"],
         [(P3["name"], P3["acct"], "TD-2024-114520")], [260, 280, 260], row_h=42)
    y += 84 + 12
    grid(d, 50, y, ["存單種類", "存入日期", "到期日期", "存款期間", "年利率"],
         [("整存整付", roc(2024, 6, 20), roc(2025, 6, 20), "12 個月", "1.78%")],
         [180, 170, 170, 140, 140], row_h=42)
    y += 84 + 20
    d.rectangle([50, y, 850, y + 56], outline=BLACK, width=1)
    d.text((66, y + 14), "存款本金 NT$", font=MING(22), fill=BLACK)
    d.text((300, y + 12), "1,500,000", font=MING(26), fill=BLACK)
    d.text((560, y + 16), "台新國際商業銀行　" + P3["branch"], font=MING(18), fill=GRAY)
    save(img, "homemaker", "2_定期存款.jpg")


def h_passbook():
    passbook_paper("homemaker", "3_存款存摺明細.jpg", P3["name"], P3["acct"], P3["branch"],
                   [(roc(2024, 10, 5), "利息收入", "", "3,200", "861,200"),
                    (roc(2024, 11, 10), "水電費扣繳", "4,800", "", "856,400"),
                    (roc(2024, 12, 1), "退休金轉入", "", "42,300", "898,700"),
                    (roc(2025, 1, 15), "生活費提領", "30,000", "", "868,700"),
                    (roc(2025, 2, 20), "股利匯入", "", "26,500", "895,200"),
                    (roc(2025, 3, 18), "保費扣繳", "15,200", "", "880,000")])


def h_funds():
    """台新財富管理 對帳單."""
    w, h = 900, 620
    img, d, y = official(w, h, "基金 / 財富管理對帳單",
                         "台新銀行財富管理 ・ 對帳單期間 " + roc(2025, 1, 1) + " ~ " + roc(2025, 3, 31),
                         wm="對帳單")
    y += 8
    y = field_row(d, 50, y, [("客戶姓名", P3["name"]), ("理財帳號", P3["acct"])], lw=90, vw=340)
    y += 12
    y = grid(d, 50, y, ["基金名稱", "持有單位", "參考淨值", "參考市值"],
             [("台新 ABC 全球股票基金", "12,500.00", "18.42", "230,250"),
              ("台新 DEF 亞洲債券基金", "30,000.00", "11.05", "331,500"),
              ("台新 GHI 平衡組合基金", "45,800.00", "15.03", "688,374")],
             [340, 180, 150, 130], row_h=42)
    y += 8
    grid(d, 50, y, ["", "投資組合總市值"], [("合計", "1,250,124")],
         [620, 180], row_h=42, header=False)
    save(img, "homemaker", "4_基金對帳單.jpg")


def h_realestate():
    w, h = 900, 700
    img, d, y = official(w, h, "建物登記（簿）謄本", "Building Registration Transcript",
                         wm="謄本")
    y += 8
    y = field_row(d, 50, y, [("登記機關", "新北市板橋地政事務所"), ("列印日期", roc(2025, 3, 18))],
              lw=90, vw=340)
    y += 8
    grid(d, 50, y, ["建物標示", "內容"],
         [("建號", "板橋區○○段 678 建號"),
          ("基地坐落", "板橋區○○段 90 地號"),
          ("建物門牌", "新北市板橋區文化路一段 100 號 8 樓"),
          ("主建物面積", "76.30 平方公尺"),
          ("層次／用途", "八層／住家用")],
         [220, 580], row_h=44, center_head=False)
    y += 6 * 44 + 14
    grid(d, 50, y, ["所有權人", "權利範圍", "登記日期"],
         [(P3["name"], "所有權全部", roc(2010, 8, 12))],
         [280, 280, 240], row_h=44)
    save(img, "homemaker", "5_不動產權狀.jpg")


def h_income_list():
    w, h = 980, 720
    img, d, y = official(w, h, "113 年度綜合所得稅各類所得資料清單")
    y += 4
    y = field_row(d, 50, y, [("核發單位", "財政部臺北國稅局"), ("查調日期", roc(2025, 4, 1))],
              lw=90, vw=340)
    y = field_row(d, 50, y, [("納稅義務人", P3["name"]), ("統一編號", P3["idn"])],
                  lw=100, vw=340)
    y += 8
    y = grid(d, 50, y, ["所得格式", "所得類別", "扣繳單位名稱", "給付總額", "扣繳稅額"],
             [("71", "退職所得", "公務人員退休撫卹基金", "507,600", "0"),
              ("5A", "利息所得", "台新國際商業銀行", "12,800", "0")],
             [120, 140, 320, 180, 140], row_h=40)
    y += 8
    grid(d, 50, y, ["", "所得總額合計"], [("共 2 筆", "520,400")],
         [620, 280], row_h=40, header=False)
    footnotes(d, 50, h - 110, w,
              ["一、本清單係由各扣繳單位申報之資料彙整，僅供參考。",
               "二、所得格式：71 退職所得、5A 利息所得。"])
    save(img, "homemaker", "6_綜合所得清單.jpg")


if __name__ == "__main__":
    print("上班族 (salaried) — 王小明")
    s_payslip(); s_passbook(); s_withholding(); s_health(); s_labor()
    print("自營商/負責人 (self_employed) — 陳大華")
    e_income_list(); e_time_deposit(); e_passbook(); e_realestate()
    e_house_tax(); e_business_tax(); e_property_list()
    print("家管/退休/自由業 (homemaker) — 林秀琴")
    h_pension(); h_time_deposit(); h_passbook(); h_funds()
    h_realestate(); h_income_list()
    write_manifest(["salaried", "self_employed", "homemaker"])
    print("done ->", ROOT)
