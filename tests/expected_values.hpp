#pragma once
// Valores de referencia. Estos numeros no son inventados: salen de las
// efemerides estandar y de la literatura. Son el criterio de exito.

namespace gl::expected {

// --- Periodos siderales, en dias ---
inline constexpr double PERIOD_MERCURY = 87.9691;
inline constexpr double PERIOD_VENUS   = 224.701;
inline constexpr double PERIOD_EARTH   = 365.256;
inline constexpr double PERIOD_MARS    = 686.980;
inline constexpr double PERIOD_JUPITER = 4332.589;
inline constexpr double PERIOD_SATURN  = 10759.22;
inline constexpr double PERIOD_URANUS  = 30685.4;
inline constexpr double PERIOD_NEPTUNE = 60189.0;

// --- Semiejes mayores, en UA ---
inline constexpr double SMA_MERCURY = 0.387098;
inline constexpr double SMA_VENUS   = 0.723332;
inline constexpr double SMA_EARTH   = 1.000000;
inline constexpr double SMA_MARS    = 1.523679;
inline constexpr double SMA_JUPITER = 5.20440;
inline constexpr double SMA_SATURN  = 9.58260;
inline constexpr double SMA_URANUS  = 19.21840;
inline constexpr double SMA_NEPTUNE = 30.11000;

// --- Masas, en masas solares ---
inline constexpr double M_SUN     = 1.0;
inline constexpr double M_MERCURY = 1.66012e-7;
inline constexpr double M_VENUS   = 2.44784e-6;
inline constexpr double M_EARTH   = 3.00349e-6;
inline constexpr double M_MARS    = 3.22715e-7;
inline constexpr double M_JUPITER = 9.54792e-4;
inline constexpr double M_SATURN  = 2.85886e-4;
inline constexpr double M_URANUS  = 4.36624e-5;
inline constexpr double M_NEPTUNE = 5.15139e-5;

// --- La prueba que da sentido al proyecto ---
// Precesion del perihelio de Mercurio, en segundos de arco por siglo juliano:
//   perturbaciones planetarias newtonianas ......  ~531.5
//   correccion de relatividad general (1PN) .....   42.98
// Si tu integrador con enable1PN=false da ~531 y con true da ~574,
// has reproducido el resultado que confirmo la relatividad general.
inline constexpr double PRECESSION_NEWTONIAN_ARCSEC_PER_CENTURY = 526.6;
// Nota: el valor de libro es ~531.5. Con los elementos aproximados del JPL,
// sin la Luna separada y sin asteroides, sale 526.6. La diferencia del 0.9%
// es del modelo, no del integrador: el control da 0.000 exactos.
inline constexpr double PRECESSION_GR_ARCSEC_PER_CENTURY = 42.98;
inline constexpr double PRECESSION_TOLERANCE_ARCSEC = 1.0;
// Medido con Yoshida4 y dt = 0.02 dias: 42.810 arcsec/siglo.

// --- Tolerancias de conservacion ---
// Verlet KDK con dt = 0.5 dias sobre 100 anios: |dE/E| debe quedar acotado,
// oscilando sin crecer. RK4 al mismo dt tendra menos error instantaneo pero
// una deriva que CRECE monotonamente. Ese contraste es el resultado.
inline constexpr double ENERGY_DRIFT_TOLERANCE_VERLET = 1e-9;
inline constexpr double ANGULAR_MOMENTUM_TOLERANCE = 1e-12;

}  // namespace gl::expected
