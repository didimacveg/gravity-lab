# gravity-lab

An N-body simulator of the Solar System written in C++17, validated against
known astronomical measurements, with a black-hole module and an interactive
browser build.

It is not a planetarium. It is a testbed for numerical integrators that
happens to be watchable.

**Live demo:** https://didimacveg.github.io/gravity-lab/
**Tests:** ![tests](https://github.com/didimacveg/gravity-lab/actions/workflows/tests.yml/badge.svg)

---

## Headline result: Mercury's perihelion precession

Mercury's orbit advances faster than Newtonian gravity permits. The
discrepancy was measured in 1859, went unexplained for 56 years, and was
finally accounted for by general relativity in 1915. This simulator
reproduces it from first principles.

| Model | Precession of Mercury's perihelion |
|---|---|
| Sun and Mercury only, Newtonian | 0.000 arcsec/century |
| All eight planets, Newtonian | 526.640 arcsec/century |
| All eight planets, with 1PN correction | 569.450 arcsec/century |
| **Relativistic contribution** | **42.810 arcsec/century** |

Accepted value: 42.98 arcsec/century. Error: 0.4%.

The first row is the control. With no perturbations and no relativity the
precession must be exactly zero, and it is. Without that zero the other rows
would be meaningless, because a mediocre integrator manufactures precession
of its own: at `dt = 0.2` days this same code produces 67 arcsec/century of
spurious precession, more than the entire effect being measured.

## Symplectic vs non-symplectic integration

Full Solar System, `dt = 0.5` days, relative energy error `|dE/E|`:

| Integrator | Order | Symplectic | At 10 yr | At 100 yr |
|---|---|---|---|---|
| Explicit Euler | 1 | no | 2.1e-02 | 8.0e-02 |
| Runge-Kutta 4 | 4 | no | 2.5e-09 | 2.6e-08 |
| Velocity Verlet (KDK) | 2 | yes | 6.3e-07 | 3.3e-08 |
| Yoshida 4 | 4 | yes | 2.2e-09 | 1.4e-11 |

RK4 is fourth order and commits less error per step than second-order
Verlet. Its error nevertheless *grows*, while Verlet's oscillates without
accumulating. Symplectic integrators preserve the geometric structure of the
Hamiltonian flow, so energy stays bounded near its initial value rather than
drifting. For long integrations that property matters more than the order of
convergence.

## Orbits are ellipses, even when they look circular

| Body | Eccentricity | Flattening b/a | Perihelion - aphelion |
|---|---|---|---|
| Venus | 0.00678 | 0.99998 | 0.72 - 0.73 AU |
| Earth | 0.01671 | 0.99986 | 0.98 - 1.02 AU |
| Mars | 0.09339 | 0.99563 | 1.38 - 1.67 AU |
| Mercury | 0.20564 | 0.97863 | 0.31 - 0.47 AU |
| Pluto | 0.24883 | 0.96855 | 29.7 - 49.3 AU |
| Halley | 0.96714 | 0.25424 | 0.59 - 35.1 AU |

Earth's orbital ellipse is 0.014% flatter than a circle. No display resolves
that. What identifies it as an ellipse is not its shape but the Sun sitting
at a focus, offset by `a·e`. The simulator therefore draws full osculating
ellipses with perihelion and aphelion marked, and includes comets, where the
eccentricity needs no measurement to be seen.

## Capture criterion

The subtlest bug in the project lived here, and it is worth documenting
because it is easy to write and hard to see.

The original code asked whether a body is *currently* inside the capture
radius. That fails twice over. First, between two consecutive steps a fast
body traverses the entire horizon and exits the far side unrecorded. Second,
and worse, applying the gravitational-focusing formula with the *local*
velocity rather than the velocity at infinity makes the capture radius shrink
precisely as the infalling body speeds up. It can be shown that under that
formulation nothing is ever captured, at any mass.

The correct criterion does not ask where the body is but where it is going.
The pericentre of the encounter orbit is

```
e   = sqrt(1 + 2·E·L² / mu²)
r_p = (L² / mu) / (1 + e)
```

and capture occurs when `r_p` falls inside the innermost stable circular
orbit of the Schwarzschild metric, at `3·r_s`. No stable orbit exists inside
that radius, so infall to the horizon is unavoidable.

| Black hole | Critical radius 3r_s | Planets consumed |
|---|---|---|
| 10 M☉ | 5.9e-7 AU (89 km) | none |
| 1000 M☉ | 5.9e-5 AU | none |
| 4.3e6 M☉ (Sgr A*) | 0.255 AU | all eight, and the Sun |

A ten-solar-mass black hole has a 30 km event horizon. On Solar System
scales it is a mathematical point: it does not swallow the system, it
destroys it by driving planets onto unbound trajectories.

## Numerical stability

With a fixed timestep the simulation diverges as soon as a close encounter
occurs: acceleration spikes, position overflows, and within a few steps the
entire state is NaN. This is the classic failure mode of fixed-step
integrators, and a test documents it deliberately.

The fix is to subdivide the step according to the local dynamical timescale:

```
dt = eta · min( |v|/|a| ,  sqrt(r³ / (G·(m_i + m_j))) )
```

The first term is the time over which gravity appreciably changes the
velocity; the second is the free-fall time between the two closest bodies.
With `eta = 0.02` this yields roughly 300 steps per orbit.

Two safety nets sit on top: a maximum substep budget per call, so a violent
encounter slows the simulation rather than hanging it, and a sweep that
retires bodies whose state has stopped being finite, since a single NaN
contaminates every other body through the accelerations in one step.

Verified: 240,000 target steps with a 10 M☉ black hole crossing the system
resolve into 714,000 substeps with no NaN and no bodies lost.

## Physics implemented

- Newtonian N-body gravity, pairwise, with Newton's third law enforced by construction
- First post-Newtonian correction (Einstein-Infeld-Hoffmann, dominant-central-body form)
- Solar oblateness, zonal harmonic J2 = 2.2e-7
- Osculating orbital elements via the Laplace-Runge-Lenz vector
- Schwarzschild radius, innermost stable circular orbit, Roche limit, Hill radius
- Momentum-conserving accretion with accounting of dissipated energy
- Optional Plummer softening
- Stellar parallax computed from true catalogue distances

Initial conditions are generated from the JPL J2000 Keplerian element set by
solving Kepler's equation with Newton-Raphson: eight planets, five dwarf
planets, three major asteroids and two periodic comets, in three dimensions,
in the barycentric frame.

## Layout

```
core/       physics, no graphics dependencies, WASM-ready
  units.hpp       AU / day / solar-mass units, Gaussian G, c, r_s
  state.*         SoA state, energies and momenta
  forces.*        Newtonian gravity, 1PN correction, J2
  integrator.*    Euler, RK4, Verlet KDK, Yoshida 4, adaptive stepping
  ephemeris.*     J2000 Keplerian elements to state vectors
  analysis.*      orbital elements and precession rate
  blackhole.*     horizon, pericentre capture, tidal disruption
app/        native window (raylib)
web/        simulador.html, single self-contained file, same physics in JS
tests/      31 validation cases, 40-line in-house framework
bench/      headless runs and the energy-drift plot
```

The universe state is a flat struct of arrays, fully decoupled from
rendering. Resetting means reloading the scenario; saving means serialising
the struct.

## Build

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j
./build/gl_tests     # 31 validation cases
./build/gl_bench     # writes energy_drift.csv
```

The interactive simulator needs no build at all: open `web/simulador.html`
in any browser. Single file, no dependencies, no server.

CI compiles the project and runs the full validation suite on every push.

## Known limitations

- Fixed target timestep with adaptive subdivision; block timesteps in powers of two would preserve symplecticity through close encounters more cleanly.
- The 1PN term is applied only relative to the dominant central body, not in the full pairwise EIH formulation.
- The Moon is folded into Earth as a single body at the Earth-Moon barycentre.
- No asteroids beyond the three largest, no radiation pressure. This accounts for the 0.9% gap between the 526.6 arcsec/century measured here and the 531.5 of the literature.
- The browser build uses orthographic projection onto the ecliptic rather than a full 3D renderer.
- The background sky is a 28-star catalogue with real J2000 coordinates, magnitudes, distances and spectral colours, plus synthetic filler. Parallax is computed from true distances and is therefore sub-pixel, as it should be; an exaggeration control makes it visible.

## Author

Diego Macías Vega — [github.com/didimacveg](https://github.com/didimacveg)

## License

MIT. See [LICENSE](LICENSE).
