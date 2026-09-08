# Documentación del proyecto

Esta carpeta concentra la documentación viva de Kuni: lo que no está en el código pero el equipo necesita saber. El resumen de arquitectura y alcance está en el [README principal](../README.md); aquí va el detalle y la bitácora de avance.

## Contenido

- [`decisiones.md`](decisiones.md) — Bitácora de decisiones técnicas y de alcance tomadas durante el desarrollo (fecha, decisión, motivo, quién la tomó).
- [`bitacora-canal-b.md`](bitacora-canal-b.md) — Bitácora operativa de B (persistencia y transporte): Supabase, datos de prueba y canal de WhatsApp.

## Convención de uso

- Cada integrante agrega una entrada en `decisiones.md` cuando tome una decisión que afecte a los otros dos (cambio de contrato, ajuste de alcance, elección técnica).
- Los documentos de planeación originales (`requerimientos-rpm-cronicos.md`, `kuni-plan-tecnico.md`, `kuni-schema.sql`, `kuni-cron.sql`, `kuni.env.example`) se comparten fuera de Git (ver `.gitignore` en la raíz); esta carpeta documenta lo que pasa **después** de esa planeación inicial.
