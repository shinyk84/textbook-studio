"""교육과정 사양을 받아 교과서·지도서 구조(단원·차시·쪽수)를 제안한다.

근거는 docs/structure-analysis/book_structure_baselines.json에 모은 2015·2022 개정
초등 체육 교과서·지도서 실측값이다. 결과는 편집자가 최종 판단할 출발점이며,
각 수치에 실측 범위(최소~최대)를 함께 낸다.

사용 예:
  python scripts/propose_book_structure.py --spec spec.json
  python scripts/propose_book_structure.py --rev 2022 --band 3-4
  python scripts/propose_book_structure.py --backtest
"""

import argparse
import json
import math
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINES = ROOT / "docs" / "structure-analysis" / "book_structure_baselines.json"

# 새 유형이 실측에 없을 때 비슷한 유형의 평균으로 대신한다.
TYPE_FALLBACK = {
    "sport": ["skill", "game"],
    "skill": ["sport"],
    "game": ["sport"],
    "health": ["fitness"],
    "fitness": ["health"],
    "ecology": ["sport"],
    "safety": ["fitness"],
}

GUIDE_GENERAL_PAGES = (40, 50, 60)  # 지도서 총론 쪽수(최소, 기본, 최대) 실측 범위
GUIDE_RATIO = (1.8, 2.1, 2.4)  # 지도서 각론 쪽 / 교과서 본문 쪽
UNIT_FIXED_PAGES = 4  # 대단원 도입 2쪽 + 마무리 2쪽(실측 최소 구성)


def load_baselines(path=BASELINES):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def band_of(grade):
    return "3-4" if grade <= 4 else "5-6"


CORE_TYPES = {"sport", "skill", "game"}  # 남는 차시를 흡수하는 실기 중심 영역
MODELS = ("blend", "share", "anchor")


def calibrate(data, revs):
    """유형별 강도(차시 비중 / 성취기준 비중), 성취기준당 차시, 차시당 쪽수를 실측에서 구한다."""
    intensity, per_standard, pages_per_chasi = {}, {}, {}
    for book in data["books"]:
        if book["rev"] not in revs:
            continue
        cur = data["curricula"][book["rev"]]
        band = band_of(book["grade"])
        types = {a["key"]: a["type"] for a in cur["areas"]}
        std = {a["key"]: a["standards"][band] for a in cur["areas"]}
        std_total = sum(std.values())
        area_units = [u for u in book["units"] if u[0] in types]
        chasi_total = sum(u[1] for u in area_units if u[1])
        for key, chasi, pages in area_units:
            t = types[key]
            if chasi:
                intensity.setdefault(t, []).append((chasi / chasi_total) / (std[key] / std_total))
                per_standard.setdefault(t, []).append(chasi / std[key])
                if pages:
                    pages_per_chasi.setdefault(t, []).append(pages / chasi)
    return intensity, per_standard, pages_per_chasi


def type_stat(table, t, default):
    values = table.get(t)
    if not values:
        values = [v for alt in TYPE_FALLBACK.get(t, []) for v in table.get(alt, [])]
    if not values:
        return (default, default, default, 0)
    return (min(values), statistics.median(values), max(values), len(values))


def round_to_total(raw, total):
    """비율을 정수로 반올림하되 합계를 맞춘다(큰 나머지 우선)."""
    floors = [math.floor(x) for x in raw]
    rest = total - sum(floors)
    order = sorted(range(len(raw)), key=lambda i: raw[i] - floors[i], reverse=True)
    for i in order[:rest]:
        floors[i] += 1
    return floors


def even(n):
    return int(2 * round(n / 2))


def share_model(areas, intensity, total):
    """성취기준 비중 × 유형 강도로 나눈다."""
    weights = [a["standards"] * (a.get("intensity") or type_stat(intensity, a["type"], 1.0)[1])
               for a in areas]
    return [total * w / sum(weights) for w in weights]


def anchor_model(areas, per_standard, total):
    """비실기 영역은 성취기준당 차시로 고정하고, 남는 차시를 실기 중심 영역이 나눠 갖는다."""
    raw = [a["standards"] * type_stat(per_standard, a["type"], 3.0)[1] for a in areas]
    core = [i for i, a in enumerate(areas) if a["type"] in CORE_TYPES]
    fixed = sum(r for i, r in enumerate(raw) if i not in core)
    remainder = total - fixed
    if not core or remainder <= 0:
        return [total * r / sum(raw) for r in raw]
    core_raw = sum(raw[i] for i in core)
    return [remainder * raw[i] / core_raw if i in core else raw[i] for i in range(len(areas))]


