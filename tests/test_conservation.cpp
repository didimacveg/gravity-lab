// Test 2: conservacion sobre el sistema solar.
#include <cmath>
#include "../core/integrator.hpp"
#include "../core/scenario.hpp"
#include "../core/units.hpp"
#include "expected_values.hpp"
#include "microtest.hpp"

using namespace gl;

TEST(el_momento_lineal_total_es_cero_en_el_marco_baricentrico) {
    World w = makeSolarSystemApprox();
    ASSERT_NEAR(computeDiagnostics(w).linearMomentum.norm(), 0.0, 1e-15);
}

TEST(el_momento_angular_se_conserva) {
    // Aviso: el momento angular se conserva incluso con integradores malos.
    // Que pase este test NO valida tu integrador. El siguiente si.
    World w = makeSolarSystemApprox();
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    const double l0 = computeDiagnostics(w).angularMomentum.norm();
    for (int i = 0; i < 20000; ++i) step(w, 0.5, Integrator::VerletKDK, cfg);
    const double l1 = computeDiagnostics(w).angularMomentum.norm();
    ASSERT(l0 > 0.0);
    if (l0 > 0.0) ASSERT_NEAR(std::fabs((l1 - l0) / l0), 0.0,
                              expected::ANGULAR_MOMENTUM_TOLERANCE);
}

TEST(verlet_acota_la_deriva_de_energia_y_rk4_no) {
    // Este es el test que se convierte en la primera grafica del README.
    ForceConfig cfg;
    auto drift = [&](Integrator m, int steps) {
        World w = makeSolarSystemApprox();
        computeAccelerations(w, cfg);
        const double e0 = computeDiagnostics(w).totalEnergy;
        for (int i = 0; i < steps; ++i) step(w, 0.5, m, cfg);
        return std::fabs((computeDiagnostics(w).totalEnergy - e0) / e0);
    };
    // La firma de un metodo NO simplectico: el error crece con el tiempo.
    const double rkShort = drift(Integrator::RK4, 10000);
    const double rkLong = drift(Integrator::RK4, 40000);
    ASSERT(rkLong > rkShort * 3.0);

    // La firma de uno simplectico: el error se queda donde estaba.
    const double vShort = drift(Integrator::VerletKDK, 10000);
    const double vLong = drift(Integrator::VerletKDK, 40000);
    ASSERT(vLong < vShort * 3.0);
    ASSERT(vLong < expected::ENERGY_DRIFT_TOLERANCE_VERLET);
}

TEST(los_periodos_de_los_planetas_coinciden_con_las_efemerides) {
    // Tercera ley: T = 2*pi*sqrt(a^3 / (G*(M_sol + m)))
    //
    // Detalle que descubres al escribir este test: los planetas interiores
    // cuadran a 1e-5, pero Saturno se desvia un 0.7%. No es un error tuyo.
    // El "semieje mayor" que publican las tablas divulgativas para los
    // gigantes es una distancia media, y ademas Jupiter y Saturno se
    // perturban mutuamente lo suficiente como para que la ley de Kepler de
    // dos cuerpos ya no valga a esa precision. Por eso las tolerancias son
    // distintas, y por eso hacen falta efemerides reales para el bloque 3.
    struct Row { double a, T, m, tol; };
    const Row rows[] = {
        {expected::SMA_MERCURY, expected::PERIOD_MERCURY, expected::M_MERCURY, 1e-5},
        {expected::SMA_VENUS,   expected::PERIOD_VENUS,   expected::M_VENUS,   1e-5},
        {expected::SMA_EARTH,   expected::PERIOD_EARTH,   expected::M_EARTH,   1e-5},
        {expected::SMA_MARS,    expected::PERIOD_MARS,    expected::M_MARS,    1e-4},
        {expected::SMA_JUPITER, expected::PERIOD_JUPITER, expected::M_JUPITER, 1e-3},
        {expected::SMA_SATURN,  expected::PERIOD_SATURN,  expected::M_SATURN,  1e-2},
        {expected::SMA_URANUS,  expected::PERIOD_URANUS,  expected::M_URANUS,  1e-2},
        {expected::SMA_NEPTUNE, expected::PERIOD_NEPTUNE, expected::M_NEPTUNE, 1e-2},
    };
    for (const auto& r : rows) {
        const double T = 2.0 * M_PI * std::sqrt(r.a * r.a * r.a / (G * (1.0 + r.m)));
        ASSERT_NEAR(T / r.T, 1.0, r.tol);
    }
}
