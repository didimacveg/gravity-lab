# Puesta en marcha en Ubuntu (WSL)

Abre la terminal de Ubuntu desde el menu de inicio de Windows, o escribe
`wsl` en PowerShell. Todo lo de abajo va en esa terminal, no en PowerShell.

## 1. Herramientas

```bash
sudo apt update
sudo apt install -y build-essential cmake git unzip python3-pip
```

## 2. Traer el proyecto desde Windows

Tus discos de Windows estan montados en `/mnt/c`:

```bash
mkdir -p ~/proyectos
cp /mnt/c/Users/swatt/Downloads/gravity-lab.zip ~/proyectos/
cd ~/proyectos
unzip -o gravity-lab.zip
cd gravity-lab
```

## 3. Compilar y pasar los tests

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
./build/gl_tests
```

Deben salir 17 casos y `Todo correcto`.

## 4. La medida que importa

```bash
./build/gl_bench
pip3 install --break-system-packages pandas matplotlib
python3 bench/plot.py
```

Genera `energy_drift.csv` y `energy_drift.png`, la primera grafica del README.

## 5. Ver el simulador

Dos opciones.

**Navegador**, sin instalar nada. Copia el fichero a Windows y abrelo con
doble clic:
```bash
cp web/simulador.html /mnt/c/Users/swatt/Desktop/
```
Es un fichero unico, sin dependencias ni servidor.

**Ventana nativa** con raylib:
```bash
sudo apt install -y libraylib-dev
cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j
./build/gravity_lab
```
En Windows 11 la ventana aparece sola gracias a WSLg. En Windows 10 hace
falta un servidor X como VcXsrv y exportar `DISPLAY`.

## 6. Subirlo a GitHub

```bash
git init
git add .
git commit -m "simulador n-cuerpos del sistema solar"
gh repo create gravity-lab --public --source=. --push
```
Sin `gh` instalado, crea el repositorio en la web y luego:
```bash
git remote add origin https://github.com/TU_USUARIO/gravity-lab.git
git branch -M main && git push -u origin main
```
