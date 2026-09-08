# U07 - Derivados por eventos externos

Entrega local del 8 de septiembre de 2026, sobre `develop` actualizado por fast-forward de `2d4a06d` a `f2de17b`. Fuente de continuidad: `continuidad-unificada.md` y la entrega U06. No se vuelve a repartir el trabajo por A/B/C.

## Implementacion

- Nueva migracion incremental `0007_external_derivatives.sql`; no modifica 0001-0006 ni agrega tablas/columnas.
- `public.refresh_patient_derivatives(p_unit_id uuid, p_patient_id uuid)` devuelve booleano: `true` si persiste una evaluacion nueva; `false` si los derivados no cambiaron o el paciente/unidad dejaron de estar activos. Una referencia de paciente/unidad incompatible falla.
- Solo `service_role` puede ejecutar la RPC. Es `SECURITY DEFINER`, con `search_path = ''`; no acepta un medico ni un corte calculado por el cliente. Rechaza una identidad Auth humana y conserva procedencia de sistema, sin atribucion medica ficticia.
- El helper privado toma los bloqueos en el orden del camino clinico: paciente, planes, interacciones, mediciones, respuestas y alertas. Construye las entradas con `clinical_risk_snapshot`, calcula con `clinical_evaluate_risk` y `clinical_adherence`, y compara con la ultima evaluacion persistida.
- Se ignora el cambio del reloj de evaluacion y de metadatos de autoria al comparar; si cambian entradas, resultado de riesgo o adherencia, se guarda un nuevo snapshot con el corte actual. Se compara tambien el resultado reproducido del corte anterior para detectar cambios de ventanas aun con las mismas filas.
- Los cambios de riesgo revisan mediciones actuales y alertas activas vinculadas mediante `clinical_review_measurement`; el recalc usa `clinical_recalculate`. No se introducen rangos ni precedencias nuevos. El caso sin cambios no toca tokens de alertas ni reabre una alerta atendida. Una modificacion solo de adherencia no fuerza la revision de mediciones.
- `refreshPatientDerivatives()` pagina el censo activo usando `readAllJobRows`, envia cada paciente junto con su propia unidad y ejecuta una transaccion por paciente. Devuelve `{checked, refreshed}`. Una respuesta RPC malformada o error SQL falla explicitamente.
- El tick queda: **callbacks -> inbound -> expiracion -> derivados -> materializacion -> envio -> callbacks**. La respuesta JSON agrega `derivatives: {checked, refreshed}`. Un fallo de derivados detiene nuevos envios de ese tick; un reintento conserva el trabajo confirmado de pacientes anteriores y vuelve a comprobarlos sin duplicar snapshots sin cambios.
- U06 ya recalculaba atomicamente despues de una toma/medicion entrante. Esta entrega no duplica esa ingesta: el barrido complementa expiraciones, cambios externos de planes/datos y el paso del tiempo.

## Vista de adherencia

`patient_adherence` conserva sus columnas, tipos, privilegios y `security_invoker=true`. Ahora aplica la cohorte canonica de C: medicamentos de las ultimas 720 horas, no futuros; cancelados y fallidos no forman parte de Y/N/U; respuestas futuras no cuentan; una respuesta valida acredita Y/N aunque no haya callback, y U requiere entrega/plazo cumplido.

Los porcentajes son Y/(Y+N) y (Y+N)/(Y+N+U), con un decimal y `null` si falta denominador. Las exclusiones tecnicas siguen disponibles en el resultado completo de C; no se agrego una columna nueva a la vista ni se las conto como negativas. RLS sigue filtrando por la sesion del consumidor, sin un helper privilegiado expuesto a sesiones clinicas.

## Archivos

- `supabase/migrations/0007_external_derivatives.sql`
- `src/lib/jobs/refresh-derivatives.ts`
- `src/app/api/jobs/tick/route.ts`
- `src/types/database.types.ts`: firma incremental escrita contra el SQL local; no se presenta como regeneracion remota, que sigue pendiente.
- `tests/unit/jobs-refresh-derivatives.test.ts`, `jobs-tick-route.test.ts`
- `domain-core/tests/integration/clinical-rpcs.test.ts`: aplica tambien 0007, sin modificar las migraciones anteriores.
- Este documento, el indice y `continuidad-unificada.md`.

## Verificacion

`npm run verify` finalizo con codigo 0:

| Comprobacion | Resultado |
|---|---|
| Suite raiz | 413 pruebas, 41 archivos |
| Suite dominio/SQL | 314 pruebas, 13 archivos |
| Typecheck raiz y dominio | Aprobados |
| ESLint | Cero errores; tres advertencias en JS de scikit-learn dentro del entorno local `ml-service/.venv`, ajeno a esta entrega |
| Build de produccion | Aprobado, Next.js 16.3.4 |

