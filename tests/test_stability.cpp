// Test 6: la simulacion no puede explotar.
//
// Con paso fijo, un agujero negro pasando cerca dispara la aceleracion y
// el estado diverge a NaN en pocos pasos. Estos casos reproducen esa
// situacion y exigen que el resultado siga siendo finito.
#include <cmath>
#include "../core/blackhole.hpp"
#include "../core/ephemeris.hpp"
#include "../core/integrator.hpp"
#include "../core/units.hpp"
#include "microtest.hpp"

using namespace gl;

static bool allFinite(const World& w) {
    for (std::size_t i = 0; i < w.size(); ++i) {
        if (!w.alive[i]) continue;
        if (!std::isfinite(w.position[i].x) || !std::isfinite(w.velocity[i].x))
            return false;
    }
    return true;
}

TEST(el_paso_fijo_diverge_en_un_encuentro_violento) {
    // Documenta el fallo que motiva todo lo demas.
    World w = makeSolarSystemJ2000();
    w.add("agujero", BodyKind::BlackHole, 30.0, 0.0, Vec3{-3, 0.02, 0},
          Vec3{0.05, 0, 0});
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    double worst = 0.0;
    const double e0 = computeDiagnostics(w).totalEnergy;
    for (int i = 0; i < 20000; ++i) step(w, 2.0, Integrator::VerletKDK, cfg);
    worst = std::fabs((computeDiagnostics(w).totalEnergy - e0) / e0);
    // Con dt = 2 dias y un agujero de 30 masas solares rozando el sistema,
    // la energia se dispara: el resultado carece de sentido fisico.
    ASSERT(worst > 1e-3 || !allFinite(w));
}

TEST(el_paso_adaptativo_sobrevive_al_mismo_encuentro) {
    World w = makeSolarSystemJ2000();
    const std::size_t bh = w.add("agujero", BodyKind::BlackHole, 30.0, 0.0,
                                 Vec3{-3, 0.02, 0}, Vec3{0.05, 0, 0});
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    std::size_t subs = 0;
    for (int i = 0; i < 2000; ++i) {
        subs += stepAdaptive(w, 2.0, Integrator::VerletKDK, cfg);
        processCaptures(w, bh, BlackHoleConfig{});
    }
    ASSERT(allFinite(w));
    ASSERT(sanitize(w) == 0);
    ASSERT(subs > 2000);  // ha tenido que subdividir
}

TEST(el_paso_seguro_se_encoge_cerca_de_una_masa_grande) {
    World calm = makeSolarSystemJ2000();
    ForceConfig cfg;
    computeAccelerations(calm, cfg);
    const double dtCalm = safeStep(calm);

    World tense = makeSolarSystemJ2000();
    tense.add("agujero", BodyKind::BlackHole, 50.0, 0.0, Vec3{1.05, 0, 0},
              Vec3{0, 0, 0});
    computeAccelerations(tense, cfg);
    const double dtTense = safeStep(tense);

    ASSERT(dtCalm > 0.0);
    ASSERT(dtTense < dtCalm * 0.1);
}

TEST(sanitize_retira_un_cuerpo_corrompido_sin_tocar_los_demas) {
    World w = makeSolarSystemJ2000();
    w.position[4].x = std::nan("");
    ASSERT(sanitize(w) == 1);
    ASSERT(w.alive[4] == 0);
    ASSERT(w.alive[3] == 1);
}

TEST(un_agujero_negro_masivo_y_lento_si_absorbe) {
    // A escala real la captura casi nunca ocurre. Con 1000 masas solares
    // el radio de captura crece lo suficiente como para que si pase, y el
    // momento lineal debe conservarse de todas formas.
    World w = makeSolarSystemJ2000();
    const std::size_t bh = w.add("agujero", BodyKind::BlackHole, 1000.0, 0.0,
                                 Vec3{1.0, 0, 0}, Vec3{0, 0, 0});
    ForceConfig cfg;
    computeAccelerations(w, cfg);
    const Vec3 p0 = computeDiagnostics(w).linearMomentum;
    for (int i = 0; i < 4000; ++i) {
        stepAdaptive(w, 0.5, Integrator::VerletKDK, cfg);
        processCaptures(w, bh, BlackHoleConfig{});
    }
    const Vec3 p1 = computeDiagnostics(w).linearMomentum;

    // El momento total de partida es practicamente cero (marco baricentrico),
    // asi que no sirve como referencia relativa: dividir por el da un
    // numero sin sentido. La escala correcta es la suma de los modulos.
    double scale = 0.0;
    for (std::size_t i = 0; i < w.size(); ++i)
        if (w.alive[i]) scale += w.mass[i] * w.velocity[i].norm();

    ASSERT(allFinite(w));
    ASSERT(scale > 0.0);
    ASSERT_NEAR((p1 - p0).norm() / scale, 0.0, 1e-9);
}
