#pragma once
// Efemerides de referencia de NASA/JPL Horizons (DE441) y la comparacion de
// la simulacion contra ellas. Los datos los descarga y guarda
// tools/fetch_horizons.py; aqui solo se leen.
#include <string>
#include <vector>
#include "forces.hpp"
#include "integrator.hpp"
#include "state.hpp"

namespace gl {

// Sol y los ocho baricentros planetarios con los vectores de estado de
// DE441 en J2000.0 y las masas GM de DE440. NO se traslada al baricentro:
// el origen de DE441 incluye asteroides y Pluton, que aqui no existen, y
// recentrar introduciria una deriva artificial.
World makeSolarSystemHorizons();

// Posiciones de referencia: [muestra][cuerpo][xyz], una muestra cada
// horizons::CADENCE_DAYS dias, centradas en J2000.0.
struct Reference {
    std::vector<double> data;
    bool ok() const { return !data.empty(); }
    Vec3 position(std::size_t sample, std::size_t body) const;
};

// Lee web/data/horizons_planets.f64. Devuelve una referencia vacia si el
// fichero no existe o no tiene el tamano esperado.
Reference loadReference(const std::string& path);

// Error de posicion HELIOCENTRICA del cuerpo `body` frente a la referencia,
// en km. Se compara (planeta - Sol) y no la posicion baricentrica para que
// el resultado no dependa del origen del sistema de referencia.
double heliocentricErrorKm(const World& w, const Reference& ref,
                           std::size_t sample, std::size_t body);

struct ValidationRun {
    // maxErrorKm[i][p]: maximo error del planeta p+1 hasta checkpointYears[i]
    std::vector<double> checkpointYears;
    std::vector<std::vector<double>> maxErrorKm;
    double maxEnergyDrift = 0.0;   // max |dE/E| en todo el tramo
    double finalEnergyDrift = 0.0;
    // Serie completa, una fila por muestra de referencia.
    std::vector<double> years;
    std::vector<std::vector<double>> errorKm;  // [muestra][planeta]
    std::vector<double> energyDrift;
    std::vector<double> mercuryVarpi;          // rad, sin desenrollar
};

// Integra desde J2000.0 hacia delante `years` anios y compara con la
// referencia en cada muestra. dt debe dividir a la cadencia de la referencia.
ValidationRun runValidation(const Reference& ref, World w, Integrator method,
                            double dt, double years, const ForceConfig& cfg);

}  // namespace gl
