"""Draw Figure 6.1: agreement as each selection parameter is varied on its own.

    python figure_sweeps.py path/to/exports [out.pdf]
"""
import sys
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from records import load, usable, evaluate, PHASE1
from report import aggregate, mean, ALPHAS, THRESHOLDS

BLUE, ORANGE, GREEN = "#2a78d6", "#d95926", "#199e70"
SERIES = [("Precision", BLUE, "-", "o"),
          ("Recall", ORANGE, "--", "s"),
          ("F1", GREEN, "-.", "^")]
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#d8d7d2"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 8.5,
    "axes.edgecolor": MUTED, "axes.labelcolor": INK, "axes.linewidth": 0.6,
    "xtick.color": MUTED, "ytick.color": MUTED, "text.color": INK,
    "xtick.labelsize": 8, "ytick.labelsize": 8, "pdf.fonttype": 42,
})


def curve(data, values, key):
    """Aggregate precision, recall and F1 at each value of one parameter."""
    out = []
    for v in values:
        every, _ = aggregate(data, PHASE1, **{key: v})
        out.append([mean(every, i) for i in range(3)])
    return np.array(out)


def main(export_dir, out="sweeps.pdf"):
    data = load(export_dir)
    alphas = np.round(np.arange(0, 1.0001, 0.025), 4)
    thresholds = np.round(np.arange(0.15, 0.8001, 0.01), 4)
    A = curve(data, alphas, "alpha")
    T = curve(data, thresholds, "threshold")

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(5.45, 2.45), sharey=True)
    for ax in (ax1, ax2):
        ax.set_ylim(0, 1.0)
        ax.set_yticks(np.arange(0, 1.01, 0.2))
        ax.grid(axis="y", color=GRID, linewidth=0.5)
        ax.set_axisbelow(True)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)

    for i, (_, colour, style, marker) in enumerate(SERIES):
        for ax, xs, ys, marks in ((ax1, alphas, A, ALPHAS),
                                  (ax2, thresholds, T, THRESHOLDS)):
            ax.plot(xs, ys[:, i], color=colour, ls=style, lw=1.5, zorder=3)
            at = [int(np.argmin(abs(xs - m))) for m in marks]
            ax.plot([xs[j] for j in at], [ys[j, i] for j in at], ls="none",
                    marker=marker, ms=4, mfc=colour, mec="white", mew=0.7, zorder=4)

    ax1.set_xlabel(r"semantic influence $\alpha$")
    ax1.set_xlim(0, 1)
    ax1.set_xticks(np.arange(0, 1.01, 0.2))
    ax1.set_ylabel("agreement with the confirmed set")
    ax1.set_title("(a) varying the semantic influence", fontsize=8.5, pad=6)
    ax2.set_xlabel("relative selection threshold")
    ax2.set_xlim(0.15, 0.8)
    ax2.set_xticks(np.arange(0.2, 0.81, 0.1))
    ax2.set_title("(b) varying the selection threshold", fontsize=8.5, pad=6)
    ax2.axvline(0.5, color=MUTED, lw=0.8, ls=(0, (1, 2)), zorder=2)
    ax2.annotate("deployed", xy=(0.5, 0.97), xytext=(3, 0),
                 textcoords="offset points", fontsize=7.5, color=MUTED,
                 ha="left", va="top")
    ax2.tick_params(axis="y", length=0)

    handles = [plt.Line2D([], [], color=c, ls=s, lw=1.5, marker=m, ms=4,
                          mfc=c, mec="white", mew=0.7) for _, c, s, m in SERIES]
    fig.legend(handles, [s[0] for s in SERIES], loc="lower center", ncol=3,
               frameon=False, fontsize=8.5, bbox_to_anchor=(0.5, -0.025),
               handlelength=2.6, columnspacing=2.2)
    fig.tight_layout(rect=[0, 0.05, 1, 1], w_pad=1.6)
    fig.savefig(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "exports",
         sys.argv[2] if len(sys.argv) > 2 else "sweeps.pdf")
