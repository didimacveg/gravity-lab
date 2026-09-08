#pragma once
#include "state.hpp"

namespace gl {

// Elementos keplerianos en la epoca J2000.0, referidos al plano de la
// ecliptica. Fuente: tabla estandar de elementos aproximados del JPL
// (valida entre 1800 y 2050).
struct KeplerElements {
    const char* name;
    double mass;          // masas solares
    double radiusAU;      // radio fisico
    double a;             // semieje mayor, UA
    double e;             // excentricidad
    double iDeg;          // inclinacion
    double LDeg;          // longitud media
    double periDeg;       // longitud del perihelio
    double nodeDeg;       // longitud del nodo ascendente
};

// Convierte elementos keplerianos en vectores de estado resolviendo la
// ecuacion de Kepler M = E - e*sin(E) por Newton-Raphson.
void appendFromElements(World& w, const KeplerElements& k, double centralMass);

// Sistema solar completo en J2000, marco baricentrico, tres dimensiones.
// withMinorBodies anade planetas enanos, asteroides y cometas: los cuerpos
// donde la excentricidad si se ve a simple vista. Halley tiene e = 0.967.
World makeSolarSystemJ2000(bool withMinorBodies = false);

}  // namespace gl
