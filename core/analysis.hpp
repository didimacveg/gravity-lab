#pragma once
#include <vector>
#include "state.hpp"

namespace gl {

// Elementos orbitales de un cuerpo respecto a un centro dominante.
struct OrbitalElements {
    double semiMajorAxis = 0.0;   // UA
    double eccentricity = 0.0;
    Vec3 eccentricityVector;      // vector de Laplace-Runge-Lenz normalizado,
                                  // apunta al perihelio
    double periapsisAngle = 0.0;  // radianes, en el plano XY
};

// e_vec = (v x L) / (G*M) - r_hat
// En gravedad newtoniana de dos cuerpos este vector es CONSTANTE.
// Que gire es exactamente lo que llamamos precesion.
OrbitalElements elementsOf(const World& w, std::size_t body,
                           std::size_t center);  // TODO (bloque 3)

// Ajuste por minimos cuadrados del angulo del perihelio frente al tiempo.
// Devuelve la tasa en segundos de arco por siglo juliano.
// Longitud del perihelio "de verdad": varpi = Omega + omega, la suma del
// angulo del nodo ascendente (medido en la ecliptica) y el argumento del
// perihelio (medido en el plano de la orbita). Es el angulo cuya deriva
// tabulan las efemerides. periapsisAngle, en cambio, es la proyeccion del
// perihelio sobre la ecliptica; para Mercurio (i = 7 grados) su ritmo es
// un 0.4% menor: cos(i) / (cos^2(w) + cos^2(i) sin^2(w)) = 0.996.
double longitudeOfPerihelion(const World& w, std::size_t body,
                             std::size_t center);

double precessionRate(const std::vector<double>& timesDays,
                      const std::vector<double>& anglesRad);  // TODO (bloque 3)

}  // namespace gl