Las suites comparten pruebas unitarias; sus totales no se suman. U07 agrega 15 pruebas SQL y cinco pruebas de worker/tick. Verifican snapshot idempotente, tokens sin cambios, autoria de sistema, cambios de limites del plan, vencimiento por tiempo, expiracion, cambios de respuesta, alerta descartada, roles, aislamiento por paciente/unidad, paciente inactivo, rollback ante fallo y paridad de la vista en estados de entrega representativos. El worker se prueba con 501 pacientes y propagacion de fallos antes de enviar.

Las siete migraciones se ejecutaron en PGlite efimero; Auth de prueba y una sola conexion. No se enviaron WhatsApp, no se invoco un tick alojado ni el modelo, y no se declara verificacion multiconexion o funcional de navegador. El build carga la configuracion local normal de Next, sin imprimir secretos. Se sincronizaron las dependencias de dominio con `npm --prefix domain-core ci --offline --ignore-scripts --no-audit --no-fund`, usando el lock recibido y permisos autorizados para leer la cache; no se modifico el lock.

## Aplicacion remota pendiente

El usuario confirmo que Supabase es de prueba y autorizo migraciones. Se intento consultar el estado remoto, pero este checkout no esta vinculado y el CLI no tiene sesion: `LegacyProjectNotLinkedError` al listar migraciones y `LegacyPlatformAuthRequiredError` al listar proyectos. No se aplico SQL remoto ni se invento el proyecto de destino.

Siguiente procedimiento, una vez que el operador complete login/link del proyecto de prueba:

1. Consultar la lista de migraciones vinculadas y comprobar el estado real, no solo la bitacora.
2. Revisar el dry-run del push. Esta entrega espera 0006 y 0007 pendientes si el proyecto sigue en 0005; si difiere, investigar antes de aplicar.
3. Aplicar las migraciones autorizadas y regenerar/verificar tipos desde ese esquema. No modificar historia ya aplicada ni reparar el registro de migraciones a ciegas.
4. Desplegar conjuntamente migraciones y servidor: el tick nuevo requiere la RPC de 0007; sin ella detiene el envio. U06 requiere 0006.
5. Ejecutar ensayo controlado con datos ficticios y sin envios externos no autorizados: respuesta -> derivados, expiracion -> derivados, cambio de plan -> siguiente tick, repeticion -> sin nueva evaluacion injustificada. El ensayo real de WhatsApp se coordina por separado.

## Limites y continuacion

- El cambio de un plan por DML directo y su recalc NO comparten transaccion: el barrido lo detecta en el siguiente tick exitoso. La latencia depende del scheduler y del volumen, no se promete un segundo exacto. Los futuros comandos de U08 deben integrar recalc en la misma transaccion si requieren consistencia inmediata.
- La expiracion y el barrido son llamadas distintas; un corte del proceso entre ambas deja derivados pendientes hasta el siguiente tick exitoso. Cada evaluacion/alertas de un paciente si se confirma o revierte en conjunto.
- El barrido recorre el censo completo. Se evitan escrituras innecesarias, no el coste de lectura/calculo. Medir latencia y contencion antes de escalar; una cola de invalidaciones o planificador de proximos cambios temporales requeriria un diseno y migracion posteriores, no tablas inventadas en esta entrega.
- No se revisa retrospectivamente toda la historia cerrada de alertas ni se limpia una incidencia antigua sin evidencia. Se mantiene la politica existente de riesgo/alertas; las mediciones historicas conservan sus datos.
- La RPC publica usa reloj de servidor. El parametro temporal privado existe solo para reutilizacion interna y pruebas deterministas; no esta concedido a `service_role`, `authenticated` ni `anon`.
- Las carreras con escritores ajenos, coherencia multiconsulta del dashboard y permisos DML heredados mantienen los limites anteriores. No se promete ausencia de deadlocks ni entrega externa exactamente una vez.
- Pendientes inmediatos: validar U06/U07 alojados tras login/link, y continuar **U08 (alta/edicion atomicas)** y **U09 (agenda)** con los acuerdos funcionales ya documentados. U10-U14 no quedan cerrados por esta entrega.

**Estado:** nucleo de U07 implementado y verificado localmente. Aplicacion remota y ensayo operacional pendientes. El reporte previo local `reporte-develop-2026-09-08.md` se conserva intacto como antecedente anterior al pull; no es el backlog vigente.
