// Test 5: las orbitas son elipses, no circunferencias.
//
// A simple vista los planetas parecen girar en circulos. Este test
// demuestra que no, y de paso explica por que lo parecen: la excentricidad
// de la Tierra achata su orbita un 0.014%. Ninguna pantalla resuelve eso.
// Los cuerpos donde si se ve son los cometas.
#include <cmath>
#include "../core/analysis.hpp"
#include "../core/ephemeris.hpp"
#include "../core/integrator.hpp"
#include "../core/units.hpp"
#include "expected_values.hpp"
#include "microtest.hpp"

using namespace gl;

TEST(las_excentricidades_calculadas_coinciden_con_las_reales) {
    World w = makeSolarSystemJ2000(true);
    struct Row { const char* name; double e; };
    const Row rows[] = {
        {"Mercurio", 0.20564}, {"Venus", 0.00678}, {"Tierra", 0.01671},
        {"Marte", 0.09339},    {"Jupiter", 0.04839}, {"Neptuno", 0.00859},
        {"Pluton", 0.24883},   {"Halley", 0.96714},
    };
    for (const auto& r : rows) {
        std::size_t idx = 0;
        for (std::size_t i = 0; i < w.size(); ++i)
            if (w.name[i] == r.name) idx = i;
        ASSERT(idx != 0);
        if (idx) ASSERT_NEAR(elementsOf(w, idx, 0).eccentricity, r.e, 5e-3);
    }
}

TEST(la_orbita_de_la_tierra_es_visualmente_indistinguible_de_un_circulo) {
    // b/a = sqrt(1 - e^2). Con e = 0.0167 sale 0.99986: la elipse es un
    // 0.014% mas plana que la circunferencia. Lo que la delata no es la
    // forma, es que el Sol esta descentrado en a*e = 0.0167 UA.
    World w = makeSolarSystemJ2000();
    const double e = elementsOf(w, 3, 0).eccentricity;
    ASSERT_NEAR(std::sqrt(1.0 - e * e), 1.0, 2e-4);
    ASSERT(e > 0.01);  // pero no es cero
}

TEST(la_orbita_de_halley_si_es_visiblemente_alargada) {
    World w = makeSolarSystemJ2000(true);
    std::size_t h = 0;
    for (std::size_t i = 0; i < w.size(); ++i) if (w.name[i] == "Halley") h = i;
    const auto el = elementsOf(w, h, 0);
    ASSERT(el.eccentricity > 0.96);
    ASSERT_NEAR(std::sqrt(1.0 - el.eccentricity * el.eccentricity), 0.254, 0.01);
    // Perihelio 0.586 UA (dentro de la orbita de Venus),
    // afelio 35.1 UA (mas alla de Neptuno).
    ASSERT_NEAR(el.semiMajorAxis * (1 - el.eccentricity), 0.586, 0.02);
    ASSERT_NEAR(el.semiMajorAxis * (1 + el.eccentricity), 35.1, 0.5);
}

TEST(el_periodo_de_halley_es_de_unos_75_anios) {
    World w = makeSolarSystemJ2000(true);
    std::size_t h = 0;
    for (std::size_t i = 0; i < w.size(); ++i) if (w.name[i] == "Halley") h = i;
    const double a = elementsOf(w, h, 0).semiMajorAxis;
    const double T = 2.0 * M_PI * std::sqrt(a * a * a / G) / 365.25;
    ASSERT_NEAR(T, 75.3, 1.0);
}

TEST(el_achatamiento_del_sol_aporta_mucho_menos_que_la_relatividad) {
    // J2 del Sol = 2.2e-7. Su efecto sobre Mercurio es del orden de
    // 0.03 arcsec/siglo, unas mil veces menor que los 42.8 de la
    // relatividad. Sirve para saber donde esta el suelo del modelo.
    World a = makeSolarSystemJ2000(), b = makeSolarSystemJ2000();
    ForceConfig plain, oblate;
    oblate.enableJ2 = true;
    computeAccelerations(a, plain);
    computeAccelerations(b, oblate);
    const double da = (b.acceleration[1] - a.acceleration[1]).norm();
    const double base = a.acceleration[1].norm();
    ASSERT(da > 0.0);
    ASSERT(da / base < 1e-7);
}
