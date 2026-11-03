// Error versus integration step, for every integrator.
//
//   ./build/gl_convergence [output.csv]      (default: convergence.csv)
//
// Two scenarios, because they answer different questions:
//
//   binary  Two bodies, a = 1 AU, e = 0.6, mass ratio 1e-3, 10 orbits.
//           There is an exact solution, so the POSITION error is measured
//           against Kepler's equation, not against another simulation.
//   solar   The J2000 Solar System (Sun + 8 planets, 3D), 100 years. No
//           closed form; energy and angular momentum are the references, and
//           Earth's position is compared with a Yoshida run at dt = 1/32 d.
//
// For each (scenario, integrator, dt) the CSV records the maximum relative
// energy error over the run, the final relative angular-momentum error, the
// relative position error, the number of force evaluations (the honest
// measure of cost: RK4 and Yoshida pay 4 and 3 per step, Verlet 1) and the
// wall-clock time. bench/plot_convergence.py turns it into the README plots.
#include <chrono>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <string>
#include "../core/ephemeris.hpp"
#include "../core/integrator.hpp"
#include "../tests/kepler_reference.hpp"

using namespace gl;

namespace {

struct Method { Integrator id; const char* name; int forceEvalsPerStep; };
const Method kMethods[] = {
    {Integrator::ExplicitEuler, "euler", 1},
    {Integrator::VerletKDK, "verlet", 1},
    {Integrator::RK4, "rk4", 4},
    {Integrator::Yoshida4, "yoshida4", 3},
};

struct Row {
    double maxEnergyError = 0.0;
    double angularMomentumError = 0.0;
    double positionError = 0.0;
    double wallMs = 0.0;
    long steps = 0;
};

double relErr(double now, double ref) { return std::fabs((now - ref) / ref); }

// Runs `steps` fixed steps of size dt, sampling diagnostics `samples` times.
template <class Finish>
Row run(World w, const Method& m, double dt, long steps, Finish finish) {
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    const Diagnostics d0 = computeDiagnostics(w);
    const long every = std::max(1L, steps / 2000);
    Row r;
    r.steps = steps;
    const auto t0 = std::chrono::steady_clock::now();
    for (long i = 1; i <= steps; ++i) {
        step(w, dt, m.id, cfg);
        if (i % every == 0 || i == steps) {
            const double e = relErr(computeDiagnostics(w).totalEnergy, d0.totalEnergy);
            r.maxEnergyError = std::isfinite(e) ? std::fmax(r.maxEnergyError, e) : INFINITY;
        }
    }
    r.wallMs = std::chrono::duration<double, std::milli>(
                   std::chrono::steady_clock::now() - t0).count();
    const Diagnostics d1 = computeDiagnostics(w);
    r.angularMomentumError =
        (d1.angularMomentum - d0.angularMomentum).norm() / d0.angularMomentum.norm();
    r.positionError = finish(w);
    return r;
}

}  // namespace

int main(int argc, char** argv) {
    const std::string path = argc > 1 ? argv[1] : "convergence.csv";
    std::ofstream out(path);
    out << "scenario,integrator,dt_days,steps_per_orbit,max_rel_energy_error,"
           "rel_angular_momentum_error,rel_position_error,force_evaluations,wall_ms\n";
    out.precision(6);

    auto emit = [&](const char* scenario, const Method& m, double dt, double spo,
                    const Row& r) {
        out << scenario << ',' << m.name << ',' << dt << ',' << spo << ','
            << std::scientific << r.maxEnergyError << ',' << r.angularMomentumError << ','
            << r.positionError << std::defaultfloat << ','
            << r.steps * m.forceEvalsPerStep << ',' << r.wallMs << '\n';
    };

    // --- binary: exact reference -------------------------------------------
    const reference::Binary b{1.0, 0.6, 1.0, 1e-3};
    const int orbits = 10;
    for (const Method& m : kMethods) {
        for (int spo = 50; spo <= 25600; spo *= 2) {
            const double dt = b.period() / spo;
            const long steps = static_cast<long>(spo) * orbits;
            const Row r = run(reference::makeBinary(b), m, dt, steps, [&](const World& w) {
                const Vec3 exact = reference::relativePosition(b, dt * steps);
                const Vec3 sim = w.position[1] - w.position[0];
                const double e = (sim - exact).norm() / b.a;
                return std::isfinite(e) ? e : INFINITY;
            });
            emit("binary", m, dt, spo, r);
        }
        std::printf("binary  %-9s done\n", m.name);
    }

    // --- solar: 100 years, numerical reference ------------------------------
    const double years = 100.0, days = years * 365.25;
    const int earth = 3;
    World ref = makeSolarSystemJ2000();
    {
        ForceConfig cfg;
        computeAccelerations(ref, cfg);
        const double dtRef = 1.0 / 32.0;
        const long n = static_cast<long>(std::llround(days / dtRef));
        for (long i = 0; i < n; ++i) step(ref, dtRef, Integrator::Yoshida4, cfg);
    }
    const Vec3 earthRef = ref.position[earth] - ref.position[0];
    for (const Method& m : kMethods) {
        for (double dt = 8.0; dt >= 0.125; dt /= 2.0) {
            const long steps = static_cast<long>(std::llround(days / dt));
            const Row r = run(makeSolarSystemJ2000(), m, dt, steps, [&](const World& w) {
                const Vec3 sim = w.position[earth] - w.position[0];
                const double e = (sim - earthRef).norm() / earthRef.norm();
                return std::isfinite(e) ? e : INFINITY;
            });
            // steps per orbit of Mercury, the fastest body: what limits dt
            emit("solar", m, dt, 87.9691 / dt, r);
        }
        std::printf("solar   %-9s done\n", m.name);
    }
    std::printf("wrote %s\n", path.c_str());
    return 0;
}
