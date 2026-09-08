// Corridas headless que generan los CSV de las graficas del README.
// IMPLEMENTADO: es fontaneria de medida.
//   ./gl_bench            -> bench/out/energy_drift.csv
#include <cmath>
#include <cstdio>
#include <fstream>
#include "../core/integrator.hpp"
#include "../core/ephemeris.hpp"

using namespace gl;

static const char* nameOf(Integrator m) {
    switch (m) {
        case Integrator::ExplicitEuler: return "euler";
        case Integrator::RK4: return "rk4";
        case Integrator::VerletKDK: return "verlet";
        case Integrator::Yoshida4: return "yoshida4";
    }
    return "?";
}

int main() {
    std::ofstream out("energy_drift.csv");
    out << "integrador,dias,error_relativo_energia\n";

    const Integrator methods[] = {Integrator::ExplicitEuler, Integrator::RK4,
                                  Integrator::VerletKDK, Integrator::Yoshida4};
    const double dt = 0.5;
    const int steps = 73050;  // 100 anios

    for (Integrator m : methods) {
        World w = makeSolarSystemJ2000();
        ForceConfig cfg;
        computeAccelerations(w, cfg);
        const double e0 = computeDiagnostics(w).totalEnergy;
        for (int i = 0; i < steps; ++i) {
            step(w, dt, m, cfg);
            if (i % 100 == 0) {
                const double e = computeDiagnostics(w).totalEnergy;
                out << nameOf(m) << "," << i * dt << ","
                    << std::fabs((e - e0) / e0) << "\n";
            }
        }
        std::printf("%-10s listo\n", nameOf(m));
    }
    std::printf("escrito energy_drift.csv\n");
    return 0;
}
