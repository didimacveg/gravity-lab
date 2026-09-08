#pragma once
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
};

// Calcula TODAS las aceleraciones sobre el estado actual antes de aplicar nada.
// Este es exactamente el fallo del repo Planets: alli cada cuerpo ve posiciones
// ya actualizadas de los anteriores, lo que rompe la simetria del integrador
// y la conservacion del momento.
void computeAccelerations(World& w, const ForceConfig& cfg);  // TODO

// Termino 1PN de Einstein-Infeld-Hoffmann, caso de un cuerpo central dominante:
//   a = (GM / (c^2 r^3)) * [ (4GM/r - v^2) * r_vec + 4 (r_vec . v) * v_vec ]
// Valido solo para cuerpos de masa despreciable frente a la central.
Vec3 acceleration1PN(const Vec3& relPos, const Vec3& relVel,
                     double centralMass);

// Aceleracion por el achatamiento de un cuerpo central de radio R.
Vec3 accelerationJ2(const Vec3& relPos, double centralMass, double radius,
                    double j2);

}  // namespace gl
