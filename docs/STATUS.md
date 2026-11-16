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

## Pendiente

- [ ] 6. `docs/DEFENSA.md`
- [ ] 7. README en inglés con capturas y tabla de validación
- [ ] 8. LinkedIn: 3 publicaciones, imágenes 1080×1350, vídeo
- [ ] `docs/DECISIONS.md`, `docs/PASOS_PARA_DIEGO.md`
- [ ] Pull request contra `main`

## Cómo comprobar que todo sigue bien

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j
./build/gl_tests
cd web && npm test
```
