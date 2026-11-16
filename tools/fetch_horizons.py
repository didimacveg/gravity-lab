#!/usr/bin/env python3
"""Download and cache reference ephemerides from NASA/JPL Horizons.

Writes, from one consistent set of queries:

  web/data/horizons.json          metadata, initial conditions, small datasets
  web/data/horizons_planets.f64   reference positions, little-endian float64,
                                  layout [sample][body][x,y,z], AU
  core/horizons_data.hpp          the same numbers as C++ constants

Everything is barycentric (Solar System Barycenter, @0), ecliptic and mean
equinox of J2000.0, geometric states, TDB time, AU and AU/day. The planets
are the *system barycentres* (Earth is the Earth-Moon barycentre, Jupiter is
Jupiter plus its moons...) because the simulator models each system as one
point mass.

Only the Python standard library is used. Requests are sent one at a time,
as the Horizons API documentation asks.

Data source and citation:
  NASA/JPL Solar System Dynamics, Horizons On-Line Ephemeris System,
  https://ssd.jpl.nasa.gov/horizons/  (planetary ephemeris DE441).
  Giorgini, J.D. et al. (1996), "JPL's On-Line Solar System Data Service",
  Bull. AAS 28(3), 1158.
  Park, R.S. et al. (2021), "The JPL Planetary and Lunar Ephemerides DE440
  and DE441", Astron. J. 161, 105.

Usage:  python3 tools/fetch_horizons.py
"""
import datetime
import json
import math
import os
import struct
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://ssd.jpl.nasa.gov/api/horizons.api"

EPOCH_JD = 2451545.0          # J2000.0 TDB
CADENCE_DAYS = 32             # reference sampling
HALF_SPAN = 1141              # samples on each side of the epoch (~100 yr)

AU_KM = 149597870.7
DAY_S = 86400.0
GAUSS_K2 = 2.9591220828559e-4  # G in AU^3 / (Msun day^2), as in core/units.hpp

# GM in km^3/s^2 from the DE440/DE441 ephemeris header (Park et al. 2021).
GM_KM3_S2 = {
    "Sun": 132712440041.279419,
    "Mercury": 22031.868551,
    "Venus": 324858.592000,
    "Earth": 398600.435507 + 4902.800118,   # Earth + Moon
    "Mars": 42828.375816,
    "Jupiter": 126712764.100000,
    "Saturn": 37940584.841800,
    "Uranus": 5794556.400000,
    "Neptune": 6836527.100580,
}

# name, Horizons COMMAND, physical radius in km (display only)
PLANETS = [
    ("Sun", "10", 695700.0),
    ("Mercury", "1", 2439.7),
    ("Venus", "2", 6051.8),
    ("Earth", "3", 6371.0),
    ("Mars", "4", 3389.5),
    ("Jupiter", "5", 69911.0),
    ("Saturn", "6", 58232.0),
    ("Uranus", "7", 25362.0),
    ("Neptune", "8", 24622.0),
]

MINOR = [
    ("Ceres", "1;", "dwarf"),
    ("Pallas", "2;", "asteroid"),
    ("Vesta", "4;", "asteroid"),
    ("Chiron", "2060;", "centaur"),
    ("Pluto", "9", "dwarf"),
    ("Haumea", "136108;", "dwarf"),
    ("Makemake", "136472;", "dwarf"),
    ("Eris", "136199;", "dwarf"),
    ("Halley", "DES=1P;CAP", "comet"),
    ("Encke", "DES=2P;CAP", "comet"),
]

# Real Jupiter trojans. L4 leads Jupiter by 60 degrees, L5 trails it.
TROJANS = [
    ("588 Achilles", "588;", "L4"),
    ("624 Hektor", "624;", "L4"),
    ("911 Agamemnon", "911;", "L4"),
    ("617 Patroclus", "617;", "L5"),
    ("884 Priamus", "884;", "L5"),
    ("1172 Aneas", "1172;", "L5"),
]
TROJAN_STEP_DAYS = 4564       # 8 intervals to the last reference sample

# Voyager 2 at Jupiter. Closest approach 1979-Jul-09 22:29 UTC.
VOYAGER_CMD = "-32"
VOYAGER_START_JD = 2444033.5  # 1979-Jun-09 00:00 TDB
VOYAGER_DAYS = 60
VOYAGER_STEP = "6h"
VOYAGER_STEP_DAYS = 0.25


