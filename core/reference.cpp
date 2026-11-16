#include "reference.hpp"
#include <cmath>
#include <cstdio>
#include "analysis.hpp"
#include "horizons_data.hpp"
#include "units.hpp"

namespace gl {

World makeSolarSystemHorizons() {
    World w;
    bool first = true;
    for (const auto& b : horizons::PLANETS) {
        w.add(b.name, first ? BodyKind::Star : BodyKind::Planet, b.mass,
              b.radiusAU, Vec3{b.state[0], b.state[1], b.state[2]},
              Vec3{b.state[3], b.state[4], b.state[5]});
        first = false;
    }
    return w;
}

Vec3 Reference::position(std::size_t sample, std::size_t body) const {
    const double* p = &data[(sample * horizons::BODIES + body) * 3];
    return Vec3{p[0], p[1], p[2]};
}

Reference loadReference(const std::string& path) {
    Reference ref;
    const std::size_t count = horizons::SAMPLES * horizons::BODIES * 3;
    std::FILE* f = std::fopen(path.c_str(), "rb");
    if (!f) return ref;
    ref.data.resize(count);
    // Fichero little-endian; todas las plataformas donde corre esto lo son.
    const std::size_t got = std::fread(ref.data.data(), sizeof(double), count, f);
    const bool atEnd = std::fgetc(f) == EOF;
    std::fclose(f);
    if (got != count || !atEnd) ref.data.clear();
    return ref;
}

double heliocentricErrorKm(const World& w, const Reference& ref,
                           std::size_t sample, std::size_t body) {
    const Vec3 sim = w.position[body] - w.position[0];
    const Vec3 real = ref.position(sample, body) - ref.position(sample, 0);
    return (sim - real).norm() * AU_KM;
}

ValidationRun runValidation(const Reference& ref, World w, Integrator method,
                            double dt, double years, const ForceConfig& cfg) {
    ValidationRun out;
    const std::size_t planets = horizons::BODIES - 1;
    const long stepsPerSample = std::lround(horizons::CADENCE_DAYS / dt);
    const std::size_t samples = static_cast<std::size_t>(
        years * 365.25 / horizons::CADENCE_DAYS);

    for (double y : {1.0, 10.0, 100.0})
        if (y <= years + 1e-9) out.checkpointYears.push_back(y);
    out.maxErrorKm.assign(out.checkpointYears.size(),
                          std::vector<double>(planets, 0.0));

    computeAccelerations(w, cfg);
    auto energy = [&]() {
        return computeDiagnostics(w).totalEnergy + (cfg.enable1PN ? energy1PN(w) : 0.0);
    };
    const double e0 = energy();
    std::vector<double> running(planets, 0.0);

    for (std::size_t k = 1; k <= samples; ++k) {
        for (long s = 0; s < stepsPerSample; ++s) step(w, dt, method, cfg);
        const std::size_t sample = horizons::EPOCH_INDEX + k;
        if (sample >= horizons::SAMPLES) break;
        const double yr = k * horizons::CADENCE_DAYS / 365.25;

        std::vector<double> row(planets);
        for (std::size_t p = 0; p < planets; ++p) {
            row[p] = heliocentricErrorKm(w, ref, sample, p + 1);
            if (!(row[p] <= running[p])) running[p] = row[p];  // NaN se propaga
        }
        for (std::size_t c = 0; c < out.checkpointYears.size(); ++c)
            if (yr <= out.checkpointYears[c] + 1e-9) out.maxErrorKm[c] = running;

        const double drift =
            std::fabs((energy() - e0) / e0);
        if (!(drift <= out.maxEnergyDrift)) out.maxEnergyDrift = drift;
        out.finalEnergyDrift = drift;

        out.years.push_back(yr);
        out.errorKm.push_back(row);
        out.energyDrift.push_back(drift);
        out.mercuryVarpi.push_back(longitudeOfPerihelion(w, 1, 0));
    }
    return out;
}

}  // namespace gl
