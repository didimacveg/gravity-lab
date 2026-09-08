#pragma once
#include <cstddef>
#include <string>
#include <vector>

namespace gl {

struct Vec3 {
    double x = 0.0, y = 0.0, z = 0.0;

    Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
    Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
    Vec3 operator*(double s) const { return {x * s, y * s, z * s}; }
    Vec3& operator+=(const Vec3& o) { x += o.x; y += o.y; z += o.z; return *this; }
    Vec3& operator-=(const Vec3& o) { x -= o.x; y -= o.y; z -= o.z; return *this; }

    double dot(const Vec3& o) const { return x * o.x + y * o.y + z * o.z; }
    Vec3 cross(const Vec3& o) const {
        return {y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x};
    }
    double normSquared() const { return x * x + y * y + z * z; }
    double norm() const;  // TODO
};

enum class BodyKind { Star, Planet, Moon, Asteroid, BlackHole, Fragment };

// Estado del universo en Structure-of-Arrays.
// Deliberadamente separado del renderizado: este struct se serializa,
// se copia y se reinicia sin tocar nada grafico. De ahi sale el "reset"
// y el guardado de escenarios, gratis.
struct World {
    std::vector<Vec3> position;      // UA
    std::vector<Vec3> velocity;      // UA/dia
    std::vector<Vec3> acceleration;  // UA/dia^2
    std::vector<double> mass;        // M_sol
    std::vector<double> radius;      // UA (radio fisico, no de dibujo)
    std::vector<BodyKind> kind;
    std::vector<std::string> name;
    std::vector<char> alive;         // char, no bool: vector<bool> no da referencias

    double time = 0.0;               // dias desde la epoca
    double absorbedEnergy = 0.0;     // energia perdida en capturas y fusiones

    std::size_t size() const { return mass.size(); }

    std::size_t add(const std::string& name, BodyKind kind, double mass,
                    double radius, const Vec3& pos, const Vec3& vel);  // TODO

    // Traslada el sistema al marco del centro de masas.
    // Sin esto el sistema deriva y las comparaciones con efemerides fallan.
    void moveToBarycentricFrame();  // TODO
};

// Diagnosticos. Son el producto real del proyecto, no un extra.
struct Diagnostics {
    double kineticEnergy = 0.0;
    double potentialEnergy = 0.0;
    double totalEnergy = 0.0;
    Vec3 linearMomentum;
    Vec3 angularMomentum;
};

Diagnostics computeDiagnostics(const World& w);  // TODO

}  // namespace gl
