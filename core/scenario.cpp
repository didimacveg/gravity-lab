// IMPLEMENTADO: es fontaneria, no fisica. Parsear un CSV no demuestra nada.
#include "scenario.hpp"
#include <cmath>
#include <fstream>
#include <sstream>
#include "units.hpp"

namespace gl {

World loadFromCSV(const std::string& path) {
    World w;
    std::ifstream in(path);
    if (!in) return w;

    std::string line;
    std::getline(in, line);  // cabecera
    while (std::getline(in, line)) {
        if (line.empty()) continue;
        std::stringstream ss(line);
        std::string field;
        std::string name;
        double v[8] = {0};
        std::getline(ss, name, ',');
        for (int i = 0; i < 8 && std::getline(ss, field, ','); ++i)
            v[i] = std::stod(field);
        w.add(name, v[0] > 0.5 ? BodyKind::Star : BodyKind::Planet, v[0], v[1],
              Vec3{v[2], v[3], v[4]}, Vec3{v[5], v[6], v[7]});
    }
    w.moveToBarycentricFrame();
    return w;
}

World makeCircularTwoBody(double radiusAU, double centralMass) {
    World w;
    w.add("central", BodyKind::Star, centralMass, 0.00465, Vec3{}, Vec3{});
    // v = sqrt(GM/r) da una circunferencia exacta si la masa de prueba
    // es despreciable
    const double v = std::sqrt(G * centralMass / radiusAU);
    w.add("probe", BodyKind::Planet, 0.0, 0.0, Vec3{radiusAU, 0, 0},
          Vec3{0, v, 0});
    return w;
}

World makeEllipticTwoBody(double a, double e, double centralMass) {
    World w;
    w.add("central", BodyKind::Star, centralMass, 0.00465, Vec3{}, Vec3{});
    const double rp = a * (1.0 - e);
    // Velocidad en el perihelio (vis-viva): v^2 = GM (2/r - 1/a)
    const double v = std::sqrt(G * centralMass * (2.0 / rp - 1.0 / a));
    w.add("probe", BodyKind::Planet, 0.0, 0.0, Vec3{rp, 0, 0}, Vec3{0, v, 0});
    return w;
}

World makeSolarSystemApprox() {
    struct Row { const char* name; double mass; double a; };
    static const Row rows[] = {
        {"Mercurio", 1.66012e-7, 0.387098}, {"Venus", 2.44784e-6, 0.723332},
        {"Tierra", 3.00349e-6, 1.000000},   {"Marte", 3.22715e-7, 1.523679},
        {"Jupiter", 9.54792e-4, 5.204400},  {"Saturno", 2.85886e-4, 9.582600},
        {"Urano", 4.36624e-5, 19.218400},   {"Neptuno", 5.15139e-5, 30.110000},
    };
    World w;
    w.add("Sol", BodyKind::Star, 1.0, 0.00465, Vec3{}, Vec3{});
    double phase = 0.0;
    for (const auto& r : rows) {
        const double v = std::sqrt(G * (1.0 + r.mass) / r.a);
        w.add(r.name, BodyKind::Planet, r.mass, 4.3e-5,
              Vec3{r.a * std::cos(phase), r.a * std::sin(phase), 0.0},
              Vec3{-v * std::sin(phase), v * std::cos(phase), 0.0});
        phase += 0.7;  // separarlos para que no salgan alineados
    }
    w.moveToBarycentricFrame();
    return w;
}

}  // namespace gl
