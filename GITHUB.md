# Subirlo a GitHub y publicarlo

Todo esto se hace desde la terminal de Ubuntu (WSL), dentro de
`~/proyectos/gravity-lab`.

## 1. Identificarte con git (solo la primera vez)

```bash
git config --global user.name "Diego Macias Vega"
git config --global user.email "TU_CORREO_DE_GITHUB"
```

## 2. Crear el repositorio

Con la herramienta oficial de GitHub:

```bash
sudo apt install -y gh
gh auth login          # elige GitHub.com, HTTPS, y autenticar por navegador
git init -b main
git add .
git commit -m "simulador n-cuerpos del sistema solar"
gh repo create gravity-lab --public --source=. --push
```

Sin `gh`: crea el repositorio vacio en <https://github.com/new>, sin README
ni licencia, y luego:

```bash
git init -b main
git add .
git commit -m "simulador n-cuerpos del sistema solar"
git remote add origin https://github.com/TU_USUARIO/gravity-lab.git
git push -u origin main
```

GitHub ya no acepta contrasenas por HTTPS. Si te la pide, entra en
Settings > Developer settings > Personal access tokens > Tokens (classic),
genera uno con permiso `repo` y pegalo como contrasena.

## 3. Trabajo diario

```bash
git add -A
git commit -m "que has cambiado"
git push
```

Commits pequenos y frecuentes. Un historial que va de "nucleo" a
"precesion de Mercurio" cuenta una historia; un unico commit de 3000
lineas no cuenta nada.

## 4. Integracion continua

`.github/workflows/tests.yml` compila el proyecto y corre los 27 tests en
cada push. Si algo se rompe, GitHub te marca el commit en rojo. El CSV del
benchmark queda guardado como artefacto descargable.

## 5. Publicar el simulador en la web

`.github/workflows/pages.yml` publica `web/simulador.html` automaticamente.
Para activarlo, una sola vez: en el repositorio, Settings > Pages > Source,
elige **GitHub Actions**.

A partir de ahi el simulador queda en:
`https://TU_USUARIO.github.io/gravity-lab/`

Ese enlace es lo que ensenas en clase. No hay que instalar nada ni compilar
nada: se abre en cualquier navegador, tambien en el del proyector.

## 6. Desde VS Code

Con la carpeta abierta en VS Code (`code .` desde WSL), el panel de control
de codigo fuente (Ctrl+Shift+G) hace lo mismo con botones: escribes el
mensaje, pulsas el visto para confirmar, y la flecha circular para
sincronizar. La barra de estado abajo a la izquierda debe decir `WSL:
Ubuntu`; si no lo dice, estas editando desde Windows y el build fallara.
