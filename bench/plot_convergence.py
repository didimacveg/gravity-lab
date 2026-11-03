#!/usr/bin/env python3
"""Plots of integration error versus step size, from gl_convergence's CSV.

    ./build/gl_convergence bench/out/convergence.csv
    python bench/plot_convergence.py bench/out/convergence.csv docs/img

Writes, into the output directory:
    error_vs_dt.png       four panels: binary position / energy, solar energy /
                          angular momentum, all against dt on log-log axes
    cost_vs_accuracy.png  binary position error against force evaluations
    convergence_slopes.md fitted orders of convergence, as a Markdown table

Requires matplotlib and numpy only.
"""
from __future__ import annotations

import csv
import math
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

# Fixed categorical order (validated for colour-vision deficiency); each
# integrator also has its own marker and a direct label, so identity never
# depends on colour alone.
STYLE = {
    "euler":    {"color": "#2a78d6", "marker": "o", "label": "Explicit Euler (order 1)"},
    "verlet":   {"color": "#eb6834", "marker": "s", "label": "Velocity Verlet (order 2, symplectic)"},
    "rk4":      {"color": "#1baf7a", "marker": "^", "label": "Runge-Kutta 4 (order 4)"},
    "yoshida4": {"color": "#eda100", "marker": "D", "label": "Yoshida 4 (order 4, symplectic)"},
}
SHORT = {"euler": "Euler", "verlet": "Verlet", "rk4": "RK4", "yoshida4": "Yoshida 4"}
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e4e3df"

# Orders are fitted on the FOUR SMALLEST time steps whose error is above the
# round-off floor (taken as 1e-10, safely above the ~1e-13 of accumulated
# double-precision noise): that is the asymptotic regime the theory talks
# about. At large dt every method is pre-asymptotic and errors saturate near 1
# (an orbit cannot be "more than wrong").
FIT_POINTS, FIT_MIN = 4, 1e-10


def load(path: Path) -> dict[tuple[str, str], list[dict[str, float]]]:
    data: dict[tuple[str, str], list[dict[str, float]]] = defaultdict(list)
    with path.open() as f:
        for row in csv.DictReader(f):
            key = (row["scenario"], row["integrator"])
            data[key].append({k: float(v) for k, v in row.items()
                              if k not in ("scenario", "integrator")})
    for rows in data.values():
        rows.sort(key=lambda r: r["dt_days"])
    return data


def slope(x: list[float], y: list[float]) -> float | None:
    pts = sorted((a, b) for a, b in zip(x, y) if math.isfinite(b) and FIT_MIN < b < 0.5)
    pts = pts[:FIT_POINTS]
    if len(pts) < 3:
        return None
    xs, ys = np.log(np.array(pts)).T
    return float(np.polyfit(xs, ys, 1)[0])


def style_axes(ax: plt.Axes, title: str, xlabel: str, ylabel: str) -> None:
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_title(title, loc="left", fontsize=11, color=INK, pad=8)
    ax.set_xlabel(xlabel, color=MUTED, fontsize=9)
    ax.set_ylabel(ylabel, color=MUTED, fontsize=9)
    ax.grid(True, which="major", color=GRID, linewidth=0.8)
    ax.tick_params(colors=MUTED, labelsize=8)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)


