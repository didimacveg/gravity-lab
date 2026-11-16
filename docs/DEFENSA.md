# Defensa de gravity-lab

Este documento es para ti, Diego. Explica la física del proyecto desde cero y
recoge las quince preguntas que con más probabilidad te hará un profesor de
física, con sus respuestas. Todos los números que aparecen salen del código
de este repositorio y puedes reproducirlos (al final se dice cómo).

Léelo con el simulador abierto. Una explicación que has visto funcionar se
defiende mucho mejor que una que has memorizado.

## Índice

1. [La ley de gravitación](#1-la-ley-de-gravitación)
2. [Por qué hay que integrar numéricamente](#2-por-qué-hay-que-integrar-numéricamente)
3. [Integradores: de Euler a Yoshida](#3-integradores-de-euler-a-yoshida)
4. [Qué significa simpléctico](#4-qué-significa-simpléctico)
5. [La corrección 1PN y el perihelio de Mercurio](#5-la-corrección-1pn-y-el-perihelio-de-mercurio)
6. [El achatamiento del Sol: J2](#6-el-achatamiento-del-sol-j2)
7. [La Luna: el cuadrupolo Tierra-Luna](#7-la-luna-el-cuadrupolo-tierra-luna)
8. [Puntos de Lagrange](#8-puntos-de-lagrange)
9. [Asistencia gravitatoria](#9-asistencia-gravitatoria)
10. [La validación contra JPL Horizons](#10-la-validación-contra-jpl-horizons)
11. [Las 15 preguntas](#11-las-15-preguntas)
12. [Cómo reproducir cada número](#12-cómo-reproducir-cada-número)

---

## 1. La ley de gravitación

Dos masas puntuales `m₁` y `m₂` separadas una distancia `r` se atraen con una
fuerza

```
F = G · m₁ · m₂ / r²
```

dirigida a lo largo de la línea que las une. Como `F = m·a`, la aceleración
que sufre el cuerpo 1 no depende de su propia masa:

```
a₁ = G · m₂ · (r₂ − r₁) / |r₂ − r₁|³
```

El cubo del denominador no es un error: `(r₂ − r₁)` es un vector de longitud
`r`, así que dividir por `r³` deja una magnitud `1/r²` con la dirección
correcta.

Con N cuerpos, la aceleración de cada uno es la suma de las que le producen
todos los demás. Eso es todo el modelo newtoniano. En el código está en
`core/forces.cpp`, función `computeAccelerations`, y tiene un detalle
importante: cada par `(i, j)` se visita **una sola vez** y la fuerza se
aplica a los dos con signo contrario. Así la tercera ley de Newton se cumple
por construcción y el momento lineal total se conserva hasta el último bit.

**Unidades.** El simulador trabaja en unidades astronómicas, días y masas
solares. En esas unidades las cantidades del sistema solar quedan cerca de 1
(la Tierra está a 1 UA y se mueve a 0,017 UA/día) y se pierde menos
precisión por redondeo que con metros y segundos. La constante es
`G = k² = 2,9591220828559·10⁻⁴ UA³/(M☉·día²)`, el cuadrado de la constante
de Gauss.

**Por qué puntos.** Una esfera homogénea atrae hacia fuera exactamente igual
que un punto con toda su masa en el centro (teorema de las capas de Newton).
Los planetas son casi esféricos y están muy separados, así que tratarlos como
puntos es una aproximación excelente. Donde falla es donde luego hay que
añadir correcciones: el Sol achatado (J2) y la pareja Tierra-Luna.

## 2. Por qué hay que integrar numéricamente

Con **dos** cuerpos el problema tiene solución exacta: la órbita es una
cónica (elipse, parábola o hipérbola) con el centro de masas en un foco. Son
las leyes de Kepler.

Con **tres o más** no existe una fórmula cerrada general. Poincaré demostró a
finales del siglo XIX que el problema de tres cuerpos no tiene suficientes
cantidades conservadas para resolverse por cuadraturas, y que sus soluciones
pueden ser caóticas. El sistema solar tiene un Sol y ocho planetas que se
perturban mutuamente: no hay atajo.

Lo que sí se puede hacer es avanzar en pasos pequeños. Si conozco posiciones
y velocidades ahora, calculo las aceleraciones con la ley de gravitación,
y con ellas estimo dónde estará todo un instante `dt` después. Repetido
millones de veces, eso es una integración numérica.

El problema es que cada paso comete un pequeño error y los errores se
acumulan. Todo el arte está en elegir un método cuyo error no destruya lo que
quieres medir. Para la precesión de Mercurio, lo que quieres medir son 43
segundos de arco por siglo: un ángulo de 0,012 grados después de 415 órbitas.

## 3. Integradores: de Euler a Yoshida

Todos responden a la misma pregunta: dados `x`, `v` y `a(x)` ahora, ¿cuánto
valen `x` y `v` dentro de `dt`?

### Euler explícito (orden 1)

```
x ← x + v·dt
v ← v + a(x_viejo)·dt
```

Usa durante todo el paso la velocidad y la aceleración del principio. En una
órbita circular eso significa moverse por la tangente: al final del paso
estás un poco más lejos del Sol de lo que deberías. En cada vuelta la órbita
se abre un poco y la energía **crece siempre**. Con `dt = 0,25` días, tras un
siglo, Mercurio está a mil millones de kilómetros de donde debería.

### Velocity Verlet o "kick-drift-kick" (orden 2)

```
v ← v + a(x)·dt/2        (medio empujón)
x ← x + v·dt             (deriva)
v ← v + a(x_nuevo)·dt/2  (medio empujón)
```

Mismo coste que Euler (una evaluación de fuerzas por paso) pero simétrico:
si cambias `dt` por `−dt`, el paso se deshace exactamente. Esa simetría es la
que lo hace simpléctico y le da un comportamiento a largo plazo
completamente distinto.

### Runge-Kutta 4 (orden 4)

Evalúa la fuerza cuatro veces por paso en puntos intermedios y las combina.
Es mucho más preciso por paso que Verlet. Pero no es simétrico ni
simpléctico, y su error de energía se acumula con el tiempo.

### Yoshida 4 (orden 4, simpléctico)

Tres pasos de Verlet seguidos, con longitudes `w₁·dt`, `w₀·dt`, `w₁·dt`:

```
w₁ = 1 / (2 − 2^(1/3)) =  1,3512
w₀ = −2^(1/3) · w₁     = −1,7024
```

Suman 1, así que en total se avanza `dt`. El paso central es **negativo**:
retrocede en el tiempo. No es un truco raro: el error de Verlet es
proporcional a `dt³` por paso, y los tres trozos aportan `w₁³ + w₀³ + w₁³`.
Los coeficientes se eligen para que esa suma sea cero, y como
`2·w₁³ + w₀³ = 0` exige que `w₀` tenga signo contrario a `w₁`, no hay forma
de conseguirlo con todos los pasos hacia delante.

### Yoshida 6 (orden 6, simpléctico)

La misma idea con siete pasos de Verlet. Cuesta siete evaluaciones de fuerza
en lugar de tres, pero el error cae como `dt⁶`: al dividir el paso entre 2,
el error se divide entre 64. Lo añadí porque Yoshida 4, con un paso cómodo
de 0,25 días, comete en Mercurio un error de 35 600 km en un siglo; Yoshida
6 con el mismo paso, 9 km.

### El orden se mide, no se supone

`tests/test_integrators.cpp` integra una órbita de excentricidad 0,2 con
paso `dt` y con `dt/2`, y calcula `log₂` del cociente de errores:

| Integrador | Orden teórico | Orden medido |
|---|---|---|
| Euler | 1 | 0,97 |
| Verlet | 2 | 2,00 |
| RK4 | 4 | 4,20 |
| Yoshida 4 | 4 | 4,00 |
| Yoshida 6 | 6 | 5,91 |

Si un coeficiente de Yoshida 6 estuviera mal copiado, el orden medido sería
2 y el test fallaría.

## 4. Qué significa simpléctico

La mecánica clásica se puede escribir en términos de posiciones `q` y
momentos `p` y de una función, el hamiltoniano `H(q, p)`, que es la energía.
La evolución exacta tiene una propiedad geométrica: **conserva el volumen en
el espacio de fases** (teorema de Liouville) y, más en general, una
estructura llamada forma simpléctica. Un conjunto de condiciones iniciales
puede deformarse, pero no comprimirse ni expandirse.

Un integrador es simpléctico si cada uno de sus pasos tiene esa misma
propiedad. Verlet lo es porque está hecho de dos operaciones que lo son por
separado: "empujar" (cambiar `p` según la fuerza, dejando `q` quieto) y
"derivar" (cambiar `q` según `p`, dejando `p` quieto).

La consecuencia práctica es un resultado que se llama análisis de error
regresivo: un integrador simpléctico **no** resuelve aproximadamente tu
problema; resuelve **exactamente** un problema ligeramente distinto, con un
hamiltoniano modificado `H̃ = H + (términos de orden dtᵖ)`. Como ese `H̃` se
conserva, la energía verdadera `H` no puede alejarse: oscila alrededor de su
valor inicial, con una amplitud pequeña, durante tiempos larguísimos.

RK4 no tiene hamiltoniano modificado. Su error de energía no oscila: avanza
siempre en la misma dirección. Por eso, para integrar muchas órbitas, un
método simpléctico de orden 2 puede ser mejor que uno no simpléctico de
orden 4. En el experimento "Integrators" de la web se ve directamente:
la curva de RK4 sube, las de Verlet y Yoshida son planas.

**Lo que simpléctico no garantiza.** Que la energía esté acotada no significa
que la órbita esté bien. Verlet con `dt = 0,25` días conserva la energía a
nivel de 10⁻⁷ y aun así coloca a Mercurio a 16 millones de kilómetros de su
sitio tras un siglo, porque comete un error de **fase**: la órbita tiene el
tamaño correcto pero el planeta va adelantado o atrasado, y el perihelio gira
de más. La energía es un diagnóstico necesario, no suficiente. Por eso hace
falta comparar con una referencia externa.

## 5. La corrección 1PN y el perihelio de Mercurio

### Por qué una órbita newtoniana no precesa

En un potencial exactamente `1/r` ocurre algo especial: el periodo con que el
planeta se acerca y se aleja del Sol coincide exactamente con el periodo con
que da una vuelta. Por eso la órbita se cierra y la elipse se queda quieta.
Matemáticamente, se conserva un vector más además de la energía y el momento
angular, el vector de Laplace-Runge-Lenz, que apunta siempre al perihelio:

```
e = (v × L) / (G·M) − r / |r|
```

El teorema de Bertrand dice que solo dos fuerzas centrales dan órbitas
cerradas para cualquier condición inicial: `1/r²` y el muelle `r`. Cualquier
desviación, por pequeña que sea, rompe la coincidencia de los dos periodos y
la elipse empieza a girar. Eso es la precesión.

El código mide exactamente eso: calcula el vector `e` de Mercurio en cada
instante y mira cuánto gira (`core/analysis.cpp`).

### Qué hace girar la elipse de Mercurio

Dos cosas:

1. **Los demás planetas.** Tiran de Mercurio y su efecto promediado equivale
   a una fuerza que no es `1/r²`. Aportan unos 532″ por siglo.
2. **La relatividad general.** Cerca del Sol la gravedad no es exactamente
   newtoniana. Aporta 43″ por siglo.

Le Verrier calculó en 1859 la parte de los planetas y vio que faltaban esos
43″. Se buscó durante décadas un planeta interior, Vulcano, que no existe.
Einstein obtuvo el valor exacto en noviembre de 1915 y fue la primera
confirmación de su teoría.

### La corrección 1PN

La relatividad general completa es demasiado para un simulador de órbitas, y
tampoco hace falta: en el sistema solar las velocidades son pequeñas frente a
la luz (`v/c` ≈ 10⁻⁴ para Mercurio) y se puede desarrollar la teoría en
potencias de `(v/c)²`. El primer término de ese desarrollo es la corrección
posnewtoniana de primer orden, o 1PN. Para un cuerpo ligero en torno a una
masa `M` dominante, añade a la aceleración newtoniana:

```
a_1PN = (G·M / (c²·r³)) · [ (4·G·M/r − v²)·r + 4·(r·v)·v ]
```

donde `r` y `v` son la posición y la velocidad respecto al Sol. Es del orden
de `(v/c)²` ≈ 10⁻⁷ veces la newtoniana. Minúscula, pero sistemática: empuja
siempre el perihelio en el mismo sentido.

De esta fuerza sale, integrando sobre una órbita, la fórmula de Einstein:

```
Δϖ por órbita = 6·π·G·M / (c²·a·(1 − e²))
```

Para Mercurio (`a` = 0,3871 UA, `e` = 0,2056) son 5,02·10⁻⁷ radianes, es
decir, 0,1035″ por órbita. Mercurio da 415,2 vueltas por siglo:
0,1035 × 415,2 = **42,98″ por siglo**.

Nota que depende de `1/a` y de `1/(1 − e²)`: el efecto es mayor cuanto más
cerca del Sol y cuanto más excéntrica la órbita. Mercurio gana en las dos
cosas. Para la Tierra son 3,8″ por siglo.

### Cómo lo mide el simulador

No se introduce la fórmula de Einstein en ningún sitio. Se introduce la
fuerza, y la precesión se **mide**:

1. Se integra el sistema solar completo con la fuerza 1PN.
2. A la vez se integra un gemelo idéntico solo con gravedad newtoniana.
3. Se resta el ángulo del perihelio de Mercurio en una corrida y en la otra.
4. Esa diferencia crece en línea recta. Su pendiente es la contribución
   relativista.

Restar dos corridas tiene una ventaja enorme: todo lo que es igual en ambas
(los 532″ de los planetas, el error del integrador) se cancela. Por eso la
medida da 42,98 incluso con Yoshida 4 a paso grueso, que por sí solo comete
165″ por siglo de precesión falsa.

Resultados (los tres están en `tests/test_horizons.cpp`):

| Medida | Resultado | Referencia |
|---|---|---|
| Sistema solar, 1PN menos newtoniano | 42,976″/siglo | 42,98 |
| Sol + Mercurio solos con 1PN | 42,970″/siglo | fórmula: 42,981 |
| Precesión total, simulación | 572,14″/siglo | DE441, mismo ajuste: 572,18 |

### Por qué antes salía 42,81

La versión anterior medía 42,81″ y lo llamaba "error del 0,4 %". No era un
error numérico: era geometría. El código tomaba el ángulo del vector `e`
**proyectado sobre el plano de la eclíptica**, `atan2(e_y, e_x)`. Pero la
órbita de Mercurio está inclinada 7° respecto a ese plano, y el giro ocurre
dentro del plano de la órbita. Proyectar un giro sobre un plano inclinado
cambia su velocidad aparente en un factor

```
cos(i) / (cos²ω + cos²(i)·sen²ω) = 0,9960
```

con `i` = 7,005° y `ω` = 29,13° (el argumento del perihelio). Y
42,98 × 0,9960 = 42,81. El ángulo que tabulan las efemérides es la longitud
del perihelio `ϖ = Ω + ω`: el ángulo del nodo medido en la eclíptica más el
argumento del perihelio medido en el plano de la órbita. Midiendo ese, sale
42,98. El test antiguo sigue en el repositorio, sin tocar, y hay uno nuevo
con la definición correcta y una tolerancia veinte veces más estrecha.

### El fallo que encontró la validación

Al comparar con Horizons por primera vez, Mercurio salía 1,66 millones de
kilómetros desviado en un siglo **con** la relatividad activada, peor que sin
ella. Era un fallo real en cómo se combinaban Verlet y la fuerza 1PN.

Verlet supone que la fuerza depende solo de la posición. La fuerza 1PN
depende además de la velocidad. El código usaba, en el primer medio empujón,
la aceleración guardada del paso anterior, que se había calculado con una
velocidad vieja. Eso rompe la simetría temporal del método, lo baja a primer
orden y hace que el semieje de Mercurio derive.

La solución (`core/integrator.cpp`) es evaluar el término que depende de la
velocidad, en los dos medios empujones, en la velocidad de medio paso `v_h`:

```
v_h = v₀ + (dt/2)·[ a_N(x₀) + a_PN(x₀, v_h) ]     ← implícita
x₁  = x₀ + dt·v_h
v₁  = v_h + (dt/2)·[ a_N(x₁) + a_PN(x₁, v_h) ]
```

La primera ecuación tiene `v_h` en los dos lados. Se resuelve por iteración
de punto fijo, que converge en dos vueltas porque el término 1PN es diez
millones de veces menor que el newtoniano. El resultado vuelve a ser
reversible y de segundo orden, y Yoshida vuelve a ser de cuarto. El error de
Mercurio pasó de 1 660 000 km a 35 600 km (Yoshida 4, 0,25 días), y con
Yoshida 6 a 9 km.

Los tests anteriores no lo detectaban porque medían una diferencia entre dos
corridas a paso muy fino, donde el fallo era pequeño. Tres tests nuevos lo
vigilan: el orden de convergencia con 1PN activado, la reversibilidad
temporal y la comparación con Horizons.

### La energía con 1PN

Con la corrección relativista, la energía newtoniana (cinética más potencial)
deja de conservarse: oscila con cada órbita de Mercurio. La cantidad que sí
se conserva lleva un término adicional por cada cuerpo:

```
E_1PN = (m/c²) · [ 3·v⁴/8 + 3·G·M·v²/(2·r) + (G·M)²/(2·r²) ]
```

El panel de validación muestra la energía con ese término incluido. Sin él,
la gráfica tendría un suelo de 2·10⁻⁹ que no es culpa del integrador sino
del diagnóstico.

## 6. El achatamiento del Sol: J2

El Sol gira, y por eso está ligeramente achatado por los polos. Un cuerpo
achatado no atrae como un punto: su campo tiene, además del término `1/r²`,
términos que caen más rápido. El primero se describe con un número sin
dimensiones, `J₂`, que para el Sol vale unos 2,2·10⁻⁷ (la Tierra, mucho más
achatada, tiene 1,08·10⁻³).

La aceleración extra, para un cuerpo en la posición `(x, y, z)` respecto al
Sol, con `z` a lo largo del eje de rotación y `R` el radio solar, es

```
a_x = −(3/2)·J₂·G·M·R²/r⁵ · x·(1 − 5z²/r²)
a_y = −(3/2)·J₂·G·M·R²/r⁵ · y·(1 − 5z²/r²)
a_z = −(3/2)·J₂·G·M·R²/r⁵ · z·(3 − 5z²/r²)
```

Cae como `1/r⁴`, así que también hace precesar las órbitas. Para Mercurio
aporta unos 0,03″ por siglo: mil veces menos que la relatividad. Está en el
simulador como opción porque marca dónde está el suelo: es el primer efecto
real que queda por debajo de lo que el modelo resuelve bien.

Históricamente importó. En los años sesenta Dicke propuso que el Sol podía
estar mucho más achatado de lo que parecía, lo que habría explicado parte de
los 43″ sin relatividad general. Las medidas de heliosismología lo
descartaron.

## 7. La Luna: el cuadrupolo Tierra-Luna

Fue el mayor error del modelo, y encontrarlo fue consecuencia directa de
comparar con Horizons.

El simulador trata la Tierra y la Luna como **un solo punto** situado en su
centro de masas común (el baricentro Tierra-Luna). Con eso, la Tierra se
adelantaba 117 km cada año respecto a DE441: 11 700 km en un siglo, mucho
más que cualquier otro planeta.

La causa es sutil. El Sol no tira de un punto: tira de la Tierra y de la
Luna por separado. Y la media de `1/r²` evaluada en dos sitios distintos no
es `1/r²` evaluada en el sitio medio. Desarrollando en la separación
Tierra-Luna `d` frente a la distancia al Sol `r`, el primer término que
sobrevive tras promediar sobre un mes lunar es una fuerza radial extra:

```
a = −Q · G·M☉ · r / r⁵        con   Q = (3/4)·μ·(1−μ)·⟨d²⟩·(1 − (3/2)·sen²i)
```

donde `μ = M_Luna/(M_Tierra + M_Luna)` = 0,01215, `⟨d²⟩ = a²·(1 + 3e²/2)`
con `a` = 384 399 km y `e` = 0,0549, e `i` = 5,145° es la inclinación de la
órbita lunar. Sale `Q` = 5,8985·10⁻⁸ UA². La idea es de Quinn, Tremaine y
Duncan (1991), que la usaron para integrar el sistema solar durante millones
de años sin simular la Luna.

Es una fuerza 6·10⁻⁸ veces menor que la atracción del Sol. Parece
despreciable, pero actúa siempre en el mismo sentido y cambia un poco la
velocidad angular de la Tierra, así que el error crece linealmente.

Con esta corrección el error de la Tierra baja de 11 686 km a 303 km en un
siglo, **sin ajustar ningún parámetro**: todos los números de `Q` son
constantes físicas medidas. `tests/test_horizons.cpp` comprueba la fórmula
de dos maneras: reconstruyendo `Q` a partir de sus ingredientes y
promediando numéricamente la atracción del Sol sobre las dos masas.

## 8. Puntos de Lagrange

Toma dos cuerpos grandes en órbita circular (Sol y Júpiter) y un tercero de
masa despreciable. Visto desde un sistema de referencia que gira con
Júpiter, hay cinco puntos donde el tercer cuerpo puede quedarse quieto: los
puntos de Lagrange.

- **L1, L2, L3** están sobre la línea Sol-Júpiter. Son inestables: un
  pequeño empujón y el cuerpo se va.
- **L4 y L5** forman triángulos equiláteros con el Sol y Júpiter, 60° por
  delante y 60° por detrás de Júpiter en su misma órbita.

En el sistema que gira aparecen dos fuerzas ficticias: la centrífuga, hacia
fuera, y la de Coriolis, perpendicular a la velocidad. Sumando la gravedad
de los dos cuerpos y la centrífuga se obtiene un "potencial efectivo". Lo
sorprendente es que L4 y L5 son **máximos** de ese potencial: cimas, no
valles. Un cuerpo debería caerse de ahí.

No se cae por la fuerza de Coriolis. En cuanto el cuerpo empieza a resbalar
por la ladera, Coriolis lo desvía de lado y lo obliga a girar alrededor del
punto. Es estabilidad dinámica, no estática, y solo funciona si el cuerpo
grande es suficientemente dominante:

```
M₁ / M₂ > 24,96
```

El Sol es 1047 veces más masivo que Júpiter, de sobra. Por eso hay más de
diez mil asteroides troyanos conocidos atrapados alrededor de L4 y L5.

Un troyano no está parado en el punto: describe alrededor de él una órbita
alargada, con forma de renacuajo, llamada libración. La teoría lineal da su
periodo:

```
T_lib = T_Júpiter / √( (1 − √(1 − 27·μ·(1−μ))) / 2 )  ≈  T_Júpiter / √(27μ/4)
```

con `μ = M_Júpiter/(M_Sol + M_Júpiter)`. Sale 147,3 años.

Lo que comprueba el proyecto:

| Comprobación | Resultado |
|---|---|
| Periodo de libración, problema ideal de tres cuerpos | medido 147,3 años, teoría 147,3 años |
| Seis troyanos reales durante 1000 años | todos entre 30° y 95° de Júpiter, media 60° |
| Los mismos troyanos frente a Horizons tras 100 años | peor error 199 km |

Los troyanos son Aquiles, Héctor y Agamenón (L4) y Patroclo, Príamo y Eneas
(L5), con sus posiciones reales de JPL. La tradición manda nombrar los de L4
como héroes griegos y los de L5 como troyanos; Héctor y Patroclo se
descubrieron antes de la norma y cada uno está en el campamento enemigo.

## 9. Asistencia gravitatoria

Voyager 2 llegó a Júpiter en julio de 1979 a 10 km/s respecto al Sol y salió
a 20 km/s. No encendió los motores. La energía cinética se multiplicó por
cuatro. ¿De dónde salió?

**Visto desde Júpiter**, no ocurre nada especial. La sonda llega desde lejos,
describe una hipérbola alrededor del planeta y se aleja. La gravedad es
conservativa, así que sale con la misma velocidad con la que llegó
(7,65 km/s en este caso). Solo ha cambiado de dirección.

**Visto desde el Sol**, Júpiter se mueve a 13 km/s. La velocidad de la sonda
respecto al Sol es la suma de dos vectores: su velocidad respecto a Júpiter
más la velocidad de Júpiter. Si el sobrevuelo gira el primero de modo que
quede más alineado con el segundo, la suma es más larga:

```
antes:    v_sol = v_júpiter + v_rel    (apuntan en direcciones distintas → |v_sol| = 10 km/s)
después:  v_sol = v_júpiter + v_rel'   (casi alineados                  → |v_sol| = 20 km/s)
```

La energía sale de Júpiter, que se frena. Como su masa es 2·10²⁴ veces la de
la sonda, el cambio en su velocidad es del orden de 10⁻²⁴ km/s.

La analogía es una pelota de tenis contra un tren que viene de frente. En el
sistema del tren la pelota rebota con la misma rapidez; en el del andén sale
con su rapidez más dos veces la del tren.

El experimento parte del estado real de la sonda según JPL, 30 días antes
del sobrevuelo, y lo integra durante 60 días:

| Magnitud | Simulación | Real (JPL) |
|---|---|---|
| Velocidad heliocéntrica inicial | 9,972 km/s | (dato de partida) |
| Velocidad heliocéntrica final | 19,983 km/s | 19,954 km/s |
| Máxima aproximación al centro de Júpiter | 721 965 km | 721 670 km |
| Velocidad respecto a Júpiter, entrada y salida | 7,647 y 7,642 km/s | iguales en teoría |
| Error de posición justo antes del sobrevuelo | 423 km | |
| Error de posición 30 días después | 175 324 km | |

El salto del error es honesto y se explica: un sobrevuelo amplifica cualquier
diferencia pequeña en la trayectoria de entrada, y a este modelo le faltan
tres cosas que importan a 10 radios de Júpiter. Júpiter está muy achatado
(su `J₂` es 0,0147), sus cuatro lunas grandes están ahí y el modelo las mete
dentro del planeta, y la sonda hizo maniobras de corrección con sus
propulsores. 175 000 km en 30 días equivalen a una diferencia de velocidad
de 0,03 km/s sobre 20.

## 10. La validación contra JPL Horizons

### Qué es la referencia

JPL Horizons es el servicio público de efemérides del Jet Propulsion
Laboratory de la NASA. Para los planetas sirve la efeméride DE441, que es el
resultado de integrar numéricamente el sistema solar con un modelo completo
y ajustarlo a décadas de observaciones: radar, seguimiento de sondas,
reflectores láser en la Luna. Es con lo que se navegan las misiones
espaciales. Para este proyecto, DE441 es "la verdad".

### Qué se compara

1. `tools/fetch_horizons.py` descarga de Horizons la posición y la velocidad
   del Sol y de los ocho sistemas planetarios en la época J2000.0 (1 de
   enero de 2000 a las 12:00 TDB). Esas son las condiciones iniciales.
2. Descarga también sus posiciones cada 32 días entre 1900 y 2100.
3. El simulador parte de J2000.0 y a partir de ahí **va solo**. No se le
   vuelve a dar ningún dato.
4. Cada 32 días se mide la distancia entre donde está cada planeta en la
   simulación y donde dice DE441 que está.

Se compara la posición **heliocéntrica** (planeta menos Sol) y no la
baricéntrica. El origen de DE441 es el centro de masas de todo el sistema
solar, incluidos asteroides y Plutón, que este modelo no tiene; comparando
respecto al Sol, esa diferencia de origen no contamina el resultado.

Los "planetas" son en realidad baricentros de sistemas: "Júpiter" es Júpiter
más sus lunas, con la masa total. Así un punto en el modelo corresponde
exactamente a un punto en la referencia.

### Qué sale

Error máximo de posición en un siglo, modelo completo (newtoniano + 1PN +
cuadrupolo Tierra-Luna), Yoshida 6 con paso de 0,25 días:

| Planeta | Error a 1 año | a 10 años | a 100 años | Distancia recorrida en 100 años |
|---|---|---|---|---|
| Mercurio | 0,1 km | 1,0 km | 9,3 km | 1,5·10¹¹ km |
| Venus | 0,03 km | 0,3 km | 3,5 km | 1,1·10¹¹ km |
| Tierra | 7,8 km | 41 km | 303 km | 9,4·10¹⁰ km |
| Marte | 0,07 km | 4,9 km | 32 km | 7,6·10¹⁰ km |
| Júpiter | 0,2 km | 0,9 km | 33 km | 4,1·10¹⁰ km |
| Saturno | 0,2 km | 5,8 km | 19 km | 3,0·10¹⁰ km |
| Urano | 0,3 km | 3,5 km | 276 km | 2,1·10¹⁰ km |
| Neptuno | 0,3 km | 2,8 km | 656 km | 1,7·10¹⁰ km |

9 km en la posición de Mercurio después de 415 vueltas es una parte en
16 000 millones de la distancia recorrida.

### De dónde viene el error que queda

Lo que DE441 tiene y este modelo no:

- La Luna como cuerpo separado (aquí solo su efecto promediado). Es lo que
  domina el error de la Tierra.
- 343 asteroides con masa. Perturban sobre todo a Marte.
- Plutón y los objetos transneptunianos.
- La relatividad completa entre todos los pares de cuerpos (ecuaciones de
  Einstein-Infeld-Hoffmann), no solo la del Sol.
- La forma no esférica de los cuerpos y las mareas.

No he separado cuánto aporta cada una al error de Urano y Neptuno. Probé a
añadir Plutón como cuerpo con masa y el error de Neptuno no mejoró, así que
no lo afirmo.

### Qué enseña la tabla completa

La tabla de `docs/validation_table.md` cruza integrador y paso. Lo más
instructivo:

| Integrador | Paso | Error de Mercurio a 100 años | Deriva de energía |
|---|---|---|---|
| Yoshida 6 | 0,25 d | 9,3 km | 7·10⁻¹¹ |
| Yoshida 6 | 1 d | 8 663 km | 1·10⁻¹⁰ |
| Yoshida 4 | 0,0625 d | 132 km | 7·10⁻¹¹ |
| Yoshida 4 | 0,25 d | 35 607 km | 1·10⁻¹⁰ |
| RK4 | 0,25 d | 57 848 km | 9·10⁻¹⁰ |
| Verlet | 0,25 d | 16 millones de km | 2·10⁻⁷ |
| Euler | 0,25 d | 1 100 millones de km | 5·10⁻² |

Dos lecciones. Primera: la energía de Yoshida 4 a 0,25 días es casi tan
buena como la de Yoshida 6, y sin embargo su error de posición es 4000 veces
mayor. Conservar la energía no basta. Segunda: los planetas exteriores salen
igual con todos los métodos razonables; quien exige un paso fino es
Mercurio, que da una vuelta cada 88 días.

---

## 11. Las 15 preguntas

### 1. ¿Por qué integras numéricamente? Las órbitas son elipses, hay fórmula.

La fórmula existe para dos cuerpos. Con nueve que se atraen entre sí no hay
solución cerrada (Poincaré), y justamente lo que me interesa medir, la
precesión, es lo que la elipse de Kepler no tiene. Sí uso la solución de dos
cuerpos como **control**: Sol y Mercurio solos, sin relatividad, deben dar
precesión cero, y dan 0,000″. Sin ese cero no podría fiarme de los 43″.

### 2. ¿Qué es un integrador simpléctico?

Uno cuyos pasos conservan la estructura geométrica del espacio de fases, en
particular su volumen, igual que hace la evolución exacta. La consecuencia
práctica es que resuelve exactamente un problema con un hamiltoniano
ligeramente modificado, así que la energía oscila cerca de su valor inicial
en lugar de derivar. Verlet lo es porque alterna dos operaciones que lo son:
cambiar velocidades con posiciones fijas y cambiar posiciones con
velocidades fijas.

### 3. RK4 es de orden 4 y Verlet de orden 2. ¿Por qué dices que Verlet es mejor?

No digo que sea mejor siempre. El orden mide el error **por paso**. A largo
plazo importa cómo se **acumula**. El error de energía de RK4 crece de forma
monótona; el de Verlet oscila sin crecer. En mi tabla, con el mismo paso,
RK4 tiene menos error que Verlet en un siglo, pero su energía ya ha derivado
y seguiría haciéndolo. Para tener orden alto **y** buen comportamiento a
largo plazo uso Yoshida, que es simpléctico de orden 4 o 6.

### 4. ¿Por qué Yoshida tiene un paso hacia atrás en el tiempo?

Yoshida 4 son tres pasos de Verlet de longitudes `w₁`, `w₀`, `w₁` veces
`dt`. Para que avancen `dt` en total, `2w₁ + w₀ = 1`. Para que se cancele el
error de tercer orden de Verlet, `2w₁³ + w₀³ = 0`. La segunda condición
obliga a que `w₀` sea negativo. Sale `w₁` = 1,351 y `w₀` = −1,702. Es un
resultado general: no existen métodos de composición de orden mayor que 2
con todos los pasos positivos.

### 5. ¿Cómo sabes que el resultado es correcto y no una casualidad?

Por cuatro comprobaciones independientes. Uno: un control que debe dar cero
y lo da (dos cuerpos sin relatividad). Dos: una fórmula analítica (la de
Einstein, 42,981″) frente a la medida en dos cuerpos con 1PN (42,970″).
Tres: convergencia, es decir, al reducir el paso el error baja con la
potencia que predice la teoría de cada integrador. Cuatro, la más fuerte:
una referencia externa que no he hecho yo. Las posiciones de los ocho
planetas coinciden con la efeméride DE441 del JPL a menos de 700 km tras un
siglo, y la precesión total de Mercurio sale 572,14″ frente a 572,18″
aplicando el mismo ajuste a DE441.

### 6. El valor aceptado es 42,98. ¿Por qué tu versión anterior daba 42,81?

Porque medía el ángulo equivocado. Tomaba la dirección del perihelio
proyectada sobre la eclíptica. La órbita de Mercurio está inclinada 7°, y un
giro dentro de un plano inclinado se ve más lento al proyectarlo: el factor
es `cos i / (cos²ω + cos²i·sen²ω)` = 0,996, y 42,98 × 0,996 = 42,81. Midiendo
la longitud del perihelio `ϖ = Ω + ω`, que es lo que tabulan las efemérides,
sale 42,976. La física estaba bien; la definición de lo que se medía, no.

### 7. ¿Qué es exactamente 1PN y cuándo deja de valer?

Es el primer término del desarrollo de la relatividad general en potencias
de `(v/c)²`, o lo que es lo mismo, de `GM/(rc²)`. Para Mercurio ese
parámetro vale unos 3·10⁻⁸, así que el siguiente término (2PN) es 10⁻⁸
veces menor que el que uso: irrelevante. Deja de valer cuando ese parámetro
se acerca a 1: cerca de un agujero negro o en la fusión de dos estrellas de
neutrones. Por eso el modo "What if" del agujero negro está etiquetado como
hipotético: ahí la física del simulador es newtoniana con un criterio de
captura, no relatividad general. Además, uso la forma simplificada en la que
solo el Sol produce el término relativista; la formulación completa
(Einstein-Infeld-Hoffmann) lo incluye entre todos los pares.

### 8. ¿Cuál era el mayor error frente a Horizons y qué hiciste?

Hubo dos. El primero fue un fallo numérico: Verlet usaba para la fuerza 1PN,
que depende de la velocidad, una velocidad del paso anterior. Eso rompía la
simetría temporal y bajaba el método a primer orden: 1,66 millones de km de
error en Mercurio. Lo corregí evaluando ese término en la velocidad de medio
paso mediante una ecuación implícita. El segundo fue de modelo: tratar
Tierra y Luna como un punto costaba 117 km al año. Añadí el efecto
promediado de que el Sol tira de las dos por separado, una fuerza en `1/r⁴`
calculada a partir de constantes medidas, y el error bajó de 11 700 a 300
km. Ninguno de los dos se habría visto sin comparar con una referencia
externa: la energía se conservaba perfectamente en ambos casos.

### 9. ¿Qué limita ahora la precisión?

El modelo, no el integrador. Con Yoshida 6 a 0,25 días, reducir el paso ya
no cambia el resultado: el error que queda es físico. Faltan la Luna como
cuerpo, los asteroides, Plutón y la relatividad entre todos los pares. Y hay
un límite de fondo que ningún modelo supera: el sistema solar es caótico,
con un tiempo de Lyapunov de unos cinco millones de años. Dos simulaciones
con condiciones iniciales casi idénticas se separan exponencialmente, así
que más allá de unas decenas de millones de años ni siquiera el JPL puede
decir dónde estará cada planeta, solo dar estadísticas.

### 10. ¿Cómo eliges el paso de tiempo?

Tiene que resolver la órbita más rápida, la de Mercurio: 88 días. Con 0,25
días son 352 pasos por órbita. No lo elijo a ojo: la tabla de validación
muestra el error para cada paso, y elijo el mayor paso a partir del cual el
error deja de bajar. Para los escenarios con encuentros cercanos, que son
los hipotéticos, el paso se subdivide solo según la escala de tiempo
dinámica local, `η·√(r³/GM)`. Y los pasos son potencias de 2 (0,25, 0,5…)
para que el tiempo acumulado sea exacto en coma flotante y la simulación
caiga justo sobre las fechas de la referencia.

### 11. ¿Qué cantidades se conservan y con qué precisión?

El momento lineal, hasta la precisión de máquina, porque cada fuerza se
aplica a los dos cuerpos del par con signo contrario. El momento angular, a
10⁻¹², y eso lo cumple incluso un integrador malo, así que no demuestra
nada. La energía es la prueba real: con Yoshida 6 se mantiene en 7·10⁻¹¹
durante un siglo; con Euler se pierde un 5 %. Un detalle: con relatividad la
energía newtoniana ya no es la cantidad conservada, hay que sumarle un
término 1PN. Si no, la gráfica muestra una oscilación de 2·10⁻⁹ que es del
diagnóstico y no del integrador.

### 12. L4 y L5 son máximos del potencial efectivo. ¿Cómo pueden ser estables?

Por la fuerza de Coriolis. En el sistema que gira con Júpiter, un cuerpo que
empieza a caer desde la cima adquiere velocidad, y Coriolis, que es
perpendicular a la velocidad, lo desvía y lo hace girar alrededor del punto
en lugar de alejarse. Es estabilidad dinámica. Solo funciona si la masa
principal es al menos 24,96 veces la secundaria; Sol y Júpiter están en
1047. Lo compruebo con el periodo de libración: la teoría lineal da 147,3
años y la simulación mide 147,3.

### 13. ¿De dónde sale la energía que gana Voyager 2?

De Júpiter. En el sistema de Júpiter la sonda entra y sale con la misma
rapidez, 7,65 km/s en mi simulación tanto antes como después. Lo único que
cambia es la dirección de esa velocidad. Pero para pasar al sistema del Sol
hay que sumarle la velocidad orbital de Júpiter, 13 km/s, y la suma de dos
vectores depende del ángulo entre ellos. Júpiter pierde exactamente la
energía que gana la sonda; como es 10²⁴ veces más masivo, no se nota.

### 14. ¿Qué hace el JPL distinto de lo que haces tú?

Tres cosas. Su modelo es mucho más completo: relatividad entre todos los
cuerpos, la Luna con su rotación y sus mareas, 343 asteroides, la forma del
Sol y de la Tierra. Sus condiciones iniciales no están medidas directamente:
se **ajustan** para que la integración reproduzca cientos de miles de
observaciones (radar a los planetas, telemetría de sondas, láser a la Luna).
Y usa un integrador de orden muy alto con precisión extendida. Yo tomo su
resultado en un instante como condición inicial y compruebo cuánto tiempo mi
modelo simplificado sigue coincidiendo con el suyo. Eso no valida al JPL:
valida mi simulador.

### 15. ¿Qué parte de esto has hecho tú y qué parte ha hecho la IA?

Esta te la van a hacer. Respóndela con la verdad y con detalle; lo que sigue
es un punto de partida que tienes que ajustar a lo que de verdad hayas
hecho.

El código se escribió con ayuda de una IA, Claude Code, y está dicho en el
README. Lo que es tuyo es la dirección: decidir que un simulador sin
referencia externa no demuestra nada, pedir la comparación con Horizons,
señalar que las estrellas estaban mal colocadas y que los escenarios
hipotéticos debían separarse de la simulación real. Y la revisión: leer el
código, ejecutar los tests y entender cada resultado.

Lo que convierte esa respuesta en creíble es poder explicar cualquier parte
cuando te pregunten por ella. Tres cosas concretas que conviene que sepas
hacer delante de alguien:

1. Abrir `core/integrator.cpp` y explicar línea a línea el paso de Verlet y
   por qué el término 1PN se evalúa en la velocidad de medio paso.
2. Deducir en la pizarra por qué `2w₁³ + w₀³ = 0` da un paso negativo.
3. Desactivar la relatividad en la web y predecir, antes de mirar, qué le va
   a pasar a la curva de error de Mercurio.

Si alguna de las tres no te sale todavía, ese es el trabajo pendiente, y es
mejor decirlo que disimularlo.

---

## 12. Cómo reproducir cada número

Desde la terminal de Ubuntu (WSL), en la carpeta del proyecto:

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
```

```bash
cmake --build build -j
```

Todos los tests, con los números de este documento impresos por pantalla:

```bash
./build/gl_tests
```

La tabla completa de integradores y pasos frente a Horizons:

```bash
./build/gl_validate docs
```

Los mismos controles sobre el código JavaScript de la web:

```bash
cd web && npm test
```

| Número de este documento | Dónde se comprueba |
|---|---|
| Órdenes de convergencia | `tests/test_integrators.cpp` |
| 42,976″, 42,970″ y 572,14″ | `tests/test_horizons.cpp` |
| Factor 0,996 que explica el 42,81 | `tests/test_horizons.cpp` |
| Tabla de errores frente a Horizons | `tests/test_horizons.cpp`, `bench/validate.cpp` |
| Cuadrupolo Tierra-Luna | `tests/test_horizons.cpp` |
| Libración de 147,3 años y troyanos | `tests/test_experiments.cpp` |
| Voyager 2 | `tests/test_experiments.cpp` |

## Referencias

- NASA/JPL Solar System Dynamics, Horizons System,
  <https://ssd.jpl.nasa.gov/horizons/>.
- Park, R. S. et al. (2021), "The JPL Planetary and Lunar Ephemerides DE440
  and DE441", *The Astronomical Journal* 161, 105.
- Yoshida, H. (1990), "Construction of higher order symplectic integrators",
  *Physics Letters A* 150, 262.
- Quinn, T. R., Tremaine, S. y Duncan, M. (1991), "A three million year
  integration of the Earth's orbit", *The Astronomical Journal* 101, 2287.
- Hairer, E., Lubich, C. y Wanner, G., *Geometric Numerical Integration*
  (Springer). El capítulo sobre Verlet es legible con matemáticas de primero
  de carrera.
- Murray, C. D. y Dermott, S. F., *Solar System Dynamics* (Cambridge).
  Puntos de Lagrange y libración.
- Will, C. M. (2014), "The Confrontation between General Relativity and
  Experiment", *Living Reviews in Relativity* 17, 4. El perihelio de
  Mercurio y el papel de J2.
