# Genera la grafica del README a partir de energy_drift.csv
# pip install pandas matplotlib
import pandas as pd, matplotlib.pyplot as plt

df = pd.read_csv("energy_drift.csv")
fig, ax = plt.subplots(figsize=(9, 5))
for name, g in df.groupby("integrador"):
    ax.plot(g["dias"] / 365.25, g["error_relativo_energia"], label=name)
ax.set_yscale("log")
ax.set_xlabel("anios simulados")
ax.set_ylabel("|dE/E|")
ax.set_title("Deriva de energia por integrador (dt = 0.5 dias)")
ax.legend()
ax.grid(alpha=0.3)
fig.tight_layout()
fig.savefig("energy_drift.png", dpi=150)
print("escrito energy_drift.png")
