// Comprobaciones numericas de los experimentos guiados de la web:
// puntos de Lagrange con troyanos reales y la asistencia gravitatoria de
// Voyager 2 en Jupiter.
#include <cmath>
#include <cstdio>
#include <vector>
#include "../core/horizons_data.hpp"
#include "../core/integrator.hpp"
#include "../core/reference.hpp"
#include "../core/units.hpp"
#include "microtest.hpp"

using namespace gl;
using namespace gl::horizons;

static Vec3 v3(const double* p) { return Vec3{p[0], p[1], p[2]}; }

// Angulo (grados) que el cuerpo `body` lleva de ventaja a Jupiter, visto
// desde el Sol y proyectado en la ecliptica. L4 = +60, L5 = -60.
static double leadAngle(const World& w, std::size_t body, std::size_t jupiter = 5) {
    const Vec3 j = w.position[jupiter] - w.position[0];
    const Vec3 t = w.position[body] - w.position[0];
    double a = std::atan2(t.y, t.x) - std::atan2(j.y, j.x);
    a -= 2.0 * M_PI * std::round(a / (2.0 * M_PI));
    return a * 180.0 / M_PI;
}

TEST(los_troyanos_reales_libran_en_torno_a_L4_y_L5_durante_mil_anios) {
    World w = makeSolarSystemHorizons();
    for (const auto& b : TROJANS)
        w.add(b.name, BodyKind::Asteroid, 0.0, 0.0, v3(b.state), v3(b.state + 3));
    ForceConfig cfg;
    cfg.enable1PN = true;
    cfg.enableEarthMoonQuadrupole = true;
    computeAccelerations(w, cfg);

    double lo[6], hi[6], sum[6] = {0};
    for (int i = 0; i < 6; ++i) { lo[i] = 1e9; hi[i] = -1e9; }
    int count = 0;
    for (long s = 1; s <= 365250; ++s) {
        step(w, 1.0, Integrator::Yoshida4, cfg);
        if (s % 20) continue;
        ++count;
        for (int i = 0; i < 6; ++i) {
            const double a = leadAngle(w, 9 + i);
            lo[i] = std::fmin(lo[i], a);
            hi[i] = std::fmax(hi[i], a);
            sum[i] += a;
        }
    }
    for (int i = 0; i < 6; ++i) {
        const double sign = i < 3 ? 1.0 : -1.0;  // tres en L4, tres en L5
        // Nunca cruzan al otro lado ni se acercan a Jupiter...
        ASSERT(sign * lo[i] > 30.0 && sign * hi[i] > 30.0);
        ASSERT(sign * lo[i] < 95.0 && sign * hi[i] < 95.0);
        // ...y de media estan a 60 grados.
        ASSERT_NEAR(sign * sum[i] / count, 60.0, 4.0);
    }
}

TEST(los_troyanos_simulados_coinciden_con_horizons_tras_un_siglo) {
    World w = makeSolarSystemHorizons();
    for (const auto& b : TROJANS)
        w.add(b.name, BodyKind::Asteroid, 0.0, 0.0, v3(b.state), v3(b.state + 3));
    ForceConfig cfg;
    cfg.enable1PN = true;
    cfg.enableEarthMoonQuadrupole = true;
    computeAccelerations(w, cfg);
    const long stepsPerSample = std::lround(TROJAN_STEP_DAYS / 0.5);
    double worst = 0.0;
    for (std::size_t k = 1; k < TROJAN_REF_SAMPLES; ++k) {
        for (long s = 0; s < stepsPerSample; ++s) step(w, 0.5, Integrator::Yoshida6, cfg);
        for (std::size_t i = 0; i < TROJAN_COUNT; ++i) {
            const Vec3 ref = v3(TROJAN_REF + (i * TROJAN_REF_SAMPLES + k) * 3);
            worst = std::fmax(worst, (w.position[9 + i] - ref).norm() * AU_KM);
        }
    }
    std::printf("    peor error de un troyano en 100 anios: %.0f km\n", worst);
    // Medido: ~200 km sobre orbitas de 780 millones de km.
    ASSERT(worst < 600.0);
}

