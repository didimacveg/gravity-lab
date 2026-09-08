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
)
target_include_directories(gl_core PUBLIC core)

if(NOT MSVC)
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
)
target_link_libraries(gl_tests PRIVATE gl_core)

# --- Benchmark headless ---
add_executable(gl_bench bench/main.cpp)
target_link_libraries(gl_bench PRIVATE gl_core)

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
