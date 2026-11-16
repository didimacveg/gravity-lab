# Estado del trabajo

Actualizado al terminar cada parte. Si la sesión se corta, aquí está por
dónde seguir.

## Hecho

- [x] **Errores de la versión anterior**
  - Estrellas: catálogo real (XHIP, 2851 estrellas hasta magnitud 5,5) en una
    esfera celeste en el infinito. Solo giran con la cámara; ni se trasladan
    ni escalan con el zoom. Test: `web/tests/sky.test.js`.
  - Agujero negro y estrella de paso: pestaña aparte «What if», con aviso y
    etiqueta naranja sobre la vista. Sin validación.
  - Interfaz en inglés por defecto, español con un clic (`?lang=es`).
- [x] **1. Validación contra JPL Horizons**
  - `tools/fetch_horizons.py` descarga y guarda DE441 (1900-2100, cada 32 días).
  - `core/reference.*`, `bench/validate.cpp` (tabla integrador × paso).
  - Panel «Validation» en la web: error por planeta, deriva de energía,
    precesión de Mercurio en vivo.
  - En CI: 52 tests C++, 21 tests de Node, test de navegador.
- [x] **2. Experimentos guiados** (Mercurio, Lagrange, Voyager 2, integradores),
  cada uno con explicación y comprobación numérica, también en CI.
- [x] **3. Vista 3D** con cámara orbitable, eclíptica, escala lineal/log,
  fecha real, pausa, velocidad e ir a una fecha (hacia delante o hacia atrás).
- [x] **4. Estética** oscura con acento #4C9DFF / #7FD4FF, Inter + JetBrains Mono.
- [x] **5. Rendimiento**: presupuesto de física por fotograma, calidad
  adaptativa, `prefers-reduced-motion`.

- [x] **6. `docs/DEFENSA.md`**: la física desde cero y 15 preguntas.
- [x] **7. README** en inglés con capturas, tabla de validación, cómo
  reproducirla y sección «How this was built». `README.es.md` resumido.
- [x] **8. LinkedIn** en `docs/linkedin/`: tres textos, tres imágenes de
  1080×1350 y un vídeo de 20 s. Calendario: martes 12, 19 y 26 de enero de 2027.
- [x] `docs/DECISIONS.md` y `docs/PASOS_PARA_DIEGO.md`.
- [x] Pull request contra `main`.

## Pendiente (depende de Diego)

Ver `docs/PASOS_PARA_DIEGO.md`: revisar y fusionar el pull request,
comprobar GitHub Pages tras la fusión, decidir qué hacer con las notas
antiguas, estudiar DEFENSA y publicar en LinkedIn.

## Limitaciones conocidas que quedan abiertas

- El error residual de Urano y Neptuno (276 y 656 km en un siglo) no está
  atribuido a una causa concreta.
- La Luna no es un cuerpo aparte; solo está su efecto promediado.
- El flujo de Pages solo se ejecuta en `main`: no se ha podido probar desde
  la rama.

## Cómo comprobar que todo sigue bien

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j
./build/gl_tests
cd web && npm test
```
