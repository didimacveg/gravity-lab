// Validacion contra NASA/JPL Horizons (efemeride DE441).
//
// Los tests anteriores comprueban que el simulador es coherente consigo
// mismo. Estos comprueban que coincide con el sistema solar: se parte de
// los vectores de estado de DE441 en J2000.0, se integra un siglo y se
// compara, planeta a planeta, con donde dice el JPL que estan.
//
// Los umbrales son holgados respecto a lo medido (entre 1.3x y 2.5x) para
// que un cambio de compilador no los rompa, pero un error de fisica si.
#include <cmath>
#include <cstdio>
#include <vector>
#include "../core/analysis.hpp"
#include "../core/horizons_data.hpp"
#include "../core/reference.hpp"
#include "../core/units.hpp"
#include "expected_values.hpp"
#include "microtest.hpp"

using namespace gl;

#ifndef GL_DATA_DIR
#define GL_DATA_DIR "web/data"
#endif

static const Reference& reference() {
    static const Reference ref =
        loadReference(std::string(GL_DATA_DIR) + "/horizons_planets.f64");
    return ref;
}

static ForceConfig fullModel() {
    ForceConfig cfg;
    cfg.enable1PN = true;
    cfg.enableEarthMoonQuadrupole = true;
    return cfg;
}

// Corrida de referencia: Yoshida 6 con dt = 0.25 dias, modelo completo.
static const ValidationRun& bestRun() {
    static const ValidationRun run = runValidation(
        reference(), makeSolarSystemHorizons(), Integrator::Yoshida6, 0.25,
        100.0, fullModel());
    return run;
}

TEST(la_referencia_de_horizons_se_carga_y_coincide_con_las_condiciones_iniciales) {
    ASSERT(reference().ok());
    if (!reference().ok()) return;
    const World w = makeSolarSystemHorizons();
    ASSERT(w.size() == horizons::BODIES);
    for (std::size_t b = 0; b < w.size(); ++b) {
        const Vec3 d = w.position[b] - reference().position(horizons::EPOCH_INDEX, b);
        ASSERT(d.norm() == 0.0);  // mismo numero, bit a bit
    }
    // En el instante inicial el error es cero por construccion.
    for (std::size_t b = 1; b < w.size(); ++b)
        ASSERT(heliocentricErrorKm(w, reference(), horizons::EPOCH_INDEX, b) == 0.0);
}

TEST(las_masas_de_de440_suman_un_momento_casi_nulo_en_el_baricentro) {
    // El origen de DE441 es el baricentro de TODO el sistema solar. Con solo
    // Sol y planetas, el momento que sobra es el de lo que falta (asteroides,
    // Pluton): debe ser minusculo frente al de Jupiter, pero no cero.
    const World w = makeSolarSystemHorizons();
    const double p = computeDiagnostics(w).linearMomentum.norm();
    const double pJupiter = w.mass[5] * w.velocity[5].norm();
    ASSERT(p / pJupiter < 1e-5);
    ASSERT(p > 0.0);
}

TEST(un_siglo_de_integracion_coincide_con_horizons) {
    if (!reference().ok()) { ASSERT(false); return; }
    const ValidationRun& r = bestRun();
    ASSERT(r.checkpointYears.size() == 3);
    //                         Mer  Ven  Tie  Mar  Jup  Sat  Ura  Nep
    const double limit10[8]  = {  5,   2,  60,  12,   3,  12,   8,   6};
    const double limit100[8] = { 25,  12, 500,  60,  60,  40, 400, 900};
    // Medido:           10 a:  1.0  0.3   41  4.9  0.9  5.8  3.5  2.8
    //                  100 a:  9.3  3.5  303   32   33   19  276  656
    for (int p = 0; p < 8; ++p) {
        ASSERT(r.maxErrorKm[1][p] < limit10[p]);
        ASSERT(r.maxErrorKm[2][p] < limit100[p]);
    }
    // Y tampoco es trivialmente cero: el modelo no es DE441.
    ASSERT(r.maxErrorKm[2][7] > 50.0);
}

TEST(sin_relatividad_mercurio_se_desvia_miles_de_km) {
    if (!reference().ok()) { ASSERT(false); return; }
    ForceConfig cfg = fullModel();
    cfg.enable1PN = false;
    const ValidationRun newton = runValidation(
        reference(), makeSolarSystemHorizons(), Integrator::Yoshida6, 0.25,
        100.0, cfg);
    // 43 arcsec/siglo sobre una orbita de 0.39 UA son ~12000 km de
    // perihelio girado, mas el retraso acumulado a lo largo de la orbita.
    ASSERT(newton.maxErrorKm[2][0] > 10000.0);
    ASSERT(newton.maxErrorKm[2][0] > 500.0 * bestRun().maxErrorKm[2][0]);
}

