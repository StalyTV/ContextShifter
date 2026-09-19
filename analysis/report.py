"""Reproduce the tables of Chapter 6 and Appendix B.

    python report.py path/to/exports
"""
import sys, statistics as st
from records import load, usable, evaluate, PHASE1, PHASE2

ALPHAS = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
THRESHOLDS = [0.20, 0.30, 0.40, 0.50, 0.60, 0.70]
FAILED = "P2"          # tracking malfunctioned; reported separately throughout


def mean(rows, i):
    vals = [r[i] for r in rows if r[i] is not None]
    return st.mean(vals) if vals else float("nan")


def line(label, rows):
    print(f"  {label:<14} n={len(rows):<3} "
          f"P={mean(rows,0):.3f}  R={mean(rows,1):.3f}  F1={mean(rows,2):.3f}")


def aggregate(by_participant, phase, **kw):
    """(all rows, rows excluding the failed deployment)."""
    every, rest = [], []
    for pid, records in by_participant.items():
        rows = evaluate(usable(records, phase), **kw)
        every += rows
        if FAILED not in pid:
            rest += rows
    return every, rest


def main(export_dir):
    data = load(export_dir)

    for phase, title in ((PHASE1, "Phase 1 (Table 6.2)"),
                         (PHASE2, "Phase 2 (Table B.3)")):
        print(f"\n{title}")
        for pid, records in data.items():
            line(pid, evaluate(usable(records, phase)))
        every, rest = aggregate(data, phase)
        line("All", every)
        line(f"Excluding {FAILED}", rest)

    print("\nSemantic influence sweep, phase 1 (Table B.1)")
    for alpha in ALPHAS:
        every, rest = aggregate(data, PHASE1, alpha=alpha)
        print(f"  alpha={alpha:<5} P={mean(every,0):.3f}  R={mean(every,1):.3f}  "
              f"F1={mean(every,2):.3f}   F1 excl. {FAILED}={mean(rest,2):.3f}")

    print("\nSelection threshold sweep, phase 1 (Table B.2)")
    for threshold in THRESHOLDS:
        every, rest = aggregate(data, PHASE1, threshold=threshold)
        print(f"  t={threshold:<5} P={mean(every,0):.3f}  R={mean(every,1):.3f}  "
              f"F1={mean(every,2):.3f}   F1 excl. {FAILED}={mean(rest,2):.3f}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "exports")
