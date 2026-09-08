#pragma once
// Sistema de unidades: UA, dias, masas solares.
// Elegido para que las magnitudes del sistema solar queden cerca de 1
// y el error de redondeo en double se mantenga controlado.

namespace gl {

// Constante gravitatoria de Gauss al cuadrado: k^2, con k = 0.01720209895
// Unidades: UA^3 / (M_sol * dia^2)
inline constexpr double G = 2.9591220828559e-4;

// Velocidad de la luz en UA/dia. Necesaria para el termino 1PN y para r_s.
inline constexpr double C_LIGHT = 173.1446326846693;

// Radio de Schwarzschild por masa solar, en UA.
// r_s = 2GM/c^2  ->  2.95 km  ->  1.97e-8 UA
inline constexpr double R_SCHWARZSCHILD_PER_SOLAR_MASS =
    2.0 * G / (C_LIGHT * C_LIGHT);

inline constexpr double SECONDS_PER_DAY = 86400.0;
inline constexpr double DAYS_PER_JULIAN_CENTURY = 36525.0;
inline constexpr double ARCSEC_PER_RADIAN = 206264.806247;

}  // namespace gl