TEST(el_cuadrupolo_tierra_luna_reduce_el_error_de_la_tierra) {
    if (!reference().ok()) { ASSERT(false); return; }
    ForceConfig cfg = fullModel();
    cfg.enableEarthMoonQuadrupole = false;
    const ValidationRun point = runValidation(
        reference(), makeSolarSystemHorizons(), Integrator::Yoshida6, 0.25,
        100.0, cfg);
    // Tratar Tierra + Luna como un punto cuesta ~117 km por anio.
    ASSERT(point.maxErrorKm[2][2] > 10000.0);
    ASSERT(bestRun().maxErrorKm[2][2] * 20.0 < point.maxErrorKm[2][2]);
    // Y no estropea a nadie mas.
    for (int p : {0, 3, 4, 5, 6, 7})
        ASSERT(bestRun().maxErrorKm[2][p] < 1.1 * point.maxErrorKm[2][p] + 1.0);
}

TEST(el_cuadrupolo_tierra_luna_sale_de_primeros_principios) {
    // Q = (3/4) mu (1-mu) a^2 (1 + 3e^2/2) (1 - (3/2) sen^2 i)
    const double mu = 4902.800118 / (398600.435507 + 4902.800118);
    const double a = 384399.0 / AU_KM;
    const double e = 0.0549, inc = 5.145 * M_PI / 180.0;
    const double q = 0.75 * mu * (1.0 - mu) * a * a * (1.0 + 1.5 * e * e) *
                     (1.0 - 1.5 * std::sin(inc) * std::sin(inc));
    ASSERT_NEAR(q / EARTH_MOON_QUADRUPOLE_AU2, 1.0, 1e-3);

    // Comprobacion directa: la media sobre un mes de la atraccion del Sol
    // sobre Tierra y Luna por separado, menos la atraccion sobre el punto
    // medio, tiene que dar la formula.
    const double r = 1.0;
    const int n = 3600;
    double extra = 0.0;
    for (int k = 0; k < n; ++k) {
        const double th = 2.0 * M_PI * (k + 0.5) / n;
        const Vec3 d{a * std::cos(th), a * std::sin(th), 0.0};
        const Vec3 earth = Vec3{r, 0, 0} - d * mu;
        const Vec3 moon = Vec3{r, 0, 0} + d * (1.0 - mu);
        const double ax = -(1.0 - mu) * earth.x / std::pow(earth.norm(), 3) -
                          mu * moon.x / std::pow(moon.norm(), 3);
        extra += (ax + 1.0 / (r * r)) / n;
    }
    const double formula = -0.75 * mu * (1.0 - mu) * a * a / (r * r * r * r);
    ASSERT_NEAR(extra / formula, 1.0, 1e-4);
}

TEST(el_error_frente_a_horizons_converge_con_el_orden_del_integrador) {
    if (!reference().ok()) { ASSERT(false); return; }
    auto mercury = [&](Integrator m, double dt) {
        return runValidation(reference(), makeSolarSystemHorizons(), m, dt, 10.0,
                             fullModel()).maxErrorKm[1][0];
    };
    // Yoshida 4: dividir el paso por 2 divide el error por ~16.
    const double y4a = mercury(Integrator::Yoshida4, 0.5);
    const double y4b = mercury(Integrator::Yoshida4, 0.25);
    ASSERT(y4a / y4b > 10.0 && y4a / y4b < 24.0);
    // Yoshida 6: por ~64.
    const double y6a = mercury(Integrator::Yoshida6, 2.0);
    const double y6b = mercury(Integrator::Yoshida6, 1.0);
    ASSERT(y6a / y6b > 40.0 && y6a / y6b < 90.0);
    // Euler no sirve ni con un paso 4 veces menor.
    ASSERT(mercury(Integrator::ExplicitEuler, 0.0625) > 1e6);
}

