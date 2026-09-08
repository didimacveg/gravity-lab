// Test 4: modulo de agujero negro.
#include <cmath>
#include "../core/blackhole.hpp"
#include "../core/integrator.hpp"
#include "../core/ephemeris.hpp"
#include "../core/scenario.hpp"
#include "../core/units.hpp"
#include "microtest.hpp"

using namespace gl;

TEST(radio_de_schwarzschild_de_una_masa_solar_son_2_95_km) {
    // 2.95 km / 1.496e8 km por UA = 1.97e-8 UA
    ASSERT_NEAR(schwarzschildRadius(1.0) / 1.97e-8, 1.0, 1e-2);
}

TEST(el_horizonte_de_10_masas_solares_es_invisible_a_escala_solar) {
    // 2e-7 UA. Este test existe para que el numero quede escrito en el repo.
    ASSERT(schwarzschildRadius(10.0) < 1e-6);
    ASSERT(schwarzschildRadius(10.0) > 0.0);
}

TEST(el_radio_de_captura_es_mucho_mayor_que_el_horizonte_pero_sigue_siendo_diminuto) {
    const double v = 30.0 * SECONDS_PER_DAY / 1.495978707e8;  // 30 km/s en UA/dia
    const double rc = captureRadius(10.0, v);
    ASSERT(rc > schwarzschildRadius(10.0) * 100.0);
    ASSERT(rc < 0.01);
}

TEST(la_captura_conserva_el_momento_lineal) {
    World w = makeCircularTwoBody(1.0, 10.0);
    w.kind[0] = BodyKind::BlackHole;
    w.mass[1] = 3.00349e-6;
    w.position[1] = Vec3{};  // encima del agujero: captura garantizada
    const Vec3 p0 = computeDiagnostics(w).linearMomentum;
    processCaptures(w, 0, BlackHoleConfig{});
    const Vec3 p1 = computeDiagnostics(w).linearMomentum;
    ASSERT_NEAR((p1 - p0).norm(), 0.0, 1e-15);
}

TEST(la_captura_registra_la_energia_perdida) {
    World w = makeCircularTwoBody(1.0, 10.0);
    w.kind[0] = BodyKind::BlackHole;
    w.mass[1] = 3.00349e-6;
    w.position[1] = Vec3{};
    processCaptures(w, 0, BlackHoleConfig{});
    ASSERT(w.absorbedEnergy != 0.0);
    ASSERT(w.alive[1] == 0);
}

TEST(un_encuentro_a_100_UA_eyecta_planetas_en_vez_de_tragarselos) {
    // Contradice la intuicion de "el agujero negro se come el sistema solar".
    World w = makeSolarSystemApprox();
    const std::size_t bh =
        w.add("agujero", BodyKind::BlackHole, 10.0, 0.0, Vec3{-100, 0, 0},
              Vec3{0.02, 0, 0});
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    for (int i = 0; i < 200000; ++i) {
        step(w, 0.5, Integrator::VerletKDK, cfg);
        processCaptures(w, bh, BlackHoleConfig{});
    }
    int ejected = 0, captured = 0;
    for (std::size_t i = 1; i < 9; ++i) {
        if (!w.alive[i]) { ++captured; continue; }
        const Vec3 dr = w.position[i] - w.position[0];
        const Vec3 dv = w.velocity[i] - w.velocity[0];
        const double energy = 0.5 * dv.normSquared() - G * w.mass[0] / dr.norm();
        if (energy > 0.0) ++ejected;
    }
    ASSERT(ejected > 0);
    ASSERT(captured == 0);
}

TEST(un_agujero_supermasivo_si_devora_planetas_a_escala_real) {
    // Sgr A*, el agujero del centro de la Via Lactea: 4.3 millones de masas
    // solares, horizonte de 0.085 UA y ultima orbita estable en 0.25 UA.
    // A esa escala la absorcion deja de ser una rareza.
    World w = makeSolarSystemJ2000();
    const std::size_t bh = w.add("SgrA", BodyKind::BlackHole, 4.3e6, 0.0,
                                 Vec3{40, 0, 0}, Vec3{0, 0, 0});
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    for (int i = 0; i < 4000; ++i) {
        stepAdaptive(w, 0.5, Integrator::VerletKDK, cfg);
        processCaptures(w, bh, BlackHoleConfig{});
    }
    int eaten = 0;
    for (std::size_t i = 1; i < 9; ++i) if (!w.alive[i]) ++eaten;
    ASSERT(eaten == 8);              // se los traga todos
    ASSERT(w.alive[0] == 0);         // y al Sol tambien
    ASSERT(w.mass[bh] > 4.3e6);      // gana la masa de lo que ha tragado
}

TEST(un_agujero_de_diez_masas_solares_no_se_come_nada_a_escala_real) {
    // El mismo escenario con 10 masas solares: horizonte de 30 km, ultima
    // orbita estable en 89 km. Ningun planeta pasa tan cerca. Lo que hace
    // es desordenar el sistema, no devorarlo.
    World w = makeSolarSystemJ2000();
    const std::size_t bh = w.add("agujero", BodyKind::BlackHole, 10.0, 0.0,
                                 Vec3{40, 0, 0}, Vec3{0, 0, 0});
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    for (int i = 0; i < 4000; ++i) {
        stepAdaptive(w, 0.5, Integrator::VerletKDK, cfg);
        processCaptures(w, bh, BlackHoleConfig{});
    }
    int eaten = 0;
    for (std::size_t i = 1; i < 9; ++i) if (!w.alive[i]) ++eaten;
    ASSERT(eaten == 0);
}

TEST(el_perihelio_del_encuentro_se_calcula_bien) {
    // Orbita circular de radio 1: el perihelio es 1.
    const double mu = G * 1.0;
    const double v = std::sqrt(mu);
    ASSERT_NEAR(pericenterDistance(Vec3{1, 0, 0}, Vec3{0, v, 0}, mu), 1.0, 1e-12);
    // Caida radial: pasa por el centro.
    ASSERT_NEAR(pericenterDistance(Vec3{1, 0, 0}, Vec3{-v, 0, 0}, mu), 0.0, 1e-12);
}

TEST(el_radio_de_captura_forzado_hace_que_si_coma) {
    // Con minRadius igual al horizonte dibujado, lo que ves y lo que pasa
    // coinciden. Sigue sin ser escala real, y por eso se etiqueta.
    World w = makeSolarSystemJ2000();
    const std::size_t bh = w.add("agujero", BodyKind::BlackHole, 10.0, 0.0,
                                 Vec3{1.0, 0, 0}, Vec3{0, 0.005, 0});
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    const double drawn = schwarzschildRadius(10.0) * 1e6;
    int eaten = 0;
    for (int i = 0; i < 6000; ++i) {
        stepAdaptive(w, 0.5, Integrator::VerletKDK, cfg);
        processCaptures(w, bh, BlackHoleConfig{}, drawn);
    }
    for (std::size_t i = 1; i < 9; ++i) if (!w.alive[i]) ++eaten;
    ASSERT(drawn > 0.1);       // 0.197 UA
    ASSERT(eaten > 0);
}
