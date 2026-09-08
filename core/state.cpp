// IMPLEMENTADO como referencia de estilo. Esto es contabilidad, no fisica:
// son los instrumentos de medida con los que vas a juzgar tu integrador.
#include "state.hpp"
#include <cmath>
#include "units.hpp"

namespace gl {

double Vec3::norm() const { return std::sqrt(normSquared()); }

std::size_t World::add(const std::string& n, BodyKind k, double m, double r,
                       const Vec3& pos, const Vec3& vel) {
    name.push_back(n);
    kind.push_back(k);
    mass.push_back(m);
    radius.push_back(r);
    position.push_back(pos);
    velocity.push_back(vel);
    acceleration.push_back(Vec3{});
    alive.push_back(1);
    return mass.size() - 1;
}

void World::moveToBarycentricFrame() {
    Vec3 comPos, comVel;
    double totalMass = 0.0;
    for (std::size_t i = 0; i < size(); ++i) {
        if (!alive[i]) continue;
        comPos += position[i] * mass[i];
        comVel += velocity[i] * mass[i];
        totalMass += mass[i];
    }
    if (totalMass <= 0.0) return;
    comPos = comPos * (1.0 / totalMass);
    comVel = comVel * (1.0 / totalMass);
    for (std::size_t i = 0; i < size(); ++i) {
        position[i] -= comPos;
        velocity[i] -= comVel;
    }
}

Diagnostics computeDiagnostics(const World& w) {
    Diagnostics d;
    for (std::size_t i = 0; i < w.size(); ++i) {
        if (!w.alive[i]) continue;
        // Cinetica: 1/2 m v^2
        d.kineticEnergy += 0.5 * w.mass[i] * w.velocity[i].normSquared();
        d.linearMomentum += w.velocity[i] * w.mass[i];
        d.angularMomentum += w.position[i].cross(w.velocity[i]) * w.mass[i];

        // Potencial: -G m_i m_j / r, cada par UNA vez (j > i)
        for (std::size_t j = i + 1; j < w.size(); ++j) {
            if (!w.alive[j]) continue;
            const double r = (w.position[j] - w.position[i]).norm();
            if (r > 0.0) d.potentialEnergy -= G * w.mass[i] * w.mass[j] / r;
        }
    }
    d.totalEnergy = d.kineticEnergy + d.potentialEnergy;
    return d;
}

}  // namespace gl
