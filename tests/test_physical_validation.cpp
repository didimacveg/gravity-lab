// Physical validation: conservation laws and Kepler's third law measured on
// SIMULATED orbits, not on tabulated numbers.
//
// What each block proves, and why it is not redundant with the older tests:
//
//  1. The diagnostics themselves are right. Every other check divides by
//     E or |L|; if computeDiagnostics() were wrong, the conservation tests
//     would be measuring the wrong thing very precisely.
//  2. Each integrator converges at its theoretical order (1, 2, 4, 4)
//     against the exact Kepler solution. A wrong Yoshida coefficient still
//     conserves energy reasonably; it does NOT converge at order 4.
//  3. Energy: symplectic methods keep the error bounded on an eccentric orbit
//     (e = 0.6) for 200 orbits, with the error shrinking as dt^p; RK4 drifts
//     secularly.
//  4. Angular and linear momentum are conserved to round-off by the
//     symplectic integrators on the full 3D J2000 system with minor bodies,
//     because pairwise central forces conserve them step by step.
//  5. Kepler's third law: periods measured from the simulation match
//     T = 2*pi*sqrt(a^3 / G(M+m)) for binaries of very different shape, and
//     the observed sidereal periods of the eight planets match the tables,
//     with tolerances that are explained, not tuned to pass.
#include <cmath>
#include <cstdio>
#include "../core/ephemeris.hpp"
#include "../core/integrator.hpp"
#include "../core/units.hpp"
#include "expected_values.hpp"
#include "kepler_reference.hpp"
#include "microtest.hpp"

using namespace gl;
using reference::Binary;

namespace {

Vec3 relative(const World& w) { return w.position[1] - w.position[0]; }

// Integrates `orbits` full periods with `stepsPerOrbit` fixed steps and
// returns the relative position error |r_sim - r_exact| / a.
double positionError(Integrator m, const Binary& b, int stepsPerOrbit, int orbits) {
    World w = reference::makeBinary(b);
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    const double dt = b.period() / stepsPerOrbit;
    for (int i = 0; i < stepsPerOrbit * orbits; ++i) step(w, dt, m, cfg);
    const Vec3 exact = reference::relativePosition(b, dt * stepsPerOrbit * orbits);
    return (relative(w) - exact).norm() / b.a;
}

// Observed convergence order: log2(err(dt) / err(dt/2)).
double observedOrder(Integrator m, const Binary& b, int stepsPerOrbit) {
    return std::log2(positionError(m, b, stepsPerOrbit, 1) /
                     positionError(m, b, 2 * stepsPerOrbit, 1));
}

struct EnergyHistory {
    double maxFirstHalf = 0.0;   // max |dE/E| over the first half of the run
    double maxSecondHalf = 0.0;  // ... and over the second half
    double atMidpoint = 0.0;
    double atEnd = 0.0;
};

EnergyHistory energyHistory(Integrator m, const Binary& b, int stepsPerOrbit, int orbits) {
    World w = reference::makeBinary(b);
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    const double e0 = computeDiagnostics(w).totalEnergy;
    const double dt = b.period() / stepsPerOrbit;
    const int total = stepsPerOrbit * orbits;
    EnergyHistory h;
    for (int i = 1; i <= total; ++i) {
        step(w, dt, m, cfg);
        const double err = std::fabs((computeDiagnostics(w).totalEnergy - e0) / e0);
        if (i <= total / 2) h.maxFirstHalf = std::fmax(h.maxFirstHalf, err);
        else h.maxSecondHalf = std::fmax(h.maxSecondHalf, err);
        if (i == total / 2) h.atMidpoint = err;
        if (i == total) h.atEnd = err;
    }
    return h;
}

// Times of successive periapsis passages, from the sign change of the radial
// velocity r.v (negative while approaching, positive after), interpolated
// linearly inside the step.
double measuredPeriod(Integrator m, const Binary& b, int stepsPerOrbit, int orbits) {
    World w = reference::makeBinary(b);
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    const double dt = b.period() / stepsPerOrbit;
    auto radial = [&] { return relative(w).dot(w.velocity[1] - w.velocity[0]); };
    double prev = radial(), first = -1.0, last = -1.0;
    int passages = 0;
    for (int i = 1; i <= stepsPerOrbit * (orbits + 1); ++i) {
        step(w, dt, m, cfg);
        const double now = radial();
        if (prev < 0.0 && now >= 0.0) {
            const double t = w.time - dt + dt * (-prev) / (now - prev);
            if (first < 0.0) first = t;
            last = t;
            ++passages;
        }
        prev = now;
    }
    // The run starts AT periapsis, so the first detected passage is the end
    // of orbit 1. Averaging over several orbits cancels interpolation noise.
    return passages > 1 ? (last - first) / (passages - 1) : -1.0;
}

}  // namespace

