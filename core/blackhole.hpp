#pragma once
#include "state.hpp"

namespace gl {

struct BlackHoleConfig {
    // Factor de exageracion visual del horizonte.
    // 1.0 = escala real, es decir, invisible: el horizonte de un agujero de
    // 10 M_sol mide 2e-7 UA. La UI DEBE mostrar este numero cuando != 1.
    double horizonVisualScale = 1.0;

    // Si true, la captura usa el radio de captura con enfoque gravitatorio
    // (mucho mayor que r_s a velocidades no relativistas) en vez de r_s puro.
    bool useGravitationalFocusing = true;

    // Fragmentar cuerpos que crucen el limite de Roche.
    bool enableTidalDisruption = false;
    int fragmentsPerBody = 64;
};

// Radio de Schwarzschild de una masa dada, en UA.
double schwarzschildRadius(double massSolar);  // TODO

// Limite de Roche para un cuerpo de densidad rho frente a una masa M:
//   d = R_cuerpo * (2 * M / m_cuerpo)^(1/3)
double rocheLimit(double holeMass, double bodyMass, double bodyRadius);  // TODO

// Distancia de maxima aproximacion de la orbita relativa (perihelio del
// encuentro). Es el criterio correcto de captura: no importa donde este el
// cuerpo ahora, sino por donde va a pasar.
double pericenterDistance(const Vec3& relPos, const Vec3& relVel, double mu);

// Radio efectivo de captura con enfoque gravitatorio, para un cuerpo que
// llega con velocidad relativa v en el infinito:
//   b_max^2 = r_s^2 * (1 + 2GM / (r_s * v^2))
// A 30 km/s y 10 M_sol esto es ~10^4 veces r_s, y aun asi ~0.002 UA.
double captureRadius(double holeMass, double relativeSpeed);  // TODO

// Absorbe los cuerpos dentro del radio de captura.
// Test obligatorio: el momento lineal total antes y despues debe ser
// identico hasta precision de maquina. La energia NO se conserva: la
// diferencia se acumula en World::absorbedEnergy.
// minRadius fuerza un radio de captura mayor que el fisico. Se usa cuando
// el horizonte se dibuja ampliado, para que lo mostrado y lo simulado
// coincidan. No es fisica: es coherencia visual, y hay que etiquetarla.
void processCaptures(World& w, std::size_t holeIndex,
                     const BlackHoleConfig& cfg, double minRadius = 0.0);

void processTidalDisruption(World& w, std::size_t holeIndex,
                            const BlackHoleConfig& cfg);  // TODO

}  // namespace gl
