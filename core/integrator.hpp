#pragma once
#include "forces.hpp"
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

void step(World& w, double dt, Integrator method, const ForceConfig& cfg);  // TODO

}  // namespace gl