// --- 1. The diagnostics are right -------------------------------------------

TEST(diagnostics_match_the_closed_form_energy_and_angular_momentum) {
    const Binary b{1.0, 0.6, 1.0, 1e-3};
    const Diagnostics d = computeDiagnostics(reference::makeBinary(b));
    ASSERT_NEAR(d.totalEnergy / b.energy(), 1.0, 1e-13);
    ASSERT_NEAR(d.angularMomentum.norm() / b.angularMomentum(), 1.0, 1e-13);
    ASSERT_NEAR(d.linearMomentum.norm(), 0.0, 1e-18);
}

TEST(the_analytic_reference_reproduces_itself_after_one_period) {
    // Guards the reference: Kepler's equation solved wrongly would make every
    // convergence measurement below meaningless.
    const Binary b{1.0, 0.9, 1.0, 1e-3};
    const Vec3 start = reference::relativePosition(b, 0.0);
    const Vec3 after = reference::relativePosition(b, b.period());
    ASSERT_NEAR((after - start).norm(), 0.0, 1e-12);
    ASSERT_NEAR(start.x, b.a * (1.0 - b.e), 1e-15);  // starts at periapsis
}

// --- 2. Convergence order against the exact solution ------------------------

TEST(each_integrator_converges_at_its_theoretical_order) {
    // e = 0.3, one orbit, halving dt from 800 to 1600 steps per orbit.
    // Measured: Euler 0.92 (tends to 1 from below: still pre-asymptotic),
    // Verlet 2.00, RK4 4.06, Yoshida 4.00.
    const Binary b{1.0, 0.3, 1.0, 1e-3};
    ASSERT_NEAR(observedOrder(Integrator::ExplicitEuler, b, 800), 1.0, 0.15);
    ASSERT_NEAR(observedOrder(Integrator::VerletKDK, b, 800), 2.0, 0.05);
    ASSERT_NEAR(observedOrder(Integrator::RK4, b, 800), 4.0, 0.15);
    ASSERT_NEAR(observedOrder(Integrator::Yoshida4, b, 800), 4.0, 0.05);
}

// --- 3. Energy ---------------------------------------------------------------

TEST(symplectic_energy_error_is_bounded_on_an_eccentric_orbit) {
    // 200 orbits at e = 0.6. A symplectic method's error oscillates within
    // each orbit (largest at periapsis) but its envelope does not grow: the
    // worst error in the second hundred orbits is no worse than in the first.
    const Binary b{1.0, 0.6, 1.0, 1e-3};
    for (Integrator m : {Integrator::VerletKDK, Integrator::Yoshida4}) {
        const EnergyHistory h = energyHistory(m, b, 1000, 200);
        ASSERT(h.maxSecondHalf < 1.1 * h.maxFirstHalf);
    }
    const EnergyHistory verlet = energyHistory(Integrator::VerletKDK, b, 1000, 200);
    const EnergyHistory yoshida = energyHistory(Integrator::Yoshida4, b, 1000, 200);
    // Measured at 1000 steps per orbit: Verlet 2.9e-4, Yoshida 1.6e-7.
    ASSERT(verlet.maxSecondHalf < 1e-3);
    ASSERT(yoshida.maxSecondHalf < 5e-7);
}

TEST(rk4_energy_error_grows_secularly) {
    // Same orbit, same step. RK4's error per step is tiny but has a sign: it
    // accumulates, so doubling the run roughly doubles the error.
    const Binary b{1.0, 0.6, 1.0, 1e-3};
    const EnergyHistory h = energyHistory(Integrator::RK4, b, 1000, 200);
    ASSERT(h.atEnd > 1.8 * h.atMidpoint);
}

