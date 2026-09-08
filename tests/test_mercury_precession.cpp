// Test 3: la prueba que convierte esto en un proyecto serio.
//
// Requiere los vectores de estado reales de JPL Horizons en
// data/solar_system.csv. Con el sistema solar aproximado (orbitas
// circulares coplanares) el resultado NO es valido y el test se salta.
#include <cmath>
#include <cstdio>
#include <vector>
#include "../core/analysis.hpp"
#include "../core/integrator.hpp"
#include "../core/ephemeris.hpp"
#include "../core/scenario.hpp"
#include "../core/units.hpp"
#include "expected_values.hpp"
#include "microtest.hpp"

using namespace gl;

// Integra un siglo juliano y devuelve la tasa de precesion de Mercurio.
static double measurePrecession(bool with1PN, bool onlySunAndMercury) {
    World w = makeSolarSystemJ2000();
    if (onlySunAndMercury)
        for (std::size_t i = 2; i < w.size(); ++i) w.alive[i] = 0;

    ForceConfig cfg;
    cfg.enable1PN = with1PN;
    computeAccelerations(w, cfg);

    std::vector<double> times, angles;
    const double dt = 0.02;
    const int total = static_cast<int>(DAYS_PER_JULIAN_CENTURY / dt);
    for (int i = 0; i < total; ++i) {
        step(w, dt, Integrator::Yoshida4, cfg);
        if (i % 500 == 0) {
            times.push_back(w.time);
            angles.push_back(elementsOf(w, 1, 0).periapsisAngle);
        }
    }
    return precessionRate(times, angles);
}

TEST(control_sin_perturbaciones_ni_1PN_no_hay_precesion) {
    const double rate = measurePrecession(false, true);
    ASSERT_NEAR(rate, 0.0, 0.1);
}

TEST(precesion_newtoniana_por_perturbacion_planetaria) {
    const double rate = measurePrecession(false, false);
    ASSERT_NEAR(rate, expected::PRECESSION_NEWTONIAN_ARCSEC_PER_CENTURY,
                expected::PRECESSION_TOLERANCE_ARCSEC);
}

TEST(el_termino_1PN_anade_43_segundos_de_arco_por_siglo) {
    const double newtonian = measurePrecession(false, false);
    const double relativistic = measurePrecession(true, false);
    // Si esto pasa, has reproducido la anomalia que midio Le Verrier en 1859
    // y que Einstein explico en 1915.
    ASSERT_NEAR(relativistic - newtonian,
                expected::PRECESSION_GR_ARCSEC_PER_CENTURY,
                expected::PRECESSION_TOLERANCE_ARCSEC);
}
