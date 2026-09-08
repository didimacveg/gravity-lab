# Condiciones iniciales

Las condiciones iniciales se generan en `core/ephemeris.cpp` a partir de los
elementos keplerianos de la epoca J2000.0 publicados por el JPL, resolviendo
la ecuacion de Kepler `M = E - e·sen(E)` por Newton-Raphson.

No hace falta descargar nada para que el proyecto funcione.

## Cuando si merece la pena bajar efemerides reales

Los elementos aproximados del JPL valen para 1800-2050 y dan una precesion
newtoniana de Mercurio de 526.6 arcsec/siglo, frente a los ~531.5 del valor
de libro. La diferencia del 0.9% viene del modelo: faltan la Luna como
cuerpo separado, los asteroides mayores y el achatamiento del Sol.

Para cerrar ese hueco, saca los vectores de estado de JPL Horizons:
<https://ssd.jpl.nasa.gov/horizons/app.html>

| Campo | Valor |
|---|---|
| Ephemeris Type | Vector Table |
| Coordinate Center | Solar System Barycenter (@0) |
| Table Settings | Type 2, salida en AU y AU/day |

Guardalo como `data/solar_system.csv` con columnas
`name,mass,radius,x,y,z,vx,vy,vz` y cargalo con `loadFromCSV`.

## Verificacion inmediata

Con los datos bien cargados, la suma de m·v de los nueve cuerpos debe dar
practicamente cero. Si no, has mezclado marcos o unidades.