TEST(symplectic_energy_error_shrinks_as_dt_to_the_order) {
    // The bounded error is not a constant: it scales as dt^2 for Verlet and
    // dt^4 for Yoshida. Halving dt must cut it by ~4x and ~16x.
    const Binary b{1.0, 0.6, 1.0, 1e-3};
    const double v1 = energyHistory(Integrator::VerletKDK, b, 1000, 4).maxSecondHalf;
    const double v2 = energyHistory(Integrator::VerletKDK, b, 2000, 4).maxSecondHalf;
    const double y1 = energyHistory(Integrator::Yoshida4, b, 1000, 4).maxSecondHalf;
    const double y2 = energyHistory(Integrator::Yoshida4, b, 2000, 4).maxSecondHalf;
    ASSERT_NEAR(std::log2(v1 / v2), 2.0, 0.2);
    ASSERT_NEAR(std::log2(y1 / y2), 4.0, 0.3);
}

// --- 4. Angular and linear momentum -----------------------------------------

TEST(symplectic_integrators_conserve_angular_momentum_to_round_off) {
    // Full J2000 system in 3D with dwarf planets, asteroids and comets,
    // 50 years at dt = 0.5 d. Verlet's kick and drift each conserve L exactly
    // for pairwise central forces, so what remains is floating-point noise:
    // measured 5e-15 (Verlet) and 2e-14 (Yoshida). RK4 does not have this
    // property: 7e-11 over the same run.
    auto worstDrift = [](Integrator m) {
        World w = makeSolarSystemJ2000(true);
        ForceConfig cfg;
        computeAccelerations(w, cfg);
        const Diagnostics d0 = computeDiagnostics(w);
        double worstL = 0.0, worstP = 0.0;
        for (int i = 1; i <= 36525; ++i) {
            step(w, 0.5, m, cfg);
            if (i % 500 == 0) {
                const Diagnostics d = computeDiagnostics(w);
                worstL = std::fmax(worstL, (d.angularMomentum - d0.angularMomentum).norm() /
                                               d0.angularMomentum.norm());
                worstP = std::fmax(worstP, d.linearMomentum.norm());
            }
        }
        return std::make_pair(worstL, worstP);
    };
    const auto verlet = worstDrift(Integrator::VerletKDK);
    const auto yoshida = worstDrift(Integrator::Yoshida4);
    const auto rk4 = worstDrift(Integrator::RK4);
    ASSERT(verlet.first < 1e-13);    // the whole VECTOR, not only its norm
    ASSERT(yoshida.first < 1e-13);
    ASSERT(rk4.first > 100.0 * verlet.first);
    // Barycentric frame: total momentum starts at zero and must stay there.
    ASSERT(verlet.second < 1e-17);
    ASSERT(yoshida.second < 1e-17);
}

// --- 5. Kepler's third law ---------------------------------------------------

TEST(kepler_third_law_holds_for_simulated_binaries) {
    // Periods measured from periapsis passages over 5 orbits, for orbits from
    // near-circular to e = 0.9 and a mass ratio that is not negligible.
    //
    // The comet-like orbit needs 4x more fixed steps: almost all of its
    // dynamics happens in a short periapsis passage. At 4000 steps per orbit
    // its period is off by 1.4e-5; at 8000, 9.0e-7; at 16000, 5.6e-8 — the
    // 16x per halving that a fourth-order method must show. The other orbits
    // agree to ~1e-11 already at 4000.
    struct Case { Binary b; int stepsPerOrbit; double tol; };
    const Case cases[] = {
        {{0.387, 0.206, 1.0, 1.66e-7}, 4000, 1e-9},  // Mercury-like
        {{1.0, 0.0167, 1.0, 3.0e-6}, 4000, 1e-9},    // Earth-like
        {{5.2, 0.048, 1.0, 9.5e-4}, 4000, 1e-9},     // Jupiter-like
        {{2.0, 0.5, 1.0, 0.1}, 4000, 1e-9},          // heavy companion: M + m matters
        {{1.0, 0.9, 1.0, 1e-3}, 16000, 1e-7},        // comet-like, strongly eccentric
    };
    for (const Case& c : cases) {
        const double T = measuredPeriod(Integrator::Yoshida4, c.b, c.stepsPerOrbit, 5);
        ASSERT_NEAR(T / c.b.period(), 1.0, c.tol);
    }
    // And the law is T^2 / a^3 = 4 pi^2 / G(M+m): check the heavy case
    // against the light one explicitly, so a missing "+ m" cannot hide.
    const Binary light{2.0, 0.5, 1.0, 1e-9}, heavy{2.0, 0.5, 1.0, 0.1};
    const double ratio = measuredPeriod(Integrator::Yoshida4, light, 4000, 5) /
                         measuredPeriod(Integrator::Yoshida4, heavy, 4000, 5);
    ASSERT_NEAR(ratio, std::sqrt(1.1), 1e-9);
}

