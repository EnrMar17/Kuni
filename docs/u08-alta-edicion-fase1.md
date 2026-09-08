# U08: alta y edicion, fase 1

Fecha: 8 septiembre 2026. **Entrega parcial de U08; no cierre operacional.**

## Alcance implementado

- Alta atomica de paciente, diagnosticos, valoracion inicial y consentimiento opcional mediante `register_patient`.
- Edicion desde la ficha, con `update_patient_registration`, motivo obligatorio y control optimista de expediente, diagnosticos activos y ultimo evento de consentimiento.
- Unidad, consultorio y medico se obtienen del contexto autenticado del servidor. La RPC vuelve a verificar membresia, rol clinico, unidad/consultorio/medico activos y pertenencia del paciente. No recibe un usuario actor del formulario.
- Se conservan los diagnosticos existentes seleccionados; los retirados quedan inactivos, sin borrar historia. No se modifican sus descripciones o fechas originales.
- El consentimiento sin cambios no produce eventos nuevos. Un alta sin consentimiento tampoco fabrica una revocacion. Una concesion o revocacion explicita exige version de aviso, metodo y evidencia; se conserva el historial inmutable.
- La revocacion utiliza el corte de cola existente: cancela estados pendientes, no borra entregas ni respuestas previas. Se mantienen los limites de concurrencia externa documentados en U03.
- Se recalculan riesgo/adherencia y alertas en la misma transaccion. La auditoria existente conserva antes/despues y actor; el snapshot de riesgo conserva actor, medico y motivo de la operacion.
- El formulario solo navega a la ficha cuando el servidor confirma ID y fecha de guardado. Mantiene los datos ante errores y reutiliza el ID de alta al reintentar durante la misma apertura. Un resultado incierto requiere revisar el censo, no crear otra alta a ciegas.

## Limites deliberados

- **No se crean recetas ni planes por defecto.** Falta extender el alta atomica y su interfaz con la receta inicial, horarios, planes personalizados y validaciones documentadas. El paciente puede registrarse sin automatizacion clinica configurada.
- El telefono queda de solo lectura en la edicion; SQL tambien rechaza cambiarlo. Falta un flujo separado de revalidacion de identidad, consentimiento y sesion de WhatsApp.
- Se conserva la identidad global por telefono del MVP, incluyendo el rechazo de variantes mexicanas equivalentes `+521`/`+52`. No se introduce soporte de telefonos compartidos.
- El ID estable evita duplicar el mismo intento dentro del formulario, pero no es un protocolo de replay con respuesta recuperable: repetir una alta ya confirmada en SQL devuelve conflicto.
- No se endurecen permisos historicos de DML en esta entrega. Los cambios directos siguen sujetos a las politicas/triggers existentes; las garantias del comando aplican a estas RPC.
- La revision detecta cambios concurrentes visibles, pero las pruebas SQL son de una conexion con PostgreSQL efimero. Falta ensayo multiconexion alojado y el circuito funcional completo de U13.

## Archivos

- `supabase/migrations/0008_patient_registration.sql`: comandos, relojes de version y permisos.
- `src/contracts/patient-registration.ts`: extension explicita; no cambia el contrato congelado de alta anterior.
- `src/actions/patients.ts` y `src/lib/queries/patient-registration.ts`: guardado y lectura acotados.
- `src/components/patient-create-form.tsx`: formulario compartido de alta/edicion.
- `src/app/(protected)/pacientes/[patientId]/editar/page.tsx` y ficha: acceso a edicion.
- `tests/unit/patient-registration.test.ts` y bloque U08 en `domain-core/tests/integration/clinical-rpcs.test.ts`: regresiones.

## Verificacion local

`npm run verify` aprobado: 432 pruebas raiz, 337 de dominio/SQL, ambos typechecks y build. Lint sin errores; conserva tres advertencias ajenas en el JavaScript de scikit-learn dentro de `ml-service/.venv`.

La cobertura nueva incluye 19 pruebas de contratos/accion/lectura y 23 pruebas SQL: permisos, duplicados, fechas, consentimiento, conservacion de historia, tokens con microsegundos, formatos de zona equivalentes, revocacion de cola y rollback total ante un fallo en derivados.

Prueba adicional con Playwright y Edge headless a 390 y 1440 px, usando el formulario real y CSS compilado con accion/navegacion simuladas: validacion, error de guardado sin perder campos, ID estable al reintentar, navegacion solo tras confirmacion, edicion sin duplicar consentimiento y revocacion con evidencia nueva. Sin errores JavaScript ni desbordamiento horizontal; capturas revisadas. Es una prueba aislada, no un E2E autenticado contra Supabase. El fixture y las capturas locales estan en `build/u08-qa/` (ignorado por Git).

## Pendiente remoto y siguiente paso

Esta entrega no aplica migraciones remotas ni envia mensajes. El commit del equipo `e05a355` reporta **0006/0007 aplicadas** y regenera sus tipos desde Supabase; no se repitio esa operacion ni se verifico independientemente el remoto. **Queda pendiente 0008**, necesaria antes de utilizar el guardado nuevo. Aplicar migraciones no sustituye el ensayo alojado del tick y la ingesta.

Continuar con receta y planes iniciales para cerrar U08; despues U09 (citas). Mantener pendiente la validacion alojada de U06/U07/U08 hasta contar con evidencia real.
