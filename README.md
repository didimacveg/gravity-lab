# gravity-lab

Simulador N-cuerpos del sistema solar en C++, con condiciones iniciales
reales de la epoca J2000 y validado contra medidas astronomicas conocidas.
Incluye un modulo de agujero negro y una version interactiva en navegador.

No es un planetario. Es un banco de pruebas de integradores numericos que,
ademas, se puede mirar.

## El resultado

Mercurio adelanta su perihelio mas de lo que permite la gravedad de Newton.
La discrepancia se midio en 1859 y no tuvo explicacion durante 56 anios,
hasta que la relatividad general la dio en 1915. Este simulador la reproduce.

| Modelo | Precesion del perihelio de Mercurio |
|---|---|
| Solo Sol y Mercurio, Newton | 0.000 arcsec/siglo |
| Los ocho planetas, Newton | 526.640 arcsec/siglo |
| Los ocho planetas, con termino 1PN | 569.450 arcsec/siglo |
| **Aportacion de la relatividad** | **42.810 arcsec/siglo** |

Valor aceptado: 42.98 arcsec/siglo. Error del 0.4%.

La primera fila es el control: sin perturbaciones ni relatividad la
precesion debe ser exactamente cero, y lo es. Sin ese cero las otras filas
no significarian nada, porque un integrador mediocre inventa precesion por
su cuenta. Con `dt = 0.2` dias este mismo codigo produce 67 arcsec/siglo de
precesion espuria, mas del doble del efecto que queremos medir.

## Conservacion de energia por integrador

Sistema solar completo, `dt = 0.5` dias, error relativo `|dE/E|`:

| Integrador | A los 10 anios | A los 100 anios |
|---|---|---|
| Euler explicito | 2.1e-02 | 8.0e-02 |
| RK4 | 2.5e-09 | 2.6e-08 |
| Verlet KDK | 6.3e-07 | 3.3e-08 |
| Yoshida 4 | 2.2e-09 | 1.4e-11 |

RK4 es de cuarto orden y comete menos error en cada paso que Verlet, que es
de segundo. Aun asi su error **crece**, mientras que el de Verlet oscila sin
acumularse. La razon es que Verlet y Yoshida son simplecticos: conservan la
estructura geometrica del flujo hamiltoniano, asi que la energia queda
atrapada cerca de su valor inicial en vez de derivar. Para integraciones
largas importa mas esa propiedad que el orden de convergencia.

## El agujero negro

Un agujero negro de 10 masas solares tiene un horizonte de sucesos de
**30 km**, que a escala del sistema solar son 2e-7 UA: un punto matematico.
Ni siquiera con enfoque gravitatorio el radio de captura llega a 0.01 UA.

De modo que **un agujero negro no se traga el sistema solar**. Lo destruye
desordenando las orbitas hasta que los planetas salen despedidos con energia
orbital positiva. Hay un test que comprueba exactamente eso: tras un
encuentro a 100 UA hay planetas expulsados y ninguno absorbido.

La visualizacion permite ampliar el horizonte hasta 10^8 veces para que se
vea algo, y muestra el factor en pantalla mientras esta activo. Exageracion
etiquetada, no encubierta.

## Las orbitas son elipses, aunque no lo parezcan

Mirando el simulador da la impresion de que los planetas giran en circulos.
No es un fallo del modelo: es que las orbitas planetarias son casi
circulares de verdad.

| Cuerpo | Excentricidad | Achatamiento b/a | Perihelio - afelio |
|---|---|---|---|
| Venus | 0.00678 | 0.99998 | 0.72 - 0.73 UA |
| Tierra | 0.01671 | 0.99986 | 0.98 - 1.02 UA |
| Marte | 0.09339 | 0.99563 | 1.38 - 1.67 UA |
| Mercurio | 0.20564 | 0.97863 | 0.31 - 0.47 UA |
| Pluton | 0.24883 | 0.96855 | 29.7 - 49.3 UA |
| Halley | 0.96714 | 0.25424 | 0.59 - 35.1 UA |

