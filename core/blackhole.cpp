#include "blackhole.hpp"
#include <algorithm>
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

// Distancia minima de la orbita relativa: el perihelio del encuentro.
// Con L = |r x v| y E = v^2/2 - mu/r,  e = sqrt(1 + 2 E L^2 / mu^2)
// y  r_p = (L^2/mu) / (1 + e).
double pericenterDistance(const Vec3& r, const Vec3& v, double mu) {
    const double rn = r.norm();
    if (rn <= 0.0 || mu <= 0.0) return 0.0;
    const Vec3 L = r.cross(v);
    const double l2 = L.normSquared();
    if (l2 <= 0.0) return 0.0;  // caida radial: pasa por el centro
    const double E = 0.5 * v.normSquared() - mu / rn;
    const double e = std::sqrt(std::max(0.0, 1.0 + 2.0 * E * l2 / (mu * mu)));
    return (l2 / mu) / (1.0 + e);
}

void processCaptures(World& w, std::size_t holeIndex,
                     const BlackHoleConfig& cfg, double minRadius) {
    if (holeIndex >= w.size() || !w.alive[holeIndex]) return;

    for (std::size_t i = 0; i < w.size(); ++i) {
        if (i == holeIndex || !w.alive[i]) continue;

        const Vec3 d = w.position[i] - w.position[holeIndex];
        const Vec3 dv = w.velocity[i] - w.velocity[holeIndex];

        // El criterio correcto no es la distancia actual, sino si la orbita
        // del encuentro pasa por dentro del radio critico. Comparar la
        // distancia instantanea falla siempre: entre dos pasos el cuerpo
        // atraviesa el horizonte y sale por el otro lado sin que nadie lo
        // vea. Y aplicar la formula de enfoque gravitatorio con la
        // velocidad local, en vez de con la del infinito, hace que el radio
        // de captura se encoja justo cuando el cuerpo acelera al caer.
        //
        // Radio critico: la ultima orbita circular estable de Schwarzschild,
        // en 3 r_s. Por dentro de ahi no existe ninguna orbita estable y la
        // caida al horizonte es inevitable.
        const double rs = schwarzschildRadius(w.mass[holeIndex]);
        const double rc = std::max(cfg.useGravitationalFocusing ? 3.0 * rs : rs,
                                   minRadius);
        const double mu = G * (w.mass[holeIndex] + w.mass[i]);
        const double rp = pericenterDistance(d, dv, mu);
        const bool inbound = d.dot(dv) < 0.0;
        if (!(rp <= rc && (inbound || d.norm() <= rc))) continue;
        if (d.norm() > 200.0 * rc) continue;  // aun lejos: ya caera

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