def panel(ax, data, scenario, column, title, ylabel, label_end=True):
    for name, st in STYLE.items():
        rows = data.get((scenario, name), [])
        x = [r["dt_days"] for r in rows]
        y = [r[column] if math.isfinite(r[column]) else np.nan for r in rows]
        ax.plot(x, y, color=st["color"], marker=st["marker"], markersize=4.5,
                linewidth=2, markeredgecolor="white", markeredgewidth=0.8)
        if label_end and rows:
            # Direct label at the smallest dt, where the curves separate most.
            ax.annotate(SHORT[name], (x[0], y[0]), xytext=(-6, 0),
                        textcoords="offset points", ha="right", va="center",
                        fontsize=8, color=INK)
    style_axes(ax, title, "time step dt [days]", ylabel)
    lo, hi = ax.get_xlim()
    ax.set_xlim(lo / 3.0, hi)  # room for the direct labels on the left


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "convergence.csv")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else ".")
    out.mkdir(parents=True, exist_ok=True)
    data = load(src)

    plt.rcParams.update({"font.family": "DejaVu Sans", "figure.facecolor": "#fcfcfb",
                         "axes.facecolor": "#fcfcfb", "savefig.facecolor": "#fcfcfb"})
    fig, axes = plt.subplots(2, 2, figsize=(12, 9))
    panel(axes[0, 0], data, "binary", "rel_position_error",
          "Two-body orbit, e = 0.6, 10 orbits — position vs exact Kepler solution",
          "|r - r_exact| / a")
    panel(axes[0, 1], data, "binary", "max_rel_energy_error",
          "Two-body orbit — worst energy error over the run", "max |ΔE / E|")
    panel(axes[1, 0], data, "solar", "max_rel_energy_error",
          "J2000 Solar System, 100 years — worst energy error", "max |ΔE / E|")
    panel(axes[1, 1], data, "solar", "rel_angular_momentum_error",
          "J2000 Solar System — angular momentum after 100 years", "|ΔL| / |L|",
          label_end=False)
    for text, xy in (("Euler", (0.13, 2e-2)), ("RK4", (0.13, 4e-12)),
                     ("Verlet, Yoshida 4: round-off only", (0.13, 2e-13))):
        axes[1, 1].annotate(text, xy, fontsize=8, color=INK)
    axes[1, 1].axhline(2.2e-16, color=MUTED, linewidth=1, linestyle=":")
    axes[1, 1].annotate("double-precision ε", (0.14, 2.6e-16), fontsize=8, color=MUTED)

    # Reference slopes on the first panel: what order p means visually.
    ax = axes[0, 0]
    x0 = np.array([0.02, 0.2])
    for p, y0 in ((1, 3e-2), (2, 1e-6), (4, 2e-13)):
        ax.plot(x0, y0 * (x0 / x0[0]) ** p, color=MUTED, linewidth=1, linestyle="--")
        ax.annotate(f"∝ dt^{p}", (x0[1], y0 * (x0[1] / x0[0]) ** p), fontsize=8,
                    color=MUTED, xytext=(4, 0), textcoords="offset points", va="center")

    handles = [plt.Line2D([], [], color=s["color"], marker=s["marker"], linewidth=2,
                          markeredgecolor="white", label=s["label"]) for s in STYLE.values()]
    fig.legend(handles=handles, loc="upper center", ncol=4, frameon=False, fontsize=9,
               bbox_to_anchor=(0.5, 1.0))
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    fig.savefig(out / "error_vs_dt.png", dpi=150)
    plt.close(fig)

    # Accuracy per unit of work: what an orbit costs at a given accuracy.
    fig, ax = plt.subplots(figsize=(8, 5.2))
    for name, st in STYLE.items():
        rows = data.get(("binary", name), [])
        x = [r["force_evaluations"] / 10 for r in rows]  # per orbit
        y = [r["rel_position_error"] for r in rows]
        ax.plot(x, y, color=st["color"], marker=st["marker"], markersize=4.5, linewidth=2,
                markeredgecolor="white", markeredgewidth=0.8, label=st["label"])
        ax.annotate(SHORT[name], (x[0], y[0]), xytext=(6, 0), textcoords="offset points",
                    va="center", fontsize=8, color=INK)
    style_axes(ax, "Accuracy per unit of work (two-body, e = 0.6, 10 orbits)",
               "force evaluations per orbit", "|r - r_exact| / a")
    ax.legend(frameon=False, fontsize=8, loc="lower left")
    lo, hi = ax.get_xlim()
    ax.set_xlim(lo, hi * 2.5)  # room for the direct labels on the right
    fig.tight_layout()
    fig.savefig(out / "cost_vs_accuracy.png", dpi=150)
    plt.close(fig)

    # Fitted orders, so the README quotes numbers rather than a picture.
    lines = ["| Integrator | Theoretical order | Fitted: position (two-body) | "
             "Fitted: energy (two-body) | Fitted: energy (Solar System) |",
             "|---|---:|---:|---:|---:|"]
    theory = {"euler": 1, "verlet": 2, "rk4": 4, "yoshida4": 4}
    for name in STYLE:
        cells = []
        for scenario, column in (("binary", "rel_position_error"),
                                 ("binary", "max_rel_energy_error"),
                                 ("solar", "max_rel_energy_error")):
            rows = data.get((scenario, name), [])
            s = slope([r["dt_days"] for r in rows], [r[column] for r in rows])
            cells.append("n/a" if s is None else f"{s:.2f}")
        lines.append(f"| {STYLE[name]['label'].split(' (')[0]} | {theory[name]} | "
                     + " | ".join(cells) + " |")
    table = "\n".join(lines) + "\n"
    (out / "convergence_slopes.md").write_text(table)
    print(table)
    print(f"wrote {out / 'error_vs_dt.png'}, {out / 'cost_vs_accuracy.png'}, "
          f"{out / 'convergence_slopes.md'}")


if __name__ == "__main__":
    main()
