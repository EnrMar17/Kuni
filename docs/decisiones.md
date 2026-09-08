# Bitácora de decisiones

Registro cronológico de decisiones técnicas y de alcance. Formato: fecha, decisión, motivo, quién la tomó.

---

## 2026-09-07 — Estructura inicial del repositorio

- **Decisión:** Se crea la estructura de carpetas del proyecto siguiendo la arquitectura definida en el plan técnico (Next.js App Router + Supabase). Los documentos de planeación (`requerimientos-rpm-cronicos.md`, `kuni-plan-tecnico.md`, `kuni-schema.sql`, `kuni-cron.sql`, `kuni.env.example`) se excluyen del repositorio vía `.gitignore` y se comparten por otro medio entre los tres integrantes.
- **Motivo:** Mantener el repositorio enfocado en código versionable; los documentos de planeación son de trabajo interno y pueden contener notas de alcance en evolución.
- **Quién:** Configuración inicial del proyecto.

## 2026-09-07 — Primer flujo de A sobre fixtures

- **Decisión:** El login, la selección de consultorio y el resumen inicial del dashboard operan primero con fixtures tipados y una sesión provisional en cookie HTTP-only. Las pantallas identifican estos datos como ficticios.
- **Motivo:** Permitir que A avance sin bloquearse por la creación del proyecto Supabase, conservando límites claros para sustituir sesión y consultas por implementaciones reales.
- **Quién:** Integrante A.
