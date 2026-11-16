# Decisiones

Decisiones tomadas durante esta sesión sin consultarte, con su motivo. Si
alguna no te convence, casi todas se pueden deshacer sin tocar el resto.

## Física y validación

**1. Condiciones iniciales de DE441, no de elementos keplerianos.**
La versión anterior arrancaba de la tabla de elementos aproximados del JPL,
que son elementos *medios*: ya en el instante inicial difieren de la
posición real en miles de kilómetros. Para comparar con Horizons hay que
partir de su mismo estado. `makeSolarSystemJ2000()` sigue existiendo y los
31 tests originales la siguen usando sin cambios.

**2. Los "planetas" son baricentros de sistemas.**
"Júpiter" es Júpiter más sus lunas, con la masa total del sistema; "Tierra"
es el baricentro Tierra-Luna. Es la única forma de que un punto del modelo
corresponda a un punto de la referencia. Masas GM de DE440.

**3. El error se mide en posición heliocéntrica.**
El origen de DE441 incluye cuerpos que este modelo no tiene. Comparando
(planeta − Sol) el resultado no depende de esa diferencia. Por el mismo
motivo el sistema no se recentra en su baricentro al arrancar.

**4. Corregido un fallo real en Verlet con la fuerza 1PN.**
No estaba en la lista, pero la validación lo destapó: 1,66 millones de km de
error en Mercurio. Cambia `core/integrator.cpp` y añade un campo
(`accelerationPN`) a `World`. Los 31 tests originales siguen pasando.
Explicación en `docs/DEFENSA.md`, sección 5.

**5. Añadido Yoshida de sexto orden.**
Con Yoshida 4 hace falta un paso de 0,03 días para bajar de 10 km en
Mercurio; con Yoshida 6 basta 0,25. Es el integrador por defecto de la web.
Los coeficientes son los de Yoshida (1990), solución A, y hay un test que
mide que el orden es 6.

**6. Añadido el cuadrupolo promediado Tierra-Luna.**
Era el mayor error del modelo (117 km/año en la Tierra). Es física nueva,
con su test, y es una opción (`enableEarthMoonQuadrupole`) que por defecto
está desactivada en C++ para no alterar los tests existentes; la web la
activa. La alternativa, simular la Luna como cuerpo, obligaría a un paso
mucho menor y a otra referencia.

**7. No se han añadido asteroides ni Plutón con masa.**
Lo probé: con Ceres, Palas y Vesta el error de Marte baja de 32 a 13 km,
pero el de Júpiter sube; con Plutón el de Neptuno empeora. Sin un modelo
completo no hay mejora neta clara, y preferí no añadir masas a medias.

**8. La precesión se mide como ϖ = Ω + ω y con un gemelo newtoniano.**
El test original (ángulo proyectado, 42,81″) se queda como está. El nuevo
usa la definición de las efemérides y da 42,976″, con tolerancia de 0,05″.

**9. La energía del panel incluye el término 1PN.**
Sin él la gráfica tendría un suelo de 2·10⁻⁹ que no es del integrador.

**10. Umbrales de los tests entre 1,3 y 2,5 veces lo medido.**
Lo bastante holgados para que un cambio de compilador no los rompa y lo
bastante ajustados para que un error de física sí.

**11. `-ffp-contract=off` al compilar.**
Para que los números salgan iguales en cualquier procesador.

## Datos

**12. Los datos de Horizons se guardan en el repositorio.**
493 KB de posiciones (binario) más 147 KB de metadatos. Ni los tests ni la
web llaman al JPL: funcionan sin red y no cargan su servidor. La descarga
(`tools/fetch_horizons.py`) hace las peticiones de una en una, como pide la
documentación de la API. Cita incluida en el README y en el panel.

**13. Referencia de 1900 a 2100, cada 32 días.**
32 días es múltiplo de todos los pasos que ofrece la web (potencias de 2),
así que la simulación cae exactamente sobre cada muestra sin interpolar.

**14. Catálogo de estrellas XHIP hasta magnitud 5,5 (2851 estrellas).**
Tomado de los ficheros de datos de d3-celestial (licencia BSD). Se han
eliminado las estrellas "de relleno" sintéticas que tenía la versión
anterior: en un proyecto que presume de datos reales no debe haber
estrellas inventadas.

## Web

**15. La web deja de ser un único fichero.**
`web/simulador.html` tenía 1233 líneas y la versión nueva hace bastante más.
Ahora son módulos de JavaScript sin dependencias ni paso de compilación.
Consecuencia: ya no se abre con doble clic, hay que servirla
(`python3 -m http.server`). `simulador.html` se conserva como redirección
para no romper enlaces antiguos.

**16. La física de la web es un port a JavaScript, no WebAssembly.**
Compilar el C++ a WASM exigiría Emscripten en CI y en tu máquina. A cambio
de mantener dos implementaciones hay 21 tests de Node que exigen que el
JavaScript dé los mismos números que el C++ (errores frente a Horizons con
un 2 % de margen).

**17. 3D sobre canvas 2D, sin three.js ni WebGL.**
Veinte cuerpos y unos miles de segmentos no lo necesitan. Cero dependencias,
funciona en cualquier navegador y la página entera pesa 1 MB.

**18. Cambiar integrador, paso o fuerzas reinicia desde J2000.**
Así cada curva de error corresponde a una sola configuración.

**19. Colores de los planetas elegidos por legibilidad, no por parecido.**
Son ocho tonos comprobados para daltonismo (script de validación de paleta)
en un orden en que la Tierra es azul y Marte naranja. Los mismos colores se
usan en la vista 3D y en las gráficas.

**20. El agujero negro ya no captura a distancia cuando se dibuja ampliado.**
Con el horizonte ampliado, la regla antigua podía tragarse cuerpos a decenas
de UA del disco dibujado. Ahora solo captura lo que llega al disco. Solo
afecta a la pestaña «What if».

**21. Tipografías Inter y JetBrains Mono, alojadas en el propio sitio.**
Sin llamadas a Google Fonts. Si tu web personal usa otras, se cambian en las
cuatro primeras líneas de `web/css/style.css`.

## Repositorio

**22. No he borrado `ORDEN_DE_TRABAJO.md`, `GITHUB.md` ni `SETUP_WSL.md`.**
Son tuyos. He corregido los datos que mi cambio dejaba obsoletos (número de
tests, cómo abrir la web). Mira `docs/PASOS_PARA_DIEGO.md`, punto 5.

**23. CI con tres trabajos:** núcleo C++ (tests y tabla de validación), tests
de Node y test de navegador con Playwright.
