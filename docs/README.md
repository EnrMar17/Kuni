# Documentación del proyecto

Esta carpeta concentra la documentación viva de Kuni: lo que no está en el código pero el equipo necesita saber. El resumen de arquitectura y alcance está en el [README principal](../README.md); aquí va el detalle y la bitácora de avance.

## Contenido

- [`continuidad-unificada.md`](continuidad-unificada.md) — **Punto de continuidad vigente:** backlog único, entrega realizada, pruebas y pendientes. Sustituye la organización del trabajo por integrante.
- [`u06-inbound-y-baja.md`](u06-inbound-y-baja.md) — Ingesta atómica, BAJA, pruebas y migración 0006; distingue implementación local de operación alojada.
- [`u07-derivados-externos.md`](u07-derivados-externos.md) — Recálculo por eventos/tiempo, vista de adherencia alineada, migración 0007 y límites de consistencia/operación.

- [`auditoria-estado-actual.md`](auditoria-estado-actual.md) — Auditoría sobre `2d4a06d`, anterior al backlog unificado: correcciones, rendimiento medido y rúbrica original por integrante.

- [`documentacionA.md`](documentacionA.md) — A: acceso Supabase, dashboard conectado, formularios y acciones pendientes.
- [`documentacionB.md`](documentacionB.md) — B: persistencia, consultas reales, transporte y migraciones pendientes.
- [`documentacionC.md`](documentacionC.md) — C: dominio, contratos, pruebas, RPC e integración predictiva pendientes.
- [`plan-integracion.md`](plan-integracion.md) — Correcciones de develop, nuevos RF28–RF30, dependencias y siguiente entrega por miembro.
- [`auditoria-integracion.md`](auditoria-integracion.md) — Auditoría del 8 sept 2026: avance por integrante, hallazgos de integración, desalineaciones con esta documentación y orden sugerido.
- [`pendientes-y-modelo.md`](pendientes-y-modelo.md) — Pendientes de A/B/C separados en independientes y bloqueados, e integración del microservicio predictivo entregado por el equipo de IA.

- [`decisiones.md`](decisiones.md) — Bitácora de decisiones técnicas y de alcance tomadas durante el desarrollo (fecha, decisión, motivo, quién la tomó).
- [`bitacora-canal-b.md`](bitacora-canal-b.md) — Bitácora operativa de B (persistencia y transporte): Supabase, datos de prueba y canal de WhatsApp.

## Convención de uso

- Cada integrante agrega una entrada en `decisiones.md` cuando tome una decisión que afecte a los otros dos (cambio de contrato, ajuste de alcance, elección técnica).
- Los documentos de planeación originales (`requerimientos-rpm-cronicos.md`, `kuni-plan-tecnico.md`, `kuni-schema.sql`, `kuni-cron.sql`, `kuni.env.example`) se comparten fuera de Git (ver `.gitignore` en la raíz). La revisión funcional y sus acuerdos de integración se versionan en `plan-integracion.md` para que este commit tenga contexto suficiente sin los adjuntos privados.
