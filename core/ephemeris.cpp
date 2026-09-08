#include "ephemeris.hpp"
#include <cmath>
#include "units.hpp"

namespace gl {

static const KeplerElements kPlanets[] = {
    //  nombre      masa(Msol)   radio(UA)     a            e           i         L            peri         nodo
    {"Mercurio", 1.66012e-7, 1.6310e-5, 0.38709927, 0.20563593, 7.00497902, 252.25032350,  77.45779628,  48.33076593},
    {"Venus",    2.44784e-6, 4.0454e-5, 0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718,  76.67984255},
    {"Tierra",   3.04043e-6, 4.2635e-5, 1.00000261, 0.01671123,-0.00001531, 100.46457166, 102.93768193,   0.00000000},
    {"Marte",    3.22715e-7, 2.2708e-5, 1.52371034, 0.09339410, 1.84969142,  -4.55343205, -23.94362959,  49.55953891},
    {"Jupiter",  9.54792e-4, 4.6733e-4, 5.20288700, 0.04838624, 1.30439695,  34.39644051,  14.72847983, 100.47390909},
    {"Saturno",  2.85886e-4, 3.8926e-4, 9.53667594, 0.05386179, 2.48599187,  49.95424423,  92.59887831, 113.66242448},
    {"Urano",    4.36624e-5, 1.6953e-4,19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630,  74.01692503},
    {"Neptuno",  5.15139e-5, 1.6459e-4,30.06992276, 0.00859048, 1.77004347, -55.12002969,  44.96476227, 131.78422574},
};

// Planetas enanos, asteroides mayores y cometas periodicos.
// Aqui es donde se ve que las orbitas son elipses: Pluton tiene e = 0.249
// y Halley e = 0.967, un 75% mas plana que un circulo.
static const KeplerElements kMinorBodies[] = {
    //  nombre       masa(Msol)   radio(UA)     a            e          i          L            peri        nodo
    {"Ceres",     4.7191e-10, 3.1e-6,  2.76580000, 0.07850000, 10.593000, 231.36000000, 153.99000000,  80.39300000},
    {"Palas",     1.0300e-10, 2.7e-6,  2.77270000, 0.23130000, 34.840000, 182.20000000, 123.13000000, 173.08000000},
    {"Vesta",     1.3000e-10, 2.6e-6,  2.36170000, 0.08890000,  7.140000,  64.40000000, 255.01000000, 103.81000000},
    {"Quiron",    0.0,        6.7e-7, 13.65000000, 0.38230000,  6.930000, 306.80000000, 188.80000000, 209.30000000},
    {"Pluton",    6.5500e-9,  8.0e-6, 39.48211675, 0.24882730, 17.160000, 238.66000000, 224.13000000, 110.29900000},
    {"Haumea",    2.0100e-9,  5.2e-6, 43.13000000, 0.19100000, 28.210000, 219.70000000,   1.30000000, 122.10000000},
    {"Makemake",  1.5500e-9,  4.6e-6, 45.43000000, 0.15900000, 29.000000, 176.30000000,  15.80000000,  79.40000000},
    {"Eris",      8.3400e-9,  8.7e-6, 67.78000000, 0.44070000, 44.040000,  33.58000000, 187.59000000,  35.95000000},
    {"Halley",    0.0,        3.7e-8, 17.83400000, 0.96714000,162.260000, 235.75000000, 169.75000000,  58.42000000},
    {"Encke",     0.0,        1.6e-8,  2.21550000, 0.84850000, 11.780000,   1.07000000, 161.07000000, 334.57000000},
};

void appendFromElements(World& w, const KeplerElements& k, double centralMass) {
    const double d2r = M_PI / 180.0;
    const double i = k.iDeg * d2r;
    const double node = k.nodeDeg * d2r;
    const double argPeri = (k.periDeg - k.nodeDeg) * d2r;
    double M = (k.LDeg - k.periDeg) * d2r;
    M = std::fmod(M + M_PI, 2.0 * M_PI);
    if (M < 0) M += 2.0 * M_PI;
    M -= M_PI;

    // Ecuacion de Kepler por Newton-Raphson. Converge en 4-5 vueltas
    // para excentricidades pequenas; Mercurio con e=0.2056 tampoco da guerra.
    double E = M;
    for (int it = 0; it < 60; ++it) {
        const double f = E - k.e * std::sin(E) - M;
        const double fp = 1.0 - k.e * std::cos(E);
        const double dE = -f / fp;
        E += dE;
        if (std::fabs(dE) < 1e-15) break;
    }

    // Posicion y velocidad en el plano orbital
    const double mu = G * (centralMass + k.mass);
    const double cosE = std::cos(E), sinE = std::sin(E);
    const double xp = k.a * (cosE - k.e);
    const double yp = k.a * std::sqrt(1.0 - k.e * k.e) * sinE;
    const double rr = k.a * (1.0 - k.e * cosE);
    const double n = std::sqrt(mu / (k.a * k.a * k.a));
    const double vxp = -k.a * k.a * n * sinE / rr;
    const double vyp = k.a * k.a * n * std::sqrt(1.0 - k.e * k.e) * cosE / rr;

    // Rotacion al marco de la ecliptica: R_z(nodo) R_x(i) R_z(argPeri)
    const double cw = std::cos(argPeri), sw = std::sin(argPeri);
    const double cO = std::cos(node), sO = std::sin(node);
    const double ci = std::cos(i), si = std::sin(i);

    auto rotate = [&](double x, double y) {
        const double x1 = x * cw - y * sw;
        const double y1 = x * sw + y * cw;
        const double y2 = y1 * ci;
        const double z2 = y1 * si;
        return Vec3{x1 * cO - y2 * sO, x1 * sO + y2 * cO, z2};
    };

    w.add(k.name, BodyKind::Planet, k.mass, k.radiusAU, rotate(xp, yp),
          rotate(vxp, vyp));
}

World makeSolarSystemJ2000(bool withMinorBodies) {
    World w;
    w.add("Sol", BodyKind::Star, 1.0, 0.00465247, Vec3{}, Vec3{});
    for (const auto& k : kPlanets) appendFromElements(w, k, 1.0);
    if (withMinorBodies)
        for (const auto& k : kMinorBodies) appendFromElements(w, k, 1.0);
    w.moveToBarycentricFrame();
    return w;
}

}  // namespace gl