TEST(el_perihelio_de_mercurio_avanza_como_en_de441) {
    if (!reference().ok()) { ASSERT(false); return; }
    // Mismo ajuste por minimos cuadrados, sobre las mismas fechas, aplicado
    // a la simulacion y a la efemeride del JPL.
    const ValidationRun& r = bestRun();
    std::vector<double> t, de441;
    for (std::size_t k = 0; k < r.years.size(); ++k) {
        t.push_back(r.years[k] * 365.25);
        de441.push_back(horizons::MERCURY_VARPI[horizons::EPOCH_INDEX + 1 + k]);
    }
    const double sim = precessionRate(t, r.mercuryVarpi);
    const double jpl = precessionRate(t, de441);
    std::printf("    varpi de Mercurio: simulacion %.3f, DE441 %.3f arcsec/siglo\n", sim, jpl);
    ASSERT_NEAR(sim, jpl, 0.1);
    // El valor de libro (574.10 +- 0.65, Park et al. 2017) es el ritmo
    // secular; el ajuste sobre un solo siglo lleva terminos periodicos.
    ASSERT_NEAR(jpl, 574.10, 3.0);
    // El angulo en J2000 calculado aqui y en Python coincide.
    const World w = makeSolarSystemHorizons();
    double d = longitudeOfPerihelion(w, 1, 0) - horizons::MERCURY_VARPI[horizons::EPOCH_INDEX];
    d -= 2.0 * M_PI * std::round(d / (2.0 * M_PI));
    ASSERT_NEAR(d, 0.0, 1e-9);
}

TEST(la_relatividad_aporta_42_98_segundos_de_arco_medidos_en_el_plano_de_la_orbita) {
    if (!reference().ok()) { ASSERT(false); return; }
    // El test original mide el angulo del perihelio PROYECTADO sobre la
    // ecliptica y obtiene 42.81. La diferencia con 42.98 no era error
    // numerico: es geometria. Medido como varpi = Omega + omega sale el
    // valor de libro.
    ForceConfig cfg = fullModel();
    cfg.enable1PN = false;
    const ValidationRun newton = runValidation(
        reference(), makeSolarSystemHorizons(), Integrator::Yoshida6, 0.25,
        100.0, cfg);
    const ValidationRun& gr = bestRun();
    std::vector<double> t, diff;
    for (std::size_t k = 0; k < gr.years.size(); ++k) {
        t.push_back(gr.years[k] * 365.25);
        double d = gr.mercuryVarpi[k] - newton.mercuryVarpi[k];
        d -= 2.0 * M_PI * std::round(d / (2.0 * M_PI));
        diff.push_back(d);
    }
    const double rate = precessionRate(t, diff);
    std::printf("    contribucion 1PN: %.3f arcsec/siglo (aceptado 42.98)\n", rate);
    ASSERT_NEAR(rate, expected::PRECESSION_GR_ARCSEC_PER_CENTURY, 0.05);

    // Factor de proyeccion que explica el 42.81 del test original.
    const double inc = 7.00497902 * M_PI / 180.0;
    const double argPeri = (77.45779628 - 48.33076593) * M_PI / 180.0;
    const double factor = std::cos(inc) / (std::cos(argPeri) * std::cos(argPeri) +
        std::cos(inc) * std::cos(inc) * std::sin(argPeri) * std::sin(argPeri));
    ASSERT_NEAR(42.98 * factor, 42.81, 0.01);
}

TEST(la_precesion_1PN_de_dos_cuerpos_coincide_con_la_formula_de_einstein) {
    // Sol + Mercurio solos, con 1PN. Formula: 6 pi G M / (c^2 a (1 - e^2))
    // radianes por orbita.
    World w;
    const auto& s = horizons::PLANETS[0];
    const auto& m = horizons::PLANETS[1];
    w.add("Sol", BodyKind::Star, s.mass, 0, Vec3{}, Vec3{});
    w.add("Mercurio", BodyKind::Planet, 0.0, 0,
          Vec3{m.state[0] - s.state[0], m.state[1] - s.state[1], m.state[2] - s.state[2]},
          Vec3{m.state[3] - s.state[3], m.state[4] - s.state[4], m.state[5] - s.state[5]});
    ForceConfig cfg;
    cfg.enable1PN = true;
    computeAccelerations(w, cfg);
    const OrbitalElements el = elementsOf(w, 1, 0);
    const double a = el.semiMajorAxis, e = el.eccentricity;
    const double period = 2.0 * M_PI * std::sqrt(a * a * a / (G * s.mass));
    const double perOrbit = 6.0 * M_PI * G * s.mass / (C_LIGHT * C_LIGHT * a * (1.0 - e * e));
    const double formula = perOrbit / period * ARCSEC_PER_RADIAN * DAYS_PER_JULIAN_CENTURY;

    std::vector<double> t, ang;
    for (int k = 0; k < 36525; ++k) {
        for (int i = 0; i < 4; ++i) step(w, 0.25, Integrator::Yoshida6, cfg);
        if (k % 8 == 0) { t.push_back(w.time); ang.push_back(longitudeOfPerihelion(w, 1, 0)); }
    }
    const double rate = precessionRate(t, ang);
    std::printf("    dos cuerpos 1PN: medido %.4f, formula %.4f arcsec/siglo\n", rate, formula);
    ASSERT_NEAR(formula, 42.98, 0.03);
    ASSERT_NEAR(rate, formula, 0.02);
}