TEST(simulated_planetary_periods_match_the_observed_sidereal_periods) {
    // J2000 initial conditions, all eight planets interacting, Yoshida 4 at
    // dt = 0.5 d. The sidereal period is the time for the heliocentric
    // position to sweep 360 degrees in its own orbital plane.
    //
    // Tolerances are physical, not numerical (the integrator error at this
    // dt is < 1e-9). Inner planets agree to ~2e-5. The giants deviate more
    // because one orbit of a planet in a perturbed system is not the mean
    // period the tables quote: Jupiter and Saturn exchange angular momentum
    // in the 5:2 near-resonance (the "great inequality"), and Saturn's
    // instantaneous period over the 2000-2029 orbit is 0.7% shorter than the
    // mean. Measured: Mercury 1.3e-6, Venus 1.6e-5, Earth 1.2e-5,
    // Mars 2.3e-5, Jupiter 6.6e-4, Saturn 6.9e-3, Uranus 3.2e-3,
    // Neptune 1.5e-3.
    struct Row { double period, a, mass, tol; };
    const Row rows[] = {
        {expected::PERIOD_MERCURY, 0.38709927, 1.66012e-7, 1e-4},
        {expected::PERIOD_VENUS,   0.72333566, 2.44784e-6, 1e-4},
        {expected::PERIOD_EARTH,   1.00000261, 3.04043e-6, 1e-4},
        {expected::PERIOD_MARS,    1.52371034, 3.22715e-7, 1e-4},
        {expected::PERIOD_JUPITER, 5.20288700, 9.54792e-4, 2e-3},
        {expected::PERIOD_SATURN,  9.53667594, 2.85886e-4, 1e-2},
        {expected::PERIOD_URANUS, 19.18916464, 4.36624e-5, 5e-3},
        {expected::PERIOD_NEPTUNE, 30.06992276, 5.15139e-5, 5e-3},
    };
    World w = makeSolarSystemJ2000();
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    const double dt = 0.5;
    double swept[9] = {0}, period[9] = {0};
    Vec3 prev[9];
    for (int i = 1; i <= 8; ++i) prev[i] = w.position[i] - w.position[0];
    int pending = 8;
    for (int s = 0; s < 130000 && pending > 0; ++s) {
        step(w, dt, Integrator::Yoshida4, cfg);
        for (int i = 1; i <= 8; ++i) {
            if (period[i] > 0.0) continue;
            const Vec3 r = w.position[i] - w.position[0];
            const double angle = std::atan2(prev[i].cross(r).norm(), prev[i].dot(r));
            if (swept[i] + angle >= 2.0 * M_PI) {
                period[i] = w.time - dt + dt * (2.0 * M_PI - swept[i]) / angle;
                --pending;
            }
            swept[i] += angle;
            prev[i] = r;
        }
    }
    ASSERT(pending == 0);
    for (int i = 1; i <= 8; ++i) {
        const Row& r = rows[i - 1];
        ASSERT_NEAR(period[i] / r.period, 1.0, r.tol);
        // Third law in normalised form: T^2 G (M+m) / (4 pi^2 a^3) = 1.
        const double kepler = period[i] * period[i] * G * (1.0 + r.mass) /
                              (4.0 * M_PI * M_PI * r.a * r.a * r.a);
        ASSERT_NEAR(kepler, 1.0, 2.0 * r.tol);
    }
}
