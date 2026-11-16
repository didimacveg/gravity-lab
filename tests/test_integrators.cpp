// Orden de convergencia de cada integrador y simetria temporal de Verlet
// con fuerzas dependientes de la velocidad.
#include <cmath>
#include <cstdio>
#include "../core/horizons_data.hpp"
#include "../core/integrator.hpp"
#include "../core/reference.hpp"
#include "../core/scenario.hpp"
#include "../core/units.hpp"
#include "microtest.hpp"

using namespace gl;

// Error de posicion tras `days` dias en una orbita kepleriana e = 0.2,
// frente a una corrida de referencia con paso muy fino.
static double positionError(Integrator m, double dt, bool pn, double days = 64.0) {
    auto run = [&](Integrator mm, double h) {
        World w = makeEllipticTwoBody(0.387, 0.2, 1.0);
        ForceConfig cfg;
        cfg.enable1PN = pn;
        computeAccelerations(w, cfg);
        const long n = std::lround(days / h);
        for (long i = 0; i < n; ++i) step(w, h, mm, cfg);
        return w.position[1];
    };
    return (run(m, dt) - run(Integrator::Yoshida6, 1.0 / 64.0)).norm();
}

static double measuredOrder(Integrator m, double dt, bool pn) {
    return std::log2(positionError(m, dt, pn) / positionError(m, dt / 2.0, pn));
}

TEST(cada_integrador_converge_con_su_orden_teorico) {
    const double euler = measuredOrder(Integrator::ExplicitEuler, 1.0 / 16, false);
    const double verlet = measuredOrder(Integrator::VerletKDK, 0.5, false);
    const double rk4 = measuredOrder(Integrator::RK4, 1.0, false);
    const double y4 = measuredOrder(Integrator::Yoshida4, 1.0, false);
    const double y6 = measuredOrder(Integrator::Yoshida6, 4.0, false);
    std::printf("    orden medido: Euler %.2f, Verlet %.2f, RK4 %.2f, Yoshida4 %.2f, Yoshida6 %.2f\n",
                euler, verlet, rk4, y4, y6);
    ASSERT_NEAR(euler, 1.0, 0.15);
    ASSERT_NEAR(verlet, 2.0, 0.1);
    ASSERT_NEAR(rk4, 4.0, 0.3);
    ASSERT_NEAR(y4, 4.0, 0.3);
    ASSERT_NEAR(y6, 6.0, 0.5);
}

TEST(con_el_termino_1PN_verlet_y_yoshida_conservan_su_orden) {
    // Regresion. El termino 1PN depende de la velocidad. Evaluado con la
    // velocidad del paso anterior, Verlet bajaba a primer orden y arrastraba
    // a Yoshida con el: 1.7 millones de km de error en Mercurio en un siglo.
    // El orden se mide sobre el EFECTO del termino 1PN (corrida con 1PN
    // menos corrida sin el), que es donde vive el fallo.
    auto pnEffectError = [](Integrator m, double dt) {
        auto run = [&](Integrator mm, double h, bool pn) {
            World w = makeEllipticTwoBody(0.387, 0.2, 1.0);
            ForceConfig cfg;
            cfg.enable1PN = pn;
            computeAccelerations(w, cfg);
            const long n = std::lround(64.0 / h);
            for (long i = 0; i < n; ++i) step(w, h, mm, cfg);
            return w.position[1];
        };
        const Vec3 effect = run(m, dt, true) - run(m, dt, false);
        const Vec3 exact = run(Integrator::Yoshida6, 1.0 / 64, true) -
                           run(Integrator::Yoshida6, 1.0 / 64, false);
        return (effect - exact).norm();
    };
    const double verlet = std::log2(pnEffectError(Integrator::VerletKDK, 0.5) /
                                    pnEffectError(Integrator::VerletKDK, 0.25));
    const double y4 = std::log2(pnEffectError(Integrator::Yoshida4, 2.0) /
                                pnEffectError(Integrator::Yoshida4, 1.0));
    std::printf("    orden sobre el efecto 1PN: Verlet %.2f, Yoshida4 %.2f\n", verlet, y4);
    ASSERT_NEAR(verlet, 2.0, 0.2);
    ASSERT_NEAR(y4, 4.0, 0.5);
}

TEST(verlet_con_1PN_es_reversible_en_el_tiempo) {
    // Avanzar 2000 pasos y retroceder 2000 debe devolver el estado inicial.
    // Es la propiedad que distingue a un integrador geometrico, y la que se
    // perdia al tratar mal la fuerza dependiente de la velocidad.
    for (Integrator m : {Integrator::VerletKDK, Integrator::Yoshida4, Integrator::Yoshida6}) {
        World w = makeSolarSystemHorizons();
        ForceConfig cfg;
        cfg.enable1PN = true;
        cfg.enableEarthMoonQuadrupole = true;
        computeAccelerations(w, cfg);
        const World start = w;
        for (int i = 0; i < 2000; ++i) step(w, 0.5, m, cfg);
        ASSERT((w.position[1] - start.position[1]).norm() > 0.1);
        for (int i = 0; i < 2000; ++i) step(w, -0.5, m, cfg);
        for (std::size_t b = 0; b < w.size(); ++b) {
            ASSERT_NEAR((w.position[b] - start.position[b]).norm(), 0.0, 2e-11);
            ASSERT_NEAR((w.velocity[b] - start.velocity[b]).norm(), 0.0, 2e-12);
        }
    }
}

TEST(euler_no_es_reversible) {
    World w = makeSolarSystemHorizons();
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    const World start = w;
    for (int i = 0; i < 2000; ++i) step(w, 0.5, Integrator::ExplicitEuler, cfg);
    for (int i = 0; i < 2000; ++i) step(w, -0.5, Integrator::ExplicitEuler, cfg);
    ASSERT((w.position[1] - start.position[1]).norm() > 1e-3);
}

TEST(en_el_sistema_solar_real_euler_pierde_la_energia_y_yoshida_no) {
    auto drift = [](Integrator m, double years) {
        World w = makeSolarSystemHorizons();
        ForceConfig cfg;
        computeAccelerations(w, cfg);
        const double e0 = computeDiagnostics(w).totalEnergy;
        const long n = std::lround(years * 365.25 / 0.5);
        for (long i = 0; i < n; ++i) step(w, 0.5, m, cfg);
        return std::fabs((computeDiagnostics(w).totalEnergy - e0) / e0);
    };
    const double e10 = drift(Integrator::ExplicitEuler, 10), e40 = drift(Integrator::ExplicitEuler, 40);
    const double y10 = drift(Integrator::Yoshida4, 10), y40 = drift(Integrator::Yoshida4, 40);
    std::printf("    |dE/E| a 10 y 40 anios: Euler %.1e %.1e, Yoshida4 %.1e %.1e\n", e10, e40, y10, y40);
    ASSERT(e10 > 1e-3);
    ASSERT(e40 > e10);          // crece
    ASSERT(y10 < 1e-8 && y40 < 1e-8);  // acotada
    ASSERT(e40 > 1e5 * y40);
}
