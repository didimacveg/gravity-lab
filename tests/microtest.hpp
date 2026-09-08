#pragma once
// Framework de tests minimo, ~40 lineas. Sin dependencias externas:
// Catch2 y GoogleTest complican el build a WASM sin aportar nada aqui.
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

namespace microtest {

struct Case { const char* name; void (*fn)(); };
inline std::vector<Case>& registry() { static std::vector<Case> r; return r; }
inline int& failures() { static int f = 0; return f; }

struct Registrar {
    Registrar(const char* name, void (*fn)()) { registry().push_back({name, fn}); }
};

inline void check(bool ok, const char* expr, const char* file, int line) {
    if (!ok) { std::printf("    FALLO %s  (%s:%d)\n", expr, file, line); ++failures(); }
}

inline void nearly(double a, double b, double tol, const char* expr,
                   const char* file, int line) {
    if (!(std::fabs(a - b) <= tol)) {
        std::printf("    FALLO %s : %.17g vs %.17g (tol %.3g)  (%s:%d)\n",
                    expr, a, b, tol, file, line);
        ++failures();
    }
}

inline int runAll() {
    for (auto& c : registry()) { std::printf("  %s\n", c.name); c.fn(); }
    std::printf(failures() ? "\n%d comprobaciones fallidas\n" : "\nTodo correcto\n",
                failures());
    return failures() ? 1 : 0;
}

}  // namespace microtest

#define TEST(name)                                                       \
    static void name();                                                  \
    static microtest::Registrar reg_##name(#name, name);                 \
    static void name()

#define ASSERT(expr) microtest::check((expr), #expr, __FILE__, __LINE__)
#define ASSERT_NEAR(a, b, tol) microtest::nearly((a), (b), (tol), #a " ~ " #b, __FILE__, __LINE__)
