#include "forces.hpp"
#include <cmath>
#include "units.hpp"

namespace gl {

void computeAccelerations(World& w, const ForceConfig& cfg) {
    const std::size_t n = w.size();
    for (auto& a : w.acceleration) a = Vec3{};

    const double eps2 = cfg.softening * cfg.softening;

    // Cada par UNA vez. La fuerza se aplica a los dos con signo opuesto:
    // tercera ley de Newton impuesta por construccion, no por casualidad.
    for (std::size_t i = 0; i < n; ++i) {
        if (!w.alive[i]) continue;
        for (std::size_t j = i + 1; j < n; ++j) {
            if (!w.alive[j]) continue;
            const Vec3 d = w.position[j] - w.position[i];
            const double r2 = d.normSquared() + eps2;
            if (r2 <= 0.0) continue;
            const double invR3 = 1.0 / (r2 * std::sqrt(r2));
            w.acceleration[i] += d * (G * w.mass[j] * invR3);
            w.acceleration[j] -= d * (G * w.mass[i] * invR3);
        }
    }

    if (cfg.enableJ2) {
        std::size_t c = 0;
        for (std::size_t i = 0; i < n; ++i)
            if (w.alive[i] && w.mass[i] > w.mass[c]) c = i;
        for (std::size_t i = 0; i < n; ++i) {
            if (i == c || !w.alive[i]) continue;
            w.acceleration[i] += accelerationJ2(w.position[i] - w.position[c],
                                                w.mass[c], w.radius[c], 2.2e-7);
        }
    }

    if (cfg.enableEarthMoonQuadrupole && cfg.earthIndex < n &&
        w.alive[cfg.earthIndex]) {
        std::size_t c = 0;
        for (std::size_t i = 0; i < n; ++i)
            if (w.alive[i] && w.mass[i] > w.mass[c]) c = i;
        const std::size_t e = cfg.earthIndex;
        if (e != c) {
            const Vec3 a = accelerationEarthMoonQuadrupole(
                w.position[e] - w.position[c], w.mass[c]);
            w.acceleration[e] += a;
            // Reaccion sobre el Sol: tercera ley, el momento se conserva.
            w.acceleration[c] -= a * (w.mass[e] / w.mass[c]);
        }
    }

    compute1PN(w, w.velocity, cfg, w.accelerationPN);
    if (!cfg.enable1PN) return;
    for (std::size_t i = 0; i < n; ++i) w.acceleration[i] += w.accelerationPN[i];
}

void compute1PN(const World& w, const std::vector<Vec3>& vel,
                const ForceConfig& cfg, std::vector<Vec3>& out) {
    const std::size_t n = w.size();
    out.assign(n, Vec3{});
    if (!cfg.enable1PN) return;

    // Correccion relativista respecto al cuerpo dominante.
    std::size_t central = 0;
    double best = -1.0;
    for (std::size_t i = 0; i < n; ++i)
        if (w.alive[i] && w.mass[i] > best) { best = w.mass[i]; central = i; }

    for (std::size_t i = 0; i < n; ++i) {
        if (i == central || !w.alive[i]) continue;
        if (w.mass[i] > 1e-3 * w.mass[central]) continue;  // no despreciable
        out[i] = acceleration1PN(w.position[i] - w.position[central],
                                 vel[i] - vel[central], w.mass[central]);
    }
}

Vec3 accelerationJ2(const Vec3& d, double centralMass, double radius,
                    double j2) {
    const double r2 = d.normSquared();
    if (r2 <= 0.0) return Vec3{};
    const double r = std::sqrt(r2);
    const double k = -1.5 * j2 * G * centralMass * radius * radius /
                     (r2 * r2 * r);
    const double z2r2 = 5.0 * d.z * d.z / r2;
    return Vec3{k * d.x * (1.0 - z2r2), k * d.y * (1.0 - z2r2),
                k * d.z * (3.0 - z2r2)};
}

double energy1PN(const World& w) {
    const std::size_t n = w.size();
    std::size_t c = 0;
    double best = -1.0;
    for (std::size_t i = 0; i < n; ++i)
        if (w.alive[i] && w.mass[i] > best) { best = w.mass[i]; c = i; }
    const double mu = G * w.mass[c], c2 = C_LIGHT * C_LIGHT;
    double e = 0.0;
    for (std::size_t i = 0; i < n; ++i) {
        if (i == c || !w.alive[i] || w.mass[i] > 1e-3 * w.mass[c]) continue;
        const double r = (w.position[i] - w.position[c]).norm();
        const double v2 = (w.velocity[i] - w.velocity[c]).normSquared();
        if (r <= 0.0) continue;
        e += w.mass[i] * (0.375 * v2 * v2 + 1.5 * mu * v2 / r +
                          0.5 * mu * mu / (r * r)) / c2;
    }
    return e;
}

Vec3 accelerationEarthMoonQuadrupole(const Vec3& d, double centralMass) {
    const double r2 = d.normSquared();
    if (r2 <= 0.0) return Vec3{};
    const double r = std::sqrt(r2);
    return d * (-EARTH_MOON_QUADRUPOLE_AU2 * G * centralMass / (r2 * r2 * r));
}

Vec3 acceleration1PN(const Vec3& relPos, const Vec3& relVel,
                     double centralMass) {
    const double r = relPos.norm();
    if (r <= 0.0) return Vec3{};
    const double mu = G * centralMass;
    const double c2 = C_LIGHT * C_LIGHT;
    const double v2 = relVel.normSquared();
    const double rv = relPos.dot(relVel);
    const double pre = mu / (c2 * r * r * r);
    return relPos * (pre * (4.0 * mu / r - v2)) + relVel * (pre * 4.0 * rv);
}

}  // namespace gl