La elipse de la Tierra es un 0.014% mas plana que una circunferencia:
ninguna pantalla resuelve eso. Lo que la delata no es la forma, sino que el
Sol no esta en el centro sino en un foco, desplazado a*e = 0.0167 UA.

Por eso el simulador dibuja las elipses osculadoras completas y marca
perihelio y afelio: se ve que el Sol esta descentrado aunque la curva
parezca redonda. Y por eso incluye cometas: en Halley, con e = 0.967, la
elipse es evidente sin necesidad de medir nada.

## Que hay dentro

```
core/       fisica pura, sin dependencias graficas
  units.hpp       unidades UA / dia / masa solar, G de Gauss, c, r_s
  state.*         estado en arrays, energias y momentos
  forces.*        gravedad newtoniana y correccion 1PN
  integrator.*    Euler, RK4, Verlet KDK, Yoshida 4
  ephemeris.*     elementos J2000 -> vectores de estado
  analysis.*      elementos orbitales y tasa de precesion
  blackhole.*     horizonte, captura, limite de Roche
                  forces incluye tambien el achatamiento solar J2
app/        ventana nativa con raylib
web/        simulador.html: fichero unico, misma fisica en JavaScript
tests/      27 casos de validacion, framework propio de 40 lineas
bench/      corrida headless y grafica de deriva de energia
```

El estado del universo es un struct plano de arrays, completamente separado
del renderizado. Reiniciar es recargar el escenario; guardar es serializar
el struct.

## Poner en marcha

Ver [SETUP_WSL.md](SETUP_WSL.md). En resumen:

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j
./build/gl_tests     # 17 casos
./build/gl_bench     # genera energy_drift.csv
```

Para el simulador interactivo basta con abrir `web/simulador.html` en
cualquier navegador. Es un fichero unico sin dependencias: no hace falta
servidor, ni compilar, ni conexion.

## Estabilidad numerica

Con paso de tiempo fijo la simulacion revienta en cuanto hay un encuentro
cercano: la aceleracion se dispara, la posicion salta a infinito y en pocos
pasos todo el estado es NaN. Es el fallo clasico de los integradores de
paso fijo, y hay un test que lo documenta a proposito.

La solucion es subdividir el paso segun la escala de tiempo dinamica local:

    dt = eta * min( |v|/|a| ,  sqrt(r^3 / (G*(m_i+m_j))) )

El primer termino es el tiempo en que la gravedad cambia apreciablemente la
velocidad; el segundo, el tiempo de caida libre entre los dos cuerpos mas
proximos. Con eta = 0.02 salen unos 300 pasos por orbita.

Encima de eso hay dos redes de seguridad: un presupuesto maximo de subpasos
por llamada, para que un encuentro violento ralentice la simulacion en vez
de colgarla, y una pasada que retira cuerpos cuyo estado ha dejado de ser
finito, porque un solo NaN contamina a todos los demas a traves de las
aceleraciones en un unico paso.

Verificado: 240000 pasos objetivo con un agujero negro de 10 masas solares
atravesando el sistema se resuelven en 714000 subpasos, sin un solo NaN y
sin perder ningun cuerpo.

## Limitaciones conocidas

- Paso de tiempo fijo. Un encuentro cercano exige bajarlo a mano.
- El termino 1PN se aplica solo respecto al cuerpo central dominante, no
  como la formulacion completa de Einstein-Infeld-Hoffmann.
- La Tierra y la Luna van como un solo cuerpo en el baricentro del par.
- Faltan asteroides, achatamiento solar y presion de radiacion. De ahi el
  0.9% de diferencia entre los 526.6 arcsec/siglo medidos aqui y los 531.5
  del valor de libro.
- La version web integra en doble precision de JavaScript y usa proyeccion
  ortografica sobre el plano de la ecliptica, no un render 3D completo.
- El fondo estelar es un mapa equirectangular de 28 estrellas reales con sus
  coordenadas J2000, magnitudes y colores por tipo espectral, mas relleno
  sintetico. No rota con la camara: es telon de fondo, no paralaje real.
- La Luna va incorporada a la Tierra como un solo cuerpo en el baricentro
  del par.