TEST(el_periodo_de_libracion_en_L4_coincide_con_la_teoria) {
    // Problema circular restringido de tres cuerpos: Sol, Jupiter en orbita
    // circular y una particula sin masa un poco desplazada de L4. La teoria
    // lineal da dos frecuencias; la lenta (libracion) vale
    //   T_lib = T_J / sqrt( (1 - sqrt(1 - 27 mu (1 - mu))) / 2 )
    // que para mu pequeno es T_J / sqrt(27 mu / 4): unos 148 anios.
    const double mJ = PLANETS[5].mass, mS = PLANETS[0].mass;
    const double mu = mJ / (mS + mJ), a = 5.2;
    const double n = std::sqrt(G * (mS + mJ) / (a * a * a));
    World w;
    w.add("Sol", BodyKind::Star, mS, 0, Vec3{-mu * a, 0, 0}, Vec3{0, -mu * a * n, 0});
    w.add("Jupiter", BodyKind::Planet, mJ, 0, Vec3{(1 - mu) * a, 0, 0},
          Vec3{0, (1 - mu) * a * n, 0});
    // L4: tercer vertice del triangulo equilatero, girando con el sistema.
    const double off = 2.0 * M_PI / 180.0;  // 2 grados de desplazamiento
    const double ang = M_PI / 3.0 + off;
    const Vec3 sun = w.position[0];
    const Vec3 p = sun + Vec3{a * std::cos(ang), a * std::sin(ang), 0};
    w.add("troyano", BodyKind::Asteroid, 0, 0, p, Vec3{-n * p.y, n * p.x, 0});

    ForceConfig cfg;
    computeAccelerations(w, cfg);
    const double TJ = 2.0 * M_PI / n;
    const double theory = TJ / std::sqrt((1.0 - std::sqrt(1.0 - 27.0 * mu * (1.0 - mu))) / 2.0);

    // Angulo de ventaja promediado sobre un periodo de Jupiter (filtra el
    // epiciclo rapido); el periodo de libracion sale de los cruces por 60.
    const double dt = 2.0;
    const long window = std::lround(TJ / dt);
    std::vector<double> crossings;
    double acc = 0.0, prev = 0.0;
    long inWindow = 0, windows = 0;
    const long total = std::lround(900.0 * 365.25 / dt);
    double lo = 1e9, hi = -1e9;
    for (long s = 1; s <= total; ++s) {
        step(w, dt, Integrator::Yoshida4, cfg);
        const Vec3 j = w.position[1] - w.position[0], t = w.position[2] - w.position[0];
        double lead = std::atan2(t.y, t.x) - std::atan2(j.y, j.x);
        lead -= 2.0 * M_PI * std::round(lead / (2.0 * M_PI));
        acc += lead * 180.0 / M_PI;
        if (++inWindow < window) continue;
        const double mean = acc / window;
        lo = std::fmin(lo, mean); hi = std::fmax(hi, mean);
        if (windows > 0 && prev < 60.0 && mean >= 60.0) {
            const double frac = (60.0 - prev) / (mean - prev);
            crossings.push_back((windows - 1 + frac) * window * dt / 365.25);
        }
        prev = mean; acc = 0.0; inWindow = 0; ++windows;
    }
    ASSERT(crossings.size() >= 4);
    if (crossings.size() < 2) return;
    const double measured = (crossings.back() - crossings.front()) / (crossings.size() - 1);
    std::printf("    libracion en L4: medido %.1f anios, teoria %.1f anios (entre %.1f y %.1f grados)\n",
                measured, theory / 365.25, lo, hi);
    ASSERT_NEAR(measured / (theory / 365.25), 1.0, 0.02);
    ASSERT(lo > 55.0 && hi < 65.0);  // oscila alrededor de 60, no se escapa
}

// Voyager 2 desde 30 dias antes hasta 30 dias despues del sobrevuelo.
struct Flyby {
    double closestKm = 1e30, errBeforeKm = 0, errAfterKm = 0;
    double vHelioIn = 0, vHelioOut = 0, vHelioOutRef = 0, vInfIn = 0, vInfOut = 0;
};

