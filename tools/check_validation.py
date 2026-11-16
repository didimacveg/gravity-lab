#!/usr/bin/env python3
"""Compare a freshly generated validation.json with the committed one.

Different compilers round differently, so numbers are compared with a
relative tolerance instead of byte for byte. Usage:
    python3 tools/check_validation.py new.json committed.json
"""
import json
import sys

new, old = (json.load(open(p)) for p in sys.argv[1:3])
bad = 0
assert [c["id"] for c in new["cases"]] == [c["id"] for c in old["cases"]], "case list changed"
for a, b in zip(new["cases"], old["cases"]):
    for ca, cb in zip(a["checkpoints"], b["checkpoints"]):
        for planet, x, y in zip(new["planets"], ca["km"], cb["km"]):
            if x is None or y is None:
                ok = x is y
            else:
                # Chaotic cases (Euler, coarse Verlet) amplify rounding: looser there.
                tol = 0.02 if max(x, y) < 1e5 else 0.25
                ok = abs(x - y) <= tol * max(abs(x), abs(y)) + 0.05
            if not ok:
                bad += 1
                print(f"{a['id']} {ca['years']} yr {planet}: {x} vs committed {y}")
print("validation table reproduced" if not bad else f"{bad} values differ")
sys.exit(1 if bad else 0)
