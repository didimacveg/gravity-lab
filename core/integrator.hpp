#pragma once
#include "forces.hpp"
#include <cstddef>
#include "state.hpp"

namespace gl {

enum class Integrator {
    ExplicitEuler,  // orden 1, no simplectico. Existe para que se vea que explota.
    RK4,            // orden 4, NO simplectico: deriva secular de energia.
    VerletKDK,      // orden 2, simplectico. El caballo de batalla.
    Yoshida4        // orden 4, simplectico. Composicion de 3 pasos de Verlet.
};

// Coeficientes de Yoshida de 4o orden:
//   w1 = 1 / (2 - 2^(1/3))
//   w0 = -2^(1/3) * w1
// El paso es Verlet(w1*dt), Verlet(w0*dt), Verlet(w1*dt).
// El paso central es NEGATIVO. Si tu implementacion no retrocede en el tiempo
// a mitad de paso, esta mal.

void step(World& w, double dt, Integrator method, const ForceConfig& cfg);

// Escala de tiempo dinamica del sistema, en dias. Es el menor de dos
// tiempos caracteristicos sobre los cuerpos con masa: el tiempo en que la
// gravedad cambia apreciablemente la velocidad, y el tiempo de caida libre
// entre los dos cuerpos mas proximos.
double safeStep(const World& w, double eta = 0.02);

// Avanza dtTarget subdividiendolo segun safeStep. Devuelve el numero de
// subpasos usados. Con paso fijo, un encuentro cercano dispara la
// aceleracion y el estado diverge a NaN en unos pocos pasos; esta es la
// unica forma de que la simulacion sobreviva a un agujero negro pasando
// cerca. budget acota el trabajo por llamada.
std::size_t stepAdaptive(World& w, double dtTarget, Integrator method,
                         const ForceConfig& cfg, std::size_t budget = 100000);

// Retira los cuerpos cuyo estado ha dejado de ser finito o que se han ido
// mas alla de maxRadius. Devuelve cuantos. Sin esto un solo NaN se propaga
// a todos los cuerpos a traves de las aceleraciones en un unico paso.
std::size_t sanitize(World& w, double maxRadius = 1e5);

}  // namespace gl