def allocate(areas, calib, total, model):
    intensity, per_standard, _ = calib
    share = share_model(areas, intensity, total)
    anchor = anchor_model(areas, per_standard, total)
    raw = {"share": share, "anchor": anchor,
           "blend": [(s + a) / 2 for s, a in zip(share, anchor)]}[model]
    return round_to_total(raw, total)


def propose(spec, data, calib_revs, model="blend"):
    calib = calibrate(data, calib_revs)
    ppc = calib[2]
    hours = spec.get("hours_per_grade", 102)
    project = spec.get("project_chasi", 0)
    appendix = spec.get("appendix_pages", 6)
    limit = spec.get("page_limit", {"base": 120, "tolerance": 0.10, "front_max": 10})
    upper = math.floor(limit["base"] * (1 + limit["tolerance"]))
    lower = math.ceil(limit["base"] * (1 - limit["tolerance"]))

    areas = spec["areas"]
    chasi = allocate(areas, calib, hours - project, spec.get("model", model))

    units = []
    for a, c in zip(areas, chasi):
        lo, med, hi, n = type_stat(ppc, a["type"], 1.2)
        pages = max(even(c * med), UNIT_FIXED_PAGES + 2)
        mids = max(2, min(4, round(c / 18)))
        units.append({
            "area": a["key"], "type": a["type"], "standards": a["standards"],
            "chasi": c, "pages": pages,
            "pages_range": [even(c * lo), even(c * hi)],
            "mid_units": mids,
            "topic_spreads": max(1, (pages - UNIT_FIXED_PAGES) // 2),
            "calibration_samples": n,
        })
    if project:
        units.append({"area": "프로젝트", "type": "project", "standards": 0, "chasi": project,
                      "pages": max(4, even(project * 0.7)), "pages_range": [4, 6],
                      "mid_units": 1, "topic_spreads": 2, "calibration_samples": 4})

    body = sum(u["pages"] for u in units)
    # 본문+부록이 검정 상한을 넘으면 큰 단원부터 2쪽씩 줄인다.
    while body + appendix > upper:
        biggest = max(units, key=lambda u: u["pages"])
        biggest["pages"] -= 2
        body -= 2
    front = min(limit.get("front_max", 10), 8)
    g_lo, g_med, g_hi = GUIDE_RATIO
    return {
        "name": spec.get("name", ""),
        "model": spec.get("model", model),
        "calibrated_on": calib_revs,
        "textbook": {
            "units": units,
            "chasi_total": sum(u["chasi"] for u in units),
            "body_pages": body,
            "appendix_pages": appendix,
            "front_pages": front,
            "total_pages": front + body + appendix,
            "limit_body_plus_appendix": [lower, upper],
            "within_limit": lower <= body + appendix <= upper,
            "pages_per_chasi": round(body / max(1, sum(u["chasi"] for u in units)), 2),
        },
        "guide": {
            "general_pages": GUIDE_GENERAL_PAGES[1],
            "unit_pages": round(body * g_med),
            "appendix_pages": 20,
            "total_pages": GUIDE_GENERAL_PAGES[1] + round(body * g_med) + 20,
            "total_range": [GUIDE_GENERAL_PAGES[0] + round(body * g_lo),
                            GUIDE_GENERAL_PAGES[2] + round(body * g_hi) + 40],
            "pages_per_textbook_spread": 4,
        },
    }


def spec_from_curriculum(data, rev, band):
    cur = data["curricula"][rev]
    return {
        "name": f"{rev} 개정 {band}학년군 (실측 교육과정)",
        "hours_per_grade": cur["hours_per_grade"],
        "areas": [{"key": a["key"], "type": a["type"], "standards": a["standards"][band]}
                  for a in cur["areas"]],
    }


def actual_summary(data, rev, band):
    """같은 개정·학년군 실제 책들의 영역별 차시·쪽수 중앙값."""
    by_area = {}
    for book in data["books"]:
        if book["rev"] != rev or band_of(book["grade"]) != band:
            continue
        for key, chasi, pages in book["units"]:
            entry = by_area.setdefault(key, {"chasi": [], "pages": []})
            if chasi:
                entry["chasi"].append(chasi)
            if pages:
                entry["pages"].append(pages)
    return {k: {"chasi": statistics.median(v["chasi"]) if v["chasi"] else None,
                "chasi_range": [min(v["chasi"]), max(v["chasi"])] if v["chasi"] else None,
                "pages": statistics.median(v["pages"]) if v["pages"] else None,
                "pages_range": [min(v["pages"]), max(v["pages"])] if v["pages"] else None}
            for k, v in by_area.items()}


def print_proposal(p, actual=None):
    tb = p["textbook"]
    print(f"\n## {p['name']}  (모형: {p['model']}, 보정 근거: {', '.join(p['calibrated_on'])} 개정)")
    print("| 단원(영역) | 성취기준 | 제안 차시 | 제안 쪽수 | 쪽수 범위 | 중단원 | 주제 펼침면 |"
          + (" 실측 차시(범위) | 실측 쪽수(범위) |" if actual else ""))
    print("|---|---|---|---|---|---|---|" + ("---|---|" if actual else ""))
    for u in tb["units"]:
        row = (f"| {u['area']} | {u['standards']} | {u['chasi']} | {u['pages']} | "
               f"{u['pages_range'][0]}~{u['pages_range'][1]} | {u['mid_units']} | {u['topic_spreads']} |")
        if actual:
            a = actual.get(u["area"])
            if a and a["chasi"] is not None:
                row += f" {a['chasi']:g} ({a['chasi_range'][0]}~{a['chasi_range'][1]}) |"
            else:
                row += " - |"
            row += f" {a['pages']:g} ({a['pages_range'][0]}~{a['pages_range'][1]}) |" if a and a["pages"] else " - |"
        print(row)
    print(f"- 교과서: 본문 {tb['body_pages']}쪽 + 부록 {tb['appendix_pages']}쪽 + 앞부분 {tb['front_pages']}쪽 "
          f"= {tb['total_pages']}쪽, 차시 {tb['chasi_total']}, 차시당 {tb['pages_per_chasi']}쪽, "
          f"본문+부록 기준 {tb['limit_body_plus_appendix'][0]}~{tb['limit_body_plus_appendix'][1]}쪽 "
          f"{'충족' if tb['within_limit'] else '벗어남'}")
    g = p["guide"]
    print(f"- 지도서: 총론 {g['general_pages']} + 각론 {g['unit_pages']} + 부록 {g['appendix_pages']} "
          f"= 약 {g['total_pages']}쪽 (범위 {g['total_range'][0]}~{g['total_range'][1]}), "
          f"교과서 펼침면 1개당 지도서 {g['pages_per_textbook_spread']}쪽")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--spec", help="교육과정 사양 JSON 파일")
    parser.add_argument("--rev", help="실측 교육과정으로 제안(2015 또는 2022)")
    parser.add_argument("--band", default="3-4", help="학년군(3-4 또는 5-6)")
    parser.add_argument("--calibrate-on", default="2015,2022", help="보정에 쓸 개정(쉼표 구분)")
    parser.add_argument("--backtest", action="store_true",
                        help="한 개정만으로 보정해 다른 개정의 실제 책을 얼마나 맞히는지 비교")
    parser.add_argument("--model", default="blend", choices=MODELS,
                        help="차시 배분 모형: share(비중×강도), anchor(성취기준당 차시+실기 영역 흡수), blend(평균)")
    parser.add_argument("--json", action="store_true", help="JSON으로 출력")
    args = parser.parse_args(argv)

    data = load_baselines()
    if args.backtest:
        errors = {m: [] for m in MODELS}
        for target, source in (("2022", ["2015"]), ("2015", ["2022"])):
            for band in ("3-4", "5-6"):
                spec = spec_from_curriculum(data, target, band)
                actual = actual_summary(data, target, band)
                for m in MODELS:
                    p = propose(spec, data, source, m)
                    errors[m] += [abs(u["chasi"] - actual[u["area"]]["chasi"])
                                  for u in p["textbook"]["units"] if actual.get(u["area"])]
                spec["name"] = f"백테스트: {target} {band}을(를) {source[0]} 실측만으로 예측"
                print_proposal(propose(spec, data, source, args.model), actual)
        print("\n## 모형별 영역 차시 평균 절대 오차(개정 간 교차 예측)")
        for m in MODELS:
            print(f"- {m}: {statistics.mean(errors[m]):.1f}차시 (최대 {max(errors[m]):g})")
        return 0

    calib = [r.strip() for r in args.calibrate_on.split(",") if r.strip()]
    if args.spec:
        spec = json.loads(Path(args.spec).read_text(encoding="utf-8"))
        actual = None
    elif args.rev:
        spec = spec_from_curriculum(data, args.rev, args.band)
        actual = actual_summary(data, args.rev, args.band)
    else:
        parser.error("--spec, --rev, --backtest 중 하나가 필요합니다.")
    result = propose(spec, data, calib, args.model)
    if args.json:
        json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        print_proposal(result, actual)
    return 0


if __name__ == "__main__":
    sys.exit(main())
