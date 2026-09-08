#pragma once
#include <string>
#include "state.hpp"

namespace gl {

// Carga un CSV con cabecera: name,mass,radius,x,y,z,vx,vy,vz
// Devuelve un World vacio si el fichero no existe.
World loadFromCSV(const std::string& path);

// Dos cuerpos en orbita circular exacta. Para el test de referencia.
World makeCircularTwoBody(double radiusAU, double centralMass);

// Dos cuerpos en orbita eliptica con semieje a y excentricidad e,
// arrancando en el perihelio.
World makeEllipticTwoBody(double a, double e, double centralMass);

// Sistema solar APROXIMADO: orbitas circulares y coplanares construidas
// a partir de los semiejes y masas reales.
// Sirve para pruebas de humo y para ver algo en pantalla.
// NO sirve para medir la precesion de Mercurio: para eso hacen falta los
// vectores de estado reales de JPL Horizons.
World makeSolarSystemApprox();

}  // namespace gl
