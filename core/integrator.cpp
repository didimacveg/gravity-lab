#include "integrator.hpp"
#include <cmath>
#include <vector>

namespace gl {

static void verletKDK(World& w, double dt, const ForceConfig& cfg) {
    const std::size_t n = w.size();
    for (std::size_t i = 0; i < n; ++i)
        if (w.alive[i]) w.velocity[i] += w.acceleration[i] * (0.5 * dt);
    for (std::size_t i = 0; i < n; ++i)
        if (w.alive[i]) w.position[i] += w.velocity[i] * dt;
    computeAccelerations(w, cfg);
    for (std::size_t i = 0; i < n; ++i)
        if (w.alive[i]) w.velocity[i] += w.acceleration[i] * (0.5 * dt);
    w.time += dt;
}

static void explicitEuler(World& w, double dt, const ForceConfig& cfg) {
    computeAccelerations(w, cfg);
    const std::size_t n = w.size();
    for (std::size_t i = 0; i < n; ++i) {
        if (!w.alive[i]) continue;
        w.position[i] += w.velocity[i] * dt;
        w.velocity[i] += w.acceleration[i] * dt;
    }
    w.time += dt;
}

static void rk4(World& w, double dt, const ForceConfig& cfg) {
    const std::size_t n = w.size();
    const std::vector<Vec3> x0 = w.position, v0 = w.velocity;
    std::vector<Vec3> kx[4], kv[4];

    for (int s = 0; s < 4; ++s) {
        if (s > 0) {
            const double f = (s < 3) ? 0.5 * dt : dt;
            for (std::size_t i = 0; i < n; ++i) {
                w.position[i] = x0[i] + kx[s - 1][i] * f;
                w.velocity[i] = v0[i] + kv[s - 1][i] * f;
            }
        }
        computeAccelerations(w, cfg);
        kx[s] = w.velocity;
        kv[s] = w.acceleration;
    }

    for (std::size_t i = 0; i < n; ++i) {
        if (!w.alive[i]) continue;
        w.position[i] = x0[i] + (kx[0][i] + kx[1][i] * 2.0 + kx[2][i] * 2.0 +
                                 kx[3][i]) * (dt / 6.0);
        w.velocity[i] = v0[i] + (kv[0][i] + kv[1][i] * 2.0 + kv[2][i] * 2.0 +
                                 kv[3][i]) * (dt / 6.0);
    }
    computeAccelerations(w, cfg);
    w.time += dt;
}

void step(World& w, double dt, Integrator method, const ForceConfig& cfg) {
    switch (method) {
        case Integrator::ExplicitEuler: explicitEuler(w, dt, cfg); return;
        case Integrator::VerletKDK:     verletKDK(w, dt, cfg); return;
        case Integrator::RK4:           rk4(w, dt, cfg); return;
        case Integrator::Yoshida4: {
            // Composicion de Yoshida: tres pasos de Verlet, el central
            // con signo NEGATIVO. Cancela el error de tercer orden y deja
            // un metodo de cuarto orden que sigue siendo simplectico.
            const double cbrt2 = std::cbrt(2.0);
            const double w1 = 1.0 / (2.0 - cbrt2);
            const double w0 = -cbrt2 * w1;
            const double t0 = w.time;
            verletKDK(w, w1 * dt, cfg);
            verletKDK(w, w0 * dt, cfg);
            verletKDK(w, w1 * dt, cfg);
            w.time = t0 + dt;  // los tres sub-pasos suman dt exacto
            return;
        }
    }
}

}  // namespace gl