def query(command, start_jd, stop_jd, step):
    params = {
        "format": "text",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'VECTORS'",
        "CENTER": "'500@0'",
        "REF_PLANE": "'ECLIPTIC'",
        "REF_SYSTEM": "'ICRF'",
        "OUT_UNITS": "'AU-D'",
        "VEC_TABLE": "'2'",
        "VEC_CORR": "'NONE'",
        "CSV_FORMAT": "'YES'",
        "TIME_TYPE": "'TDB'",
        "START_TIME": f"'JD{start_jd:.9f}'",
        "STOP_TIME": f"'JD{stop_jd:.9f}'",
        "STEP_SIZE": f"'{step}'",
    }
    url = API + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    last = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                text = r.read().decode("utf-8", "replace")
            if "$$SOE" in text:
                break
            last = RuntimeError("no ephemeris in response:\n" + text[:1500])
        except Exception as exc:  # network hiccup: back off and retry
            last = exc
        time.sleep(2 ** (attempt + 1))
    else:
        raise last
    time.sleep(0.5)  # one request at a time, and not in a hurry

    header = text.split("$$SOE")[0]
    source = ""
    for line in header.splitlines():
        if line.startswith("Target body name"):
            source = line.split(":", 1)[1].strip()
    rows = []
    for line in text.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines():
        f = [s.strip() for s in line.split(",")]
        rows.append((float(f[0]),) + tuple(float(x) for x in f[2:8]))
    return rows, source, text.splitlines()[0].strip()


def state_at(command, jd):
    rows, source, _ = query(command, jd, jd + 1.0, "1d")
    assert abs(rows[0][0] - jd) < 1e-9
    return list(rows[0][1:]), source


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def varpi(r, v, mu):
    """Longitude of perihelion, Omega + omega (the usual 'dog-leg' angle)."""
    h = cross(r, v)
    rn = math.sqrt(sum(c * c for c in r))
    vxh = cross(v, h)
    e = [vxh[i] / mu - r[i] / rn for i in range(3)]
    n = (-h[1], h[0], 0.0)                       # ascending node direction
    nn = math.hypot(n[0], n[1])
    en = math.sqrt(sum(c * c for c in e))
    node = math.atan2(n[1], n[0])
    cosw = (n[0] * e[0] + n[1] * e[1]) / (nn * en)
    w = math.acos(max(-1.0, min(1.0, cosw)))
    if e[2] < 0:
        w = 2 * math.pi - w
    return node + w


def linear_rate(ts, ys):
    """Least-squares slope of an unwrapped angle series."""
    un = [ys[0]]
    for y in ys[1:]:
        d = y - un[-1]
        d -= 2 * math.pi * round(d / (2 * math.pi))
        un.append(un[-1] + d)
    n = len(ts)
    st, sy = sum(ts), sum(un)
    stt = sum(t * t for t in ts)
    sty = sum(t * y for t, y in zip(ts, un))
    return (n * sty - st * sy) / (n * stt - st * st), un


def cpp_array(name, values, per_line=3):
    out = [f"inline constexpr double {name}[] = {{"]
    for i in range(0, len(values), per_line):
        out.append("    " + ", ".join(repr(float(v)) for v in values[i:i + per_line]) + ",")
    out.append("};")
    return "\n".join(out)


