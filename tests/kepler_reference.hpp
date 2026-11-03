#pragma once
// Analytic two-body reference shared by the validation tests and the
// convergence benchmark.
//
// Why a separate header and not core/scenario: makeEllipticTwoBody() puts a
// MASSLESS probe around a fixed star, which is perfect for precession tests
// but useless for energy and momentum checks (a massless body carries neither).
// Here both bodies have mass, the system starts in the barycentric frame, and
// every conserved quantity has a closed form to compare against.
#include <cmath>
#include "../core/state.hpp"
#include "../core/units.hpp"

namespace gl::reference {

struct Binary {
    double a;   // semi-major axis of the RELATIVE orbit, AU
    double e;   // eccentricity
    double M;   // primary mass, solar masses
    double m;   // secondary mass, solar masses

    double mu() const { return G * (M + m); }
    double reducedMass() const { return M * m / (M + m); }
    // Kepler's third law, two-body form: T = 2*pi*sqrt(a^3 / (G (M + m)))
    double period() const { return 2.0 * M_PI * std::sqrt(a * a * a / mu()); }
    // E = -G M m / (2a)
    double energy() const { return -G * M * m / (2.0 * a); }
    // |L| = mu_red * sqrt(G (M+m) a (1 - e^2)), barycentric frame
    double angularMomentum() const {
        return reducedMass() * std::sqrt(mu() * a * (1.0 - e * e));
    }
};

// Both bodies at periapsis, orbit in the XY plane, barycentre at rest at the
// origin. Accelerations are NOT computed: callers do that, as with any World.
inline World makeBinary(const Binary& b) {
    const double rp = b.a * (1.0 - b.e);
    const double vp = std::sqrt(b.mu() * (1.0 + b.e) / rp);  // vis-viva at periapsis
    const double fM = b.m / (b.M + b.m), fm = b.M / (b.M + b.m);
    World w;
    w.add("primary", BodyKind::Star, b.M, 0.0, Vec3{-fM * rp, 0, 0}, Vec3{0, -fM * vp, 0});
    w.add("secondary", BodyKind::Planet, b.m, 0.0, Vec3{fm * rp, 0, 0}, Vec3{0, fm * vp, 0});
    return w;
}

// Exact relative position (secondary minus primary) at time t after
// periapsis: mean anomaly n t, Kepler's equation M = E - e sin E solved by
// Newton-Raphson to machine precision.
inline Vec3 relativePosition(const Binary& b, double t) {
    const double n = 2.0 * M_PI / b.period();
    double meanAnomaly = std::fmod(n * t, 2.0 * M_PI);
    double E = b.e < 0.8 ? meanAnomaly : M_PI;
    for (int i = 0; i < 50; ++i) {
        const double dE = (E - b.e * std::sin(E) - meanAnomaly) / (1.0 - b.e * std::cos(E));
        E -= dE;
        if (std::fabs(dE) < 1e-15) break;
    }
    return {b.a * (std::cos(E) - b.e), b.a * std::sqrt(1.0 - b.e * b.e) * std::sin(E), 0.0};
}

}  // namespace gl::reference
