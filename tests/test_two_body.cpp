// Test 1: dos cuerpos contra la solucion analitica de Kepler.
// Si esto no pasa, no hay proyecto.
#include <cmath>
#include "../core/analysis.hpp"
#include "../core/integrator.hpp"
#include "../core/scenario.hpp"
#include "../core/units.hpp"
#include "expected_values.hpp"
#include "microtest.hpp"

using namespace gl;

static double separation(const World& w) {
    return (w.position[1] - w.position[0]).norm();
}

static void integrate(World& w, double totalDays, double dt, Integrator m) {
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    for (double t = 0; t < totalDays; t += dt) step(w, dt, m, cfg);
}

TEST(orbita_circular_mantiene_el_radio) {
    World w = makeCircularTwoBody(1.0, 1.0);
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    double worst = 0.0;
    const double dt = 0.01;
    for (double t = 0; t < 365.256; t += dt) {
        step(w, dt, Integrator::VerletKDK, cfg);
        worst = std::fmax(worst, std::fabs(separation(w) - 1.0));
    }
    ASSERT_NEAR(worst, 0.0, 1e-7);
}

TEST(periodo_orbital_coincide_con_la_tercera_ley) {
    // T = 2*pi*sqrt(a^3/(GM)). Para a=1, M=1 debe dar 365.256 dias.
    const double expected = 2.0 * M_PI * std::sqrt(1.0 / G);
    ASSERT_NEAR(expected, expected::PERIOD_EARTH, 0.01);

    World w = makeCircularTwoBody(1.0, 1.0);
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    const double dt = 0.001;
    double t = 0.0, prevY = 0.0, crossing = -1.0;
    while (t < 400.0) {
        prevY = w.position[1].y;
        step(w, dt, Integrator::VerletKDK, cfg);
        t += dt;
        // cruce ascendente del eje X tras haber dado la vuelta
        if (t > 300.0 && prevY < 0.0 && w.position[1].y >= 0.0) {
            crossing = t;
            break;
        }
    }
    ASSERT(crossing > 0.0);
    if (crossing > 0.0) ASSERT_NEAR(crossing, expected, expected * 1e-5);
}

TEST(orbita_eliptica_no_precesa_en_newton_puro) {
    // El vector de Laplace-Runge-Lenz es constante en el problema de dos
    // cuerpos newtoniano. Si aqui aparece precesion, es error numerico tuyo,
    // y el test de Mercurio no significaria nada.
    World w = makeEllipticTwoBody(0.387098, 0.2056, 1.0);
    const double a0 = elementsOf(w, 1, 0).periapsisAngle;
    integrate(w, 3652.5, 0.01, Integrator::Yoshida4);
    const double a1 = elementsOf(w, 1, 0).periapsisAngle;
    const double drift = std::fabs(a1 - a0) * ARCSEC_PER_RADIAN * 10.0;
    ASSERT_NEAR(drift, 0.0, 0.1);  // arcsec/siglo
}

TEST(euler_deriva_y_verlet_no) {
    const double dt = 0.5, days = 3652.5;  // 10 anios
    World a = makeCircularTwoBody(1.0, 1.0);
    World b = makeCircularTwoBody(1.0, 1.0);
    a.mass[1] = b.mass[1] = 3.00349e-6;  // masa real para que haya energia

    const double e0 = computeDiagnostics(a).totalEnergy;
    integrate(a, days, dt, Integrator::ExplicitEuler);
    integrate(b, days, dt, Integrator::VerletKDK);
    const double errEuler =
        std::fabs((computeDiagnostics(a).totalEnergy - e0) / e0);
    const double errVerlet =
        std::fabs((computeDiagnostics(b).totalEnergy - e0) / e0);

    ASSERT(errEuler > 1e-3);
    ASSERT(errVerlet < 1e-9);
}