def main():
    gm_sun_au = GM_KM3_S2["Sun"] * DAY_S ** 2 / AU_KM ** 3
    mass = {k: (v * DAY_S ** 2 / AU_KM ** 3) / GAUSS_K2 for k, v in GM_KM3_S2.items()}

    n_samples = 2 * HALF_SPAN + 1
    jd0 = EPOCH_JD - HALF_SPAN * CADENCE_DAYS
    jd1 = EPOCH_JD + HALF_SPAN * CADENCE_DAYS

    print(f"reference: {n_samples} samples, JD {jd0} .. {jd1}", flush=True)
    series = {}
    sources = {}
    api_version = ""
    for name, cmd, _ in PLANETS:
        rows, src, api_version = query(cmd, jd0, jd1, f"{CADENCE_DAYS}d")
        assert len(rows) == n_samples, (name, len(rows))
        for k, row in enumerate(rows):
            assert abs(row[0] - (jd0 + k * CADENCE_DAYS)) < 1e-6
        series[name] = rows
        sources[name] = src
        print(f"  {name:8s} {src}", flush=True)

    planets = []
    for name, cmd, radius_km in PLANETS:
        st = list(series[name][HALF_SPAN][1:])
        planets.append({"name": name, "horizons_id": cmd, "source": sources[name],
                        "gm_km3_s2": GM_KM3_S2[name], "mass": mass[name],
                        "radius_au": radius_km / AU_KM, "state": st})

    # Osculating heliocentric longitude of perihelion of Mercury in DE441.
    mu_m = GAUSS_K2 * (mass["Sun"] + mass["Mercury"])
    varpis = []
    for k in range(n_samples):
        s, m = series["Sun"][k], series["Mercury"][k]
        r = [m[1 + i] - s[1 + i] for i in range(3)]
        v = [m[4 + i] - s[4 + i] for i in range(3)]
        varpis.append(varpi(r, v, mu_m))
    ts = [(k - HALF_SPAN) * CADENCE_DAYS for k in range(n_samples)]
    _, varpis = linear_rate(ts, varpis)
    fwd = slice(HALF_SPAN, n_samples)
    rate_fwd, _ = linear_rate(ts[fwd], varpis[fwd])
    arcsec_cy = 206264.806247 * 36525.0
    print(f"  DE441 Mercury varpi rate J2000..+100yr: {rate_fwd * arcsec_cy:.3f} arcsec/cy")

    print("minor bodies", flush=True)
    minor = []
    for name, cmd, kind in MINOR:
        st, src = state_at(cmd, EPOCH_JD)
        minor.append({"name": name, "kind": kind, "source": src, "state": st})
        print(f"  {name:9s} {src}", flush=True)

    print("trojans", flush=True)
    trojans = []
    troj_n = HALF_SPAN * CADENCE_DAYS // TROJAN_STEP_DAYS + 1
    for name, cmd, camp in TROJANS:
        rows, src, _ = query(cmd, EPOCH_JD, jd1, f"{TROJAN_STEP_DAYS}d")
        assert len(rows) == troj_n, (name, len(rows))
        trojans.append({"name": name, "camp": camp, "source": src,
                        "state": list(rows[0][1:]),
                        "ref": [list(r[1:4]) for r in rows]})
        print(f"  {name:14s} {src}", flush=True)

    print("voyager 2", flush=True)
    voy_n = int(round(VOYAGER_DAYS / VOYAGER_STEP_DAYS)) + 1
    voy_end = VOYAGER_START_JD + VOYAGER_DAYS
    voy_bodies = []
    for name, cmd, _ in PLANETS:
        st, _ = state_at(cmd, VOYAGER_START_JD)
        voy_bodies.append({"name": name, "mass": mass[name], "state": st})
    vrows, vsrc, _ = query(VOYAGER_CMD, VOYAGER_START_JD, voy_end, VOYAGER_STEP)
    jrows, _, _ = query("5", VOYAGER_START_JD, voy_end, VOYAGER_STEP)
    srows, _, _ = query("10", VOYAGER_START_JD, voy_end, VOYAGER_STEP)
    assert len(vrows) == len(jrows) == len(srows) == voy_n, (len(vrows), voy_n)
    print(f"  {vsrc}", flush=True)
    voyager = {
        "source": vsrc, "start_jd": VOYAGER_START_JD, "step_days": VOYAGER_STEP_DAYS,
        "samples": voy_n, "bodies": voy_bodies,
        "probe": [list(r[1:]) for r in vrows],
        "jupiter": [list(r[1:]) for r in jrows],
        "sun": [list(r[1:]) for r in srows],
    }

    retrieved = datetime.date.today().isoformat()
    meta = {
        "source": "NASA/JPL Horizons On-Line Ephemeris System",
        "url": "https://ssd.jpl.nasa.gov/horizons/",
        "citation": ("NASA/JPL Solar System Dynamics. Data retrieved on "
                     f"{retrieved}. Horizons System. https://ssd.jpl.nasa.gov"),
        "retrieved": retrieved,
        "api": api_version,
        "ephemeris": "DE441",
        "frame": "Barycentric (SSB), ecliptic and mean equinox of J2000.0, geometric states",
        "time_scale": "TDB",
        "units": "AU, AU/day; masses in units where G = k^2 (Gaussian) and GM_sun = DE440 value",
        "epoch_jd": EPOCH_JD,
        "cadence_days": CADENCE_DAYS,
        "samples": n_samples,
        "epoch_index": HALF_SPAN,
        "gm_sun_au3_d2": gm_sun_au,
        "planets": planets,
        "mercury_varpi": varpis,
        "mercury_varpi_rate_arcsec_cy": rate_fwd * arcsec_cy,
        "minor": minor,
        "trojans": trojans,
        "trojan_step_days": TROJAN_STEP_DAYS,
        "voyager2": voyager,
    }

    os.makedirs(os.path.join(ROOT, "web", "data"), exist_ok=True)
    with open(os.path.join(ROOT, "web", "data", "horizons.json"), "w") as f:
        json.dump(meta, f, separators=(",", ":"))
        f.write("\n")

    flat = []
    for k in range(n_samples):
        for name, _, _ in PLANETS:
            flat.extend(series[name][k][1:4])
    with open(os.path.join(ROOT, "web", "data", "horizons_planets.f64"), "wb") as f:
        f.write(struct.pack(f"<{len(flat)}d", *flat))

    # ---- C++ header ----
    h = []
    h.append("// GENERATED by tools/fetch_horizons.py. Do not edit by hand.")
    h.append("// Source: NASA/JPL Horizons (DE441), retrieved " + retrieved + ".")
    h.append("// Barycentric, ecliptic J2000, TDB, AU and AU/day.")
    h.append("#pragma once")
    h.append("#include <cstddef>")
    h.append("")
    h.append("namespace gl::horizons {")
    h.append("")
    h.append(f"inline constexpr double EPOCH_JD = {EPOCH_JD!r};")
    h.append(f"inline constexpr double CADENCE_DAYS = {float(CADENCE_DAYS)!r};")
    h.append(f"inline constexpr std::size_t SAMPLES = {n_samples};")
    h.append(f"inline constexpr std::size_t EPOCH_INDEX = {HALF_SPAN};")
    h.append(f"inline constexpr std::size_t BODIES = {len(PLANETS)};")
    h.append(f"inline constexpr double MERCURY_VARPI_RATE_ARCSEC_CY = {rate_fwd * arcsec_cy!r};")
    h.append("")
    h.append("struct Body { const char* name; double mass; double radiusAU; double state[6]; };")
    h.append("")

    def body_rows(items, radius=lambda b: b.get("radius_au", 0.0),
                  m=lambda b: b.get("mass", 0.0)):
        out = []
        for b in items:
            st = ", ".join(repr(float(x)) for x in b["state"])
            out.append(f'    {{"{b["name"]}", {m(b)!r}, {radius(b)!r}, {{{st}}}}},')
        return out

    h.append("// Sun and the eight planetary-system barycentres at J2000.0.")
    h.append("inline constexpr Body PLANETS[] = {")
    h += body_rows(planets)
    h.append("};")
    h.append("")
    h.append("// Massless tracers at J2000.0.")
    h.append("inline constexpr Body MINOR[] = {")
    h += body_rows(minor)
    h.append("};")
    h.append("")
    h.append("// Real Jupiter trojans at J2000.0 (first three L4, last three L5).")
    h.append("inline constexpr Body TROJANS[] = {")
    h += body_rows(trojans)
    h.append("};")
    h.append(f"inline constexpr std::size_t TROJAN_COUNT = {len(trojans)};")
    h.append(f"inline constexpr std::size_t TROJAN_REF_SAMPLES = {troj_n};")
    h.append(f"inline constexpr double TROJAN_STEP_DAYS = {float(TROJAN_STEP_DAYS)!r};")
    h.append("// [trojan][sample][xyz]")
    h.append(cpp_array("TROJAN_REF", [c for t in trojans for p in t["ref"] for c in p]))
    h.append("")
    h.append("// Osculating heliocentric longitude of perihelion of Mercury in DE441,")
    h.append("// unwrapped, one value per reference sample (radians).")
    h.append(cpp_array("MERCURY_VARPI", varpis, 4))
    h.append("")
    h.append("// Voyager 2 through its Jupiter fly-by.")
    h.append(f"inline constexpr double VOYAGER_START_JD = {VOYAGER_START_JD!r};")
    h.append(f"inline constexpr double VOYAGER_STEP_DAYS = {VOYAGER_STEP_DAYS!r};")
    h.append(f"inline constexpr std::size_t VOYAGER_SAMPLES = {voy_n};")
    h.append("inline constexpr Body VOYAGER_BODIES[] = {")
    h += body_rows(voy_bodies)
    h.append("};")
    h.append("// [sample][x,y,z,vx,vy,vz]")
    h.append(cpp_array("VOYAGER_PROBE", [c for r in voyager["probe"] for c in r]))
    h.append(cpp_array("VOYAGER_JUPITER", [c for r in voyager["jupiter"] for c in r]))
    h.append(cpp_array("VOYAGER_SUN", [c for r in voyager["sun"] for c in r]))
    h.append("")
    h.append("}  // namespace gl::horizons")
    with open(os.path.join(ROOT, "core", "horizons_data.hpp"), "w") as f:
        f.write("\n".join(h) + "\n")

    print("written web/data/horizons.json, web/data/horizons_planets.f64, "
          "core/horizons_data.hpp")


if __name__ == "__main__":
    sys.exit(main())
