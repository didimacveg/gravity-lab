cmake_minimum_required(VERSION 3.16)
project(gravity-lab CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# El nucleo NO depende de raylib. Esa separacion es lo que permite correr
# tests y benchmarks sin ventana, y compilar a WASM sin arrastrar nada
# de escritorio.
add_library(gl_core STATIC
    core/state.cpp
    core/scenario.cpp
    core/forces.cpp
    core/integrator.cpp
    core/blackhole.cpp
    core/analysis.cpp
    core/ephemeris.cpp
    core/reference.cpp
)
target_include_directories(gl_core PUBLIC core)

if(NOT MSVC)
    # -ffp-contract=off: sin fusionar a*b+c en una sola instruccion (FMA), para
    # que los numeros salgan iguales en x86 y en ARM.
    target_compile_options(gl_core PUBLIC -ffp-contract=off)
    target_compile_options(gl_core PRIVATE -Wall -Wextra -O2)
    # Prohibido -ffast-math: rompe la reproducibilidad y hace que los tests
    # de conservacion mientan.
endif()

# --- Tests ---
add_executable(gl_tests
    tests/main.cpp
    tests/test_two_body.cpp
    tests/test_conservation.cpp
    tests/test_mercury_precession.cpp
    tests/test_black_hole.cpp
    tests/test_orbits_are_ellipses.cpp
    tests/test_stability.cpp
    tests/test_horizons.cpp
    tests/test_integrators.cpp
    tests/test_experiments.cpp
)
target_link_libraries(gl_tests PRIVATE gl_core)
target_compile_definitions(gl_tests PRIVATE
    GL_DATA_DIR="${CMAKE_SOURCE_DIR}/web/data")

# --- Benchmark headless ---
add_executable(gl_bench bench/main.cpp)
target_link_libraries(gl_bench PRIVATE gl_core)

# --- Validacion contra JPL Horizons ---
add_executable(gl_validate bench/validate.cpp)
target_link_libraries(gl_validate PRIVATE gl_core)
target_compile_definitions(gl_validate PRIVATE
    GL_DATA_DIR="${CMAKE_SOURCE_DIR}/web/data")

# --- Aplicacion grafica (opcional: solo si raylib esta instalado) ---
find_package(raylib QUIET)
if(raylib_FOUND)
    add_executable(gravity_lab app/main.cpp)
    target_link_libraries(gravity_lab PRIVATE gl_core raylib)
    if(EMSCRIPTEN)
        set_target_properties(gravity_lab PROPERTIES SUFFIX ".html")
        target_link_options(gravity_lab PRIVATE
            -sUSE_GLFW=3 -sASYNCIFY -sALLOW_MEMORY_GROWTH)
    endif()
else()
    message(STATUS "raylib no encontrado: se omite el target grafico. "
                   "Los tests y el benchmark si compilan.")
endif()
