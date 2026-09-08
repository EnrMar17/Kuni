# Bitácora de decisiones

Registro cronológico de decisiones técnicas y de alcance. Formato: fecha, decisión, motivo, quién la tomó.

## 2026-09-08 — Continuidad unificada

- **Decisión del usuario:** trabajar como una sola persona y atacar la rúbrica común, dejando al final evidencia de lo realizado y de lo pendiente. Se conserva la autoría histórica, pero el backlog activo deja de dividirse en A/B/C.
- **Ejecución:** primera entrega centrada en paginación/corte efectivo, revalidación y persistencia de envío, callbacks durables, paridad de expiración, entorno común de pruebas y corte/procedencia RF30. No se aprobaron por inferencia políticas nuevas de agenda o TTL del modelo.
- **Seguimiento:** [continuidad-unificada.md](continuidad-unificada.md) es el punto vigente. Mantiene abiertos ingesta/BAJA, captura, citas, recuperación con proveedor y validación alojada.

---

## 2026-09-07 — Estructura inicial del repositorio

- **Decisión:** Se crea la estructura de carpetas del proyecto siguiendo la arquitectura definida en el plan técnico (Next.js App Router + Supabase). Los documentos de planeación (`requerimientos-rpm-cronicos.md`, `kuni-plan-tecnico.md`, `kuni-schema.sql`, `kuni-cron.sql`, `kuni.env.example`) se excluyen del repositorio vía `.gitignore` y se comparten por otro medio entre los tres integrantes.
- **Motivo:** Mantener el repositorio enfocado en código versionable; los documentos de planeación son de trabajo interno y pueden contener notas de alcance en evolución.
- **Quién:** Configuración inicial del proyecto.

## 2026-09-07 — Primer flujo de A sobre fixtures

- **Decisión:** El login, la selección de consultorio y el resumen inicial del dashboard operan primero con fixtures tipados y una sesión provisional en cookie HTTP-only. Las pantallas identifican estos datos como ficticios.
- **Motivo:** Permitir que A avance sin bloquearse por la creación del proyecto Supabase, conservando límites claros para sustituir sesión y consultas por implementaciones reales.
- **Quién:** Integrante A.

## 2026-09-07 — Integración de develop después de la revisión funcional

- **Decisión:** Sustituir sesión y consultas fixture por Supabase SSR con verificación por unidad/consultorio. Retirar credenciales de ejemplo y conectar el dashboard al mismo dominio de riesgo/adherencia que usa C. El diseño se conserva; cambian fuentes de datos, navegación y significado de indicadores.
- **Motivo:** La combinación anterior de proxy Supabase y cookie fixture causaba un bucle de acceso; las constantes del dashboard no acreditaban funcionalidad clínica.
- **Contrato:** Los valores compartidos coinciden con SQL (`intersex`, `after_meal`, `whatsapp`, tipos/estados de interacción). Referencias de 8 caracteres admitidas. Las reglas v2 exigen cobertura por plan/variable/contexto para inferir bajo riesgo; una confirmación de toma no reemplaza una medición.
- **Límites:** Consulta de dashboard calcula resultados actuales sin persistirlos. No hay todavía altas/ediciones clínicas, cinco RPC transaccionales, automatización WhatsApp ni endpoint predictivo conectado. Los controles de escritura correspondientes permanecen deshabilitados.
- **Quién:** Integración de las áreas A/B/C, solicitada por el usuario; cambios preparados en `develop` sin commit ni despliegue.

## 2026-09-07 — Contrato predictivo revisado y documentación por integrante

- **Decisión:** Un único riesgo actual por `evaluateRisk()`. La IA futura es opcional y retorna probabilidad, versión y suficiencia por variable; se descarta el segundo riesgo actual y no se incorporan alertas ML sin confirmar.
- **Nuevas funciones planificadas:** RF28 captura médica de complicaciones/fases; RF29 vector tipado/cliente de servidor; RF30 presentación experimental con manejo de ausencia. Una sola adherencia y contrato explícito de escala/denominador. No modificar automáticamente cadencias HAS ni dosis por fase o predicción.
- **Motivo:** El documento de contexto posterior corrige al primer documento de cambios. Aún faltan diccionario completo de entradas, elegibilidad, horizonte y endpoint real; la migración por sí sola no concluye la integración.
- **Documentación:** Se mantiene `documentacionA.md`, se añaden `documentacionB.md` y `documentacionC.md`, y se conserva la bitácora operativa de B. El plan revisado compartible queda en `plan-integracion.md`; los originales internos siguen ignorados por Git.
- **Quién:** Revisión e integración de Kuni, a solicitud del usuario. La política provisional de ocultar predicciones con toda la suficiencia falsa debe contrastarse con el equipo IA antes de activar el endpoint.
