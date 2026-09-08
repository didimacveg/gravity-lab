#include "blackhole.hpp"
#include <cmath>
#include "units.hpp"

namespace gl {

double schwarzschildRadius(double massSolar) {
    return 2.0 * G * massSolar / (C_LIGHT * C_LIGHT);
}

double rocheLimit(double holeMass, double bodyMass, double bodyRadius) {
    if (bodyMass <= 0.0) return 0.0;
    return bodyRadius * std::cbrt(2.0 * holeMass / bodyMass);
}

double captureRadius(double holeMass, double relativeSpeed) {
    const double rs = schwarzschildRadius(holeMass);
    if (relativeSpeed <= 0.0) return rs;
    // Enfoque gravitatorio: b_max^2 = rs^2 (1 + 2GM/(rs v^2))
    const double focus = 1.0 + 2.0 * G * holeMass /
                                   (rs * relativeSpeed * relativeSpeed);
    return rs * std::sqrt(focus);
}

void processCaptures(World& w, std::size_t holeIndex,
                     const BlackHoleConfig& cfg) {
    if (holeIndex >= w.size() || !w.alive[holeIndex]) return;

    for (std::size_t i = 0; i < w.size(); ++i) {
        if (i == holeIndex || !w.alive[i]) continue;

        const Vec3 d = w.position[i] - w.position[holeIndex];
        const Vec3 dv = w.velocity[i] - w.velocity[holeIndex];
        const double rc = cfg.useGravitationalFocusing
                              ? captureRadius(w.mass[holeIndex], dv.norm())
                              : schwarzschildRadius(w.mass[holeIndex]);
        if (d.norm() > rc) continue;

        // Energia antes de la absorcion, para saber cuanta desaparece.
        const double eBefore =
            0.5 * w.mass[holeIndex] * w.velocity[holeIndex].normSquared() +
            0.5 * w.mass[i] * w.velocity[i].normSquared();

        // Momento lineal conservado EXACTAMENTE por construccion.
        const double M = w.mass[holeIndex] + w.mass[i];
        const Vec3 p = w.velocity[holeIndex] * w.mass[holeIndex] +
                       w.velocity[i] * w.mass[i];
        w.velocity[holeIndex] = p * (1.0 / M);
        w.mass[holeIndex] = M;
        w.alive[i] = 0;

        const double eAfter = 0.5 * M * w.velocity[holeIndex].normSquared();
        w.absorbedEnergy += eBefore - eAfter;
    }
}

void processTidalDisruption(World& w, std::size_t holeIndex,
                            const BlackHoleConfig& cfg) {
    if (!cfg.enableTidalDisruption || holeIndex >= w.size()) return;
    for (std::size_t i = 0; i < w.size(); ++i) {
        if (i == holeIndex || !w.alive[i]) continue;
        if (w.kind[i] == BodyKind::Fragment || w.radius[i] <= 0.0) continue;
        const double d = (w.position[i] - w.position[holeIndex]).norm();
        if (d > rocheLimit(w.mass[holeIndex], w.mass[i], w.radius[i])) continue;

        // Reparte el cuerpo en fragmentos sobre un anillo, conservando
        // masa, posicion del centro de masas y momento.
        const int nf = cfg.fragmentsPerBody;
        const double fm = w.mass[i] / nf;
        for (int k = 0; k < nf; ++k) {
            const double th = 2.0 * M_PI * k / nf;
            const Vec3 off{w.radius[i] * std::cos(th),
                           w.radius[i] * std::sin(th), 0.0};
            w.add(w.name[i] + "-frag", BodyKind::Fragment, fm, 0.0,
                  w.position[i] + off, w.velocity[i]);
        }
        w.alive[i] = 0;
    }
}

}  // namespace gl
