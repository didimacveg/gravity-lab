# Pasos para Diego

Lo que depende de ti, en orden. Todos los comandos son para la terminal de
Ubuntu (WSL).

## 1. Traer la rama y comprobar que todo pasa en tu máquina

```bash
cd ~/proyectos/gravity-lab
```

```bash
git fetch origin claude/determined-clarke-6u1b3i
```

```bash
git checkout claude/determined-clarke-6u1b3i
```

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j
```

```bash
./build/gl_tests
```

Deben salir 52 casos y `Todo correcto` (unos 40 segundos).

Tests de la web. Hace falta Node 22 o superior; mira primero cuál tienes:

```bash
node --version
```

Si no lo tienes o es más antiguo:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
```

```bash
sudo apt install -y nodejs
```

Y luego:

```bash
cd web && npm test
```

Deben pasar 21.

## 2. Ver la web en local

```bash
cd ~/proyectos/gravity-lab/web
```

```bash
python3 -m http.server 8000
```

Abre <http://localhost:8000> en el navegador de Windows. Prueba al menos:

- Pestaña **Validation** → «Run 100 years now». Debe acabar en 42,98″/siglo
  y con los errores de la tabla del README.
- Pestaña **Experiments** → los cuatro experimentos.
- Botón **ES** arriba a la derecha.
- En el móvil: con el servidor en marcha, entra desde el teléfono a
  `http://IP_DE_TU_PC:8000` (la IP sale con `ipconfig` en PowerShell). Si no
  conecta, pruébalo cuando esté publicada.

Para parar el servidor: Ctrl+C.

## 3. Revisar el pull request y fusionarlo

El pull request está abierto contra `main`. Antes de fusionar:

1. Mira que las tres comprobaciones de CI estén en verde.
2. Lee `README.md`, sobre todo la sección **How this was built**. Está
   escrita en primera persona y dice que el código se hizo con ayuda de IA
   bajo tu dirección y revisión. Tiene que ser verdad cuando la publiques:
   cámbiala si algo no encaja con lo que has hecho.
3. Fusiona desde la web de GitHub (botón «Merge pull request»).

## 4. Comprobar GitHub Pages

Al fusionar en `main`, el flujo `pages` publica la carpeta `web/`. No he
podido ejecutarlo desde aquí (solo corre en `main`), así que compruébalo:

1. En GitHub: pestaña **Actions** → flujo **pages** → debe estar en verde.
2. Abre <https://didimacveg.github.io/gravity-lab/> y recarga con
   Ctrl+Shift+R para saltarte la caché.
3. El enlace antiguo `…/gravity-lab/simulador.html` debe redirigir a la
   página nueva.

Si el flujo falla con «Get Pages site failed»: en el repositorio,
**Settings → Pages → Source → GitHub Actions**.

## 5. Decidir qué haces con tres ficheros antiguos

`ORDEN_DE_TRABAJO.md`, `GITHUB.md` y `SETUP_WSL.md` son notas de trabajo
tuyas que están públicas en el repositorio. No los he borrado. Dos cosas a
tener en cuenta:

- `SETUP_WSL.md` contiene tu nombre de usuario de Windows en una ruta
  (`/mnt/c/Users/…`).
- `ORDEN_DE_TRABAJO.md` tiene una sección «Advertencia sobre la autoría» que
  es una nota para ti, y sus datos están desfasados (habla de 17 tests).

Si prefieres que no estén en un repositorio de portfolio:

```bash
git rm ORDEN_DE_TRABAJO.md GITHUB.md SETUP_WSL.md
```

```bash
git commit -m "quitar notas de trabajo internas"
```

```bash
git push
```

Ojo: borrarlos así los quita de la versión actual, pero siguen en el
historial de git.

## 6. Estudiar `docs/DEFENSA.md`

Es la parte que no puedo hacer por ti. La pregunta 15 («¿qué parte has hecho
tú?») te la van a hacer. Al final de esa respuesta hay tres cosas concretas
que conviene que sepas hacer delante de alguien.

## 7. LinkedIn

Todo está en `docs/linkedin/`: los tres textos, las imágenes de 1080×1350 y
el vídeo. Calendario propuesto en `docs/linkedin/README.md`.

- Lee cada texto y ponlo en tu voz. Los números están comprobados; el tono
  es una propuesta.
- El enlace de las publicaciones apunta a la web publicada: publica solo
  después de comprobar el punto 4.
- LinkedIn recorta el alcance de las publicaciones con enlace en el texto.
  Una opción habitual es poner el enlace en el primer comentario.

## 8. Opcional: actualizar los datos de Horizons

No hace falta: los datos están guardados en el repositorio. Solo si quieres
regenerarlos (por ejemplo, si el JPL publica una efeméride nueva):

```bash
python3 tools/fetch_horizons.py
```

```bash
cmake --build build -j && ./build/gl_tests && ./build/gl_validate web/data
```

```bash
mv web/data/validation.md docs/validation_table.md
```
