#include "analysis.hpp"
#include <cmath>
#include "units.hpp"

namespace gl {

OrbitalElements elementsOf(const World& w, std::size_t body,
                           std::size_t center) {
    OrbitalElements e;
    const Vec3 r = w.position[body] - w.position[center];
    const Vec3 v = w.velocity[body] - w.velocity[center];
    const double mu = G * (w.mass[center] + w.mass[body]);
    const double rn = r.norm();
    if (rn <= 0.0 || mu <= 0.0) return e;

    const Vec3 L = r.cross(v);
    // Vector de Laplace-Runge-Lenz: e_vec = (v x L)/mu - r_hat
    // En Newton de dos cuerpos es una constante del movimiento. Que gire
    // es, literalmente, la definicion de precesion.
    const Vec3 evec = v.cross(L) * (1.0 / mu) - r * (1.0 / rn);

    e.eccentricityVector = evec;
    e.eccentricity = evec.norm();
    e.semiMajorAxis = 1.0 / (2.0 / rn - v.normSquared() / mu);
    e.periapsisAngle = std::atan2(evec.y, evec.x);
    return e;
}

double precessionRate(const std::vector<double>& timesDays,
                      const std::vector<double>& anglesRad) {
    const std::size_t n = timesDays.size();
    if (n < 2 || anglesRad.size() != n) return 0.0;

    // Desenrollar: el angulo vive en (-pi, pi] y salta al dar la vuelta.
    std::vector<double> a(n);
    a[0] = anglesRad[0];
    double offset = 0.0;
    for (std::size_t i = 1; i < n; ++i) {
        double d = anglesRad[i] - anglesRad[i - 1];
        while (d > M_PI) { offset -= 2.0 * M_PI; d -= 2.0 * M_PI; }
        while (d < -M_PI) { offset += 2.0 * M_PI; d += 2.0 * M_PI; }
        a[i] = anglesRad[i] + offset;
    }

    // Recta por minimos cuadrados: la pendiente es la tasa en rad/dia.
    double st = 0, sa = 0, stt = 0, sta = 0;
    for (std::size_t i = 0; i < n; ++i) {
        st += timesDays[i]; sa += a[i];
        stt += timesDays[i] * timesDays[i];
        sta += timesDays[i] * a[i];
    }
    const double den = n * stt - st * st;
    if (den == 0.0) return 0.0;
    const double slope = (n * sta - st * sa) / den;
    return slope * ARCSEC_PER_RADIAN * DAYS_PER_JULIAN_CENTURY;
}

}  // namespace gl
