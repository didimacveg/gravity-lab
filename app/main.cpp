// Aplicacion grafica con raylib. Requiere raylib instalado.
// Vista 3D del sistema solar, con estelas y agujero negro.
#include <raylib.h>
#include <cmath>
#include <deque>
#include <vector>
#include "../core/blackhole.hpp"
#include "../core/ephemeris.hpp"
#include "../core/integrator.hpp"

using namespace gl;

static Vector3 toScene(const Vec3& p, float k) {
    return Vector3{(float)(p.x * k), (float)(p.z * k), (float)(p.y * k)};
}

int main() {
    SetConfigFlags(FLAG_MSAA_4X_HINT | FLAG_WINDOW_RESIZABLE);
    InitWindow(1400, 850, "gravity-lab");
    SetTargetFPS(60);

    World world = makeSolarSystemJ2000();
    ForceConfig cfg;
    computeAccelerations(world, cfg);
    const double e0 = computeDiagnostics(world).totalEnergy;

    std::vector<std::deque<Vector3>> trails(world.size());
    const Color palette[] = {GOLD, GRAY, BEIGE, SKYBLUE, MAROON,
                             ORANGE, YELLOW, (Color){160, 216, 224, 255},
                             (Color){90, 127, 208, 255}};

    Camera3D cam = {};
    cam.position = {0.0f, 34.0f, 46.0f};
    cam.target = {0.0f, 0.0f, 0.0f};
    cam.up = {0.0f, 1.0f, 0.0f};
    cam.fovy = 45.0f;
    cam.projection = CAMERA_PERSPECTIVE;

    float sceneScale = 1.6f;
    double dt = 0.5;
    int stepsPerFrame = 20;
    bool paused = false, use1PN = false, tampered = false;
    int holeIndex = -1;
    Integrator method = Integrator::Yoshida4;

    while (!WindowShouldClose()) {
        if (IsKeyPressed(KEY_SPACE)) paused = !paused;
        if (IsKeyPressed(KEY_P)) { use1PN = !use1PN; cfg.enable1PN = use1PN; }
        if (IsKeyPressed(KEY_ONE)) method = Integrator::ExplicitEuler;
        if (IsKeyPressed(KEY_TWO)) method = Integrator::VerletKDK;
        if (IsKeyPressed(KEY_THREE)) method = Integrator::Yoshida4;
        if (IsKeyPressed(KEY_UP)) stepsPerFrame = std::min(400, stepsPerFrame * 2);
        if (IsKeyPressed(KEY_DOWN)) stepsPerFrame = std::max(1, stepsPerFrame / 2);
        if (IsKeyPressed(KEY_R)) {
            world = makeSolarSystemJ2000();
            computeAccelerations(world, cfg);
            trails.assign(world.size(), {});
            holeIndex = -1;
            tampered = false;
        }
        if (IsKeyPressed(KEY_B) && holeIndex < 0) {
            holeIndex = (int)world.add("agujero", BodyKind::BlackHole, 10.0, 0.0,
                                       Vec3{-100, 18, 0}, Vec3{0.018, 0, 0});
            trails.resize(world.size());
            computeAccelerations(world, cfg);
            tampered = true;
        }
        sceneScale *= (1.0f + 0.06f * GetMouseWheelMove());
        if (IsMouseButtonDown(MOUSE_BUTTON_LEFT)) UpdateCamera(&cam, CAMERA_THIRD_PERSON);

        if (!paused) {
            for (int s = 0; s < stepsPerFrame; ++s) {
                step(world, dt, method, cfg);
                if (holeIndex >= 0) processCaptures(world, holeIndex, BlackHoleConfig{});
            }
            for (std::size_t i = 0; i < world.size(); ++i) {
                if (!world.alive[i]) continue;
                trails[i].push_back(toScene(world.position[i], sceneScale));
                if (trails[i].size() > 700) trails[i].pop_front();
            }
        }

        BeginDrawing();
        ClearBackground((Color){8, 11, 18, 255});
        BeginMode3D(cam);
        for (std::size_t i = 0; i < world.size(); ++i) {
            if (!world.alive[i]) continue;
            const Color col = i < 9 ? palette[i] : BLACK;
            for (std::size_t k = 1; k < trails[i].size(); ++k)
                DrawLine3D(trails[i][k - 1], trails[i][k], Fade(col, 0.35f));
            const Vector3 p = toScene(world.position[i], sceneScale);
            if (world.kind[i] == BodyKind::BlackHole) {
                DrawSphere(p, 0.28f, BLACK);
                DrawSphereWires(p, 0.42f, 8, 8, ORANGE);
            } else {
                DrawSphere(p, world.kind[i] == BodyKind::Star ? 0.45f : 0.16f, col);
            }
        }
        EndMode3D();

        const double drift = std::fabs(
            (computeDiagnostics(world).totalEnergy - e0) / e0);
        const char* mname = method == Integrator::ExplicitEuler ? "Euler"
                          : method == Integrator::VerletKDK ? "Verlet" : "Yoshida4";
        DrawText(TextFormat("%.1f anios   dE/E = %.2e   %s   dt = %.2f d   %s",
                            world.time / 365.25, drift, mname, dt,
                            use1PN ? "1PN activo" : "Newton"),
                 16, 14, 18, RAYWHITE);
        DrawText("espacio pausa | R reinicia | B suelta agujero negro | 1/2/3 integrador | flechas velocidad | P relatividad",
                 16, GetScreenHeight() - 26, 15, GRAY);
        if (tampered)
            DrawText("Masa introducida a mano: la deriva de energia ya no es un test valido.",
                     16, 38, 15, ORANGE);
        EndDrawing();
    }
    CloseWindow();
    return 0;
}
