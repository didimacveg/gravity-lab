# Estado del proyecto

Todo lo descrito en el README esta implementado, compilado y verificado:
los 17 tests pasan, el benchmark corre y la precesion de Mercurio sale a
42.810 arcsec/siglo.

## Que queda abierto

Cosas que el proyecto no hace y que serian la continuacion natural:

1. **Paso de tiempo adaptativo o por bloques.** Ahora mismo un encuentro
   cercano obliga a bajar `dt` globalmente. Los pasos por bloques con
   potencias de dos resuelven esto sin perder la simetria simplectica.
2. **Formulacion 1PN completa** (Einstein-Infeld-Hoffmann con todos los
   pares), en vez de la aproximacion de cuerpo central dominante.
3. **La Luna como cuerpo separado**, que exige `dt` mucho menor.
4. **Cinturon de asteroides** con miles de cuerpos. Ahi si tiene sentido
   implementar Barnes-Hut; con nueve cuerpos no lo tiene.
5. **Lente gravitatoria** como shader, con deflexion `alpha = 2 r_s / b`.
6. **Disrupcion de marea**: `processTidalDisruption` esta escrita pero
   desactivada por defecto y sin test que la valide.
7. **Compilar a WASM** con Emscripten para que la version C++ corra en el
   navegador en vez de la portada a JavaScript.

## Advertencia sobre la autoria

Este codigo lo escribio Claude, no tu. Como herramienta para explorar y
entender orbitas, sirve igual. Como pieza de portfolio para una solicitud
universitaria, no: no podrias defender en una entrevista por que Yoshida 4
lleva un paso central negativo, ni por que RK4 deriva y Verlet no.

Si lo quieres para eso, la ruta es reimplementar `core/forces.cpp`,
`core/integrator.cpp` y `core/analysis.cpp` por tu cuenta contra estos
mismos tests, y quedarte con lo tuyo. Los tests son el andamio que hace
que eso sea posible: te dicen cuando lo has hecho bien sin ensenarte la
respuesta.
