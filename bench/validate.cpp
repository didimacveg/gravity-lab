// Validacion contra NASA/JPL Horizons (DE441): error de posicion
// heliocentrica de cada planeta para cada integrador y paso de tiempo.
//   ./gl_validate [dir_de_salida]
// Escribe validation.json (lo lee la web) y validation.md (va al README).
#include <cmath>
#include <cstdio>
#include <fstream>
#include <string>
#include <vector>
#include "../core/analysis.hpp"
#include "../core/horizons_data.hpp"
#include "../core/reference.hpp"
#include "../core/units.hpp"

using namespace gl;

#ifndef GL_DATA_DIR
#define GL_DATA_DIR "web/data"
#endif

struct Case {
    const char* id; const char* integrator; Integrator m; double dt;
    bool pn; bool emq; const char* model;
};

static std::string num(double v) {
    char b[64];
    if (!std::isfinite(v)) return "null";
    std::snprintf(b, sizeof b, "%.6g", v);
    return b;
}

static std::string km(double v) {
    char b[64];
    if (!std::isfinite(v)) return "diverged";
    if (v >= 1e6) std::snprintf(b, sizeof b, "%.2e", v);
    else if (v >= 100) std::snprintf(b, sizeof b, "%.0f", v);
    else std::snprintf(b, sizeof b, "%.1f", v);
    return b;
}

int main(int argc, char** argv) {
    const std::string outDir = argc > 1 ? argv[1] : ".";
    const Reference ref = loadReference(std::string(GL_DATA_DIR) + "/horizons_planets.f64");
    if (!ref.ok()) { std::printf("no reference data in %s\n", GL_DATA_DIR); return 1; }

    const Case cases[] = {
        {"yoshida6_0.25", "Yoshida 6", Integrator::Yoshida6, 0.25, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"yoshida6_0.5", "Yoshida 6", Integrator::Yoshida6, 0.5, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"yoshida6_1", "Yoshida 6", Integrator::Yoshida6, 1.0, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"yoshida6_2", "Yoshida 6", Integrator::Yoshida6, 2.0, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"yoshida4_0.0625", "Yoshida 4", Integrator::Yoshida4, 0.0625, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"yoshida4_0.125", "Yoshida 4", Integrator::Yoshida4, 0.125, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"yoshida4_0.25", "Yoshida 4", Integrator::Yoshida4, 0.25, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"yoshida4_0.5", "Yoshida 4", Integrator::Yoshida4, 0.5, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"yoshida4_1", "Yoshida 4", Integrator::Yoshida4, 1.0, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"rk4_0.0625", "RK4", Integrator::RK4, 0.0625, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"rk4_0.25", "RK4", Integrator::RK4, 0.25, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"rk4_1", "RK4", Integrator::RK4, 1.0, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"verlet_0.0625", "Verlet", Integrator::VerletKDK, 0.0625, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"verlet_0.25", "Verlet", Integrator::VerletKDK, 0.25, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"verlet_1", "Verlet", Integrator::VerletKDK, 1.0, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"euler_0.0625", "Euler", Integrator::ExplicitEuler, 0.0625, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"euler_0.25", "Euler", Integrator::ExplicitEuler, 0.25, true, true, "Newton + 1PN + Earth-Moon quadrupole"},
        {"yoshida6_0.25_noemq", "Yoshida 6", Integrator::Yoshida6, 0.25, true, false, "Newton + 1PN (Earth-Moon as a point)"},
        {"yoshida6_0.25_newton", "Yoshida 6", Integrator::Yoshida6, 0.25, false, true, "Newton + Earth-Moon quadrupole (no relativity)"},
    };

    std::ofstream js(outDir + "/validation.json");
    std::ofstream md(outDir + "/validation.md");
    js << "{\"reference\":\"NASA/JPL Horizons, DE441\",\"metric\":\"max heliocentric position error, km\","
       << "\"planets\":[\"Mercury\",\"Venus\",\"Earth\",\"Mars\",\"Jupiter\",\"Saturn\",\"Uranus\",\"Neptune\"],\n\"cases\":[";
    md << "| Integrator | dt (days) | Span | Mercury | Venus | Earth | Mars | Jupiter | Saturn | Uranus | Neptune | max \\|dE/E\\| |\n"
       << "|---|---|---|---|---|---|---|---|---|---|---|---|\n";

    bool firstCase = true;
    for (const Case& c : cases) {
        ForceConfig cfg;
        cfg.enable1PN = c.pn;
        cfg.enableEarthMoonQuadrupole = c.emq;
        const ValidationRun r = runValidation(ref, makeSolarSystemHorizons(), c.m, c.dt, 100.0, cfg);

        // Ritmo de varpi de Mercurio con el mismo ajuste que se aplica a DE441.
        std::vector<double> t;
        for (double y : r.years) t.push_back(y * 365.25);
        const double rate = precessionRate(t, r.mercuryVarpi);

        js << (firstCase ? "\n" : ",\n") << "{\"id\":\"" << c.id << "\",\"integrator\":\"" << c.integrator
           << "\",\"model\":\"" << c.model << "\",\"emq\":" << (c.emq ? "true" : "false")
           << ",\"dt\":" << c.dt << ",\"pn\":" << (c.pn ? "true" : "false")
           << ",\"max_energy_drift\":" << num(r.maxEnergyDrift)
           << ",\"mercury_varpi_rate\":" << num(rate) << ",\"checkpoints\":[";
        for (std::size_t i = 0; i < r.checkpointYears.size(); ++i) {
            js << (i ? "," : "") << "{\"years\":" << r.checkpointYears[i] << ",\"km\":[";
            if (i == 0) md << "| " << c.integrator << (c.pn && c.emq ? "" : c.pn ? " (no Moon term)" : " (no 1PN)") << " | " << c.dt;
            else md << "| | ";
            md << " | " << r.checkpointYears[i] << " yr |";
            for (std::size_t p = 0; p < r.maxErrorKm[i].size(); ++p) {
                js << (p ? "," : "") << num(r.maxErrorKm[i][p]);
                md << " " << km(r.maxErrorKm[i][p]) << " |";
            }
            js << "]}";
            md << " " << (i + 1 == r.checkpointYears.size() ? num(r.maxEnergyDrift) : "") << " |\n";
        }
        js << "]}";
        firstCase = false;
        char label[96];
        std::snprintf(label, sizeof label, "%s dt=%g %s", c.integrator, c.dt, c.pn && c.emq ? "" : c.model);
        std::printf("%-40.40s  Mercury %12s km  Earth %12s km  Neptune %10s km  dE %.2e  varpi %.3f\"/cy\n",
                    label, km(r.maxErrorKm.back()[0]).c_str(), km(r.maxErrorKm.back()[2]).c_str(),
                    km(r.maxErrorKm.back()[7]).c_str(), r.maxEnergyDrift, rate);
    }
    js << "\n],\"de441_mercury_varpi_rate\":" << num(horizons::MERCURY_VARPI_RATE_ARCSEC_CY) << "}\n";
    std::printf("DE441 varpi rate, same fit: %.3f\"/cy\n", horizons::MERCURY_VARPI_RATE_ARCSEC_CY);
    return 0;
}
