#pragma once
#include <vector>
#include "state.hpp"

namespace gl {

struct ForceConfig {
    // Softening de Plummer en UA. Cambia la fisica: documentar siempre su valor.
    // 0.0 = gravedad newtoniana pura.
    double softening = 0.0;

    // Correccion post-newtoniana de primer orden.
    // Con esto activado debe aparecer la precesion de 43"/siglo de Mercurio.
    bool enable1PN = false;

    // Achatamiento del Sol (armonico zonal J2). Efecto real pero minusculo:
    // aporta unos 0.03 arcsec/siglo a la precesion de Mercurio, mil veces
    // menos que la relatividad. Sirve para ver donde esta el suelo de ruido.
    bool enableJ2 = false;

    // Cuadrupolo promediado del sistema Tierra-Luna.
    // El simulador trata Tierra + Luna como UN punto en su baricentro. Pero
    // el Sol no tira de ese punto: tira de la Tierra y de la Luna por
    // separado, y la media de 1/r^2 en dos sitios no es 1/r^2 en el sitio
    // medio. Promediado sobre el mes lunar, el resto es una fuerza radial
    // extra que cae como 1/r^4 (Quinn, Tremaine y Duncan 1991). Sin ella la
    // Tierra se adelanta 117 km cada anio respecto a JPL Horizons.
    bool enableEarthMoonQuadrupole = false;
    std::size_t earthIndex = 3;  // indice del baricentro Tierra-Luna
};

// Q = (3/4) mu (1-mu) <d^2> (1 - (3/2) sen^2 i), en UA^2, con
//   mu  = M_luna / (M_tierra + M_luna) = 0.0121506   (DE440)
//   <d^2> = a^2 (1 + 3e^2/2), a = 384399 km, e = 0.0549
//   i   = 5.145 grados, inclinacion de la orbita lunar sobre la ecliptica
inline constexpr double EARTH_MOON_QUADRUPOLE_AU2 = 5.8985e-8;

// Aceleracion extra sobre el baricentro Tierra-Luna:
//   a = -Q * G*M_sol * r_vec / r^5
Vec3 accelerationEarthMoonQuadrupole(const Vec3& relPos, double centralMass);

// Calcula TODAS las aceleraciones sobre el estado actual antes de aplicar nada.
// Este es exactamente el fallo del repo Planets: alli cada cuerpo ve posiciones
// ya actualizadas de los anteriores, lo que rompe la simetria del integrador
// y la conservacion del momento.
void computeAccelerations(World& w, const ForceConfig& cfg);  // TODO

// Termino 1PN de cada cuerpo para las posiciones de `w` y las velocidades
// `vel` (que pueden no ser las de `w`: Verlet lo evalua en la velocidad de
// medio paso). Escribe en `out`; deja ceros si 1PN esta desactivado.
void compute1PN(const World& w, const std::vector<Vec3>& vel,
                const ForceConfig& cfg, std::vector<Vec3>& out);

// Termino 1PN de Einstein-Infeld-Hoffmann, caso de un cuerpo central dominante:
//   a = (GM / (c^2 r^3)) * [ (4GM/r - v^2) * r_vec + 4 (r_vec . v) * v_vec ]
// Valido solo para cuerpos de masa despreciable frente a la central.
Vec3 acceleration1PN(const Vec3& relPos, const Vec3& relVel,
                     double centralMass);

// Aceleracion por el achatamiento de un cuerpo central de radio R.
Vec3 accelerationJ2(const Vec3& relPos, double centralMass, double radius,
                    double j2);

}  // namespace gl