static Flyby runFlyby() {
    Flyby f;
    World w;
    bool first = true;
    for (const auto& b : VOYAGER_BODIES) {
        w.add(b.name, first ? BodyKind::Star : BodyKind::Planet, b.mass, 0,
              v3(b.state), v3(b.state + 3));
        first = false;
    }
    const std::size_t probe =
        w.add("Voyager 2", BodyKind::Asteroid, 0, 0, v3(VOYAGER_PROBE), v3(VOYAGER_PROBE + 3));
    ForceConfig cfg;
    cfg.enable1PN = true;
    computeAccelerations(w, cfg);

    const double gmJ = G * w.mass[5];
    auto vInf = [&]() {
        const double v2 = (w.velocity[probe] - w.velocity[5]).normSquared();
        const double d = (w.position[probe] - w.position[5]).norm();
        return std::sqrt(v2 - 2.0 * gmJ / d) * AU_KM / SECONDS_PER_DAY;
    };
    auto vHelio = [&]() {
        return (w.velocity[probe] - w.velocity[0]).norm() * AU_KM / SECONDS_PER_DAY;
    };
    f.vHelioIn = vHelio();
    f.vInfIn = vInf();

    const int sub = 24;  // 15 minutos por paso
    for (std::size_t k = 1; k < VOYAGER_SAMPLES; ++k) {
        for (int s = 0; s < sub; ++s) {
            step(w, VOYAGER_STEP_DAYS / sub, Integrator::Yoshida6, cfg);
            f.closestKm = std::fmin(f.closestKm,
                (w.position[probe] - w.position[5]).norm() * AU_KM);
        }
        const double err = (w.position[probe] - v3(VOYAGER_PROBE + 6 * k)).norm() * AU_KM;
        if (k == 120) f.errBeforeKm = err;  // dia 30, justo antes del perijove
    }
    const std::size_t last = VOYAGER_SAMPLES - 1;
    f.errAfterKm = (w.position[probe] - v3(VOYAGER_PROBE + 6 * last)).norm() * AU_KM;
    f.vHelioOut = vHelio();
    f.vInfOut = vInf();
    f.vHelioOutRef = (v3(VOYAGER_PROBE + 6 * last + 3) - v3(VOYAGER_SUN + 6 * last + 3)).norm() *
                     AU_KM / SECONDS_PER_DAY;
    return f;
}

TEST(voyager_2_gana_10_km_s_en_jupiter_como_en_la_trayectoria_real) {
    const Flyby f = runFlyby();
    std::printf("    Voyager 2: %.3f -> %.3f km/s heliocentricos (JPL: %.3f), perijove %.0f km\n",
                f.vHelioIn, f.vHelioOut, f.vHelioOutRef, f.closestKm);
    std::printf("    error de posicion: %.0f km antes del sobrevuelo, %.0f km 30 dias despues\n",
                f.errBeforeKm, f.errAfterKm);
    // La sonda dobla su velocidad respecto al Sol.
    ASSERT(f.vHelioOut - f.vHelioIn > 9.5);
    ASSERT_NEAR(f.vHelioOut, f.vHelioOutRef, 0.05);
    // Maxima aproximacion real: 721 670 km del centro de Jupiter.
    ASSERT_NEAR(f.closestKm, 721670.0, 2000.0);
    // Antes del encuentro la trayectoria es casi exacta; despues, Jupiter
    // amplifica lo que el modelo no tiene (su achatamiento, sus lunas, las
    // maniobras de la sonda). 2e5 km en 30 dias son 0.03 km/s.
    ASSERT(f.errBeforeKm < 1000.0);
    ASSERT(f.errAfterKm < 250000.0);
}

TEST(la_asistencia_gravitatoria_no_cambia_la_velocidad_respecto_a_jupiter) {
    // La clave del efecto: en el sistema de Jupiter el encuentro es una
    // hiperbola y la velocidad en el infinito es la misma al entrar que al
    // salir. Solo cambia de direccion. Toda la ganancia respecto al Sol
    // sale de sumar la velocidad orbital de Jupiter (13 km/s) a un vector
    // que ha girado.
    const Flyby f = runFlyby();
    std::printf("    v_inf respecto a Jupiter: %.4f -> %.4f km/s\n", f.vInfIn, f.vInfOut);
    ASSERT_NEAR(f.vInfOut / f.vInfIn, 1.0, 1e-3);
    ASSERT(f.vInfIn > 7.0 && f.vInfIn < 8.5);
}
