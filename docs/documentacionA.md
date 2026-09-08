# Documentación A

## Continuidad de interfaz — 8 septiembre 2026

- Se añadieron fronteras de error recuperables a censo, ficha, alta, alertas, citas y estadísticas, más un `global-error.tsx`. Todas usan el mismo fallback accesible y no exponen detalles internos al navegador.
- El censo ahora combina búsqueda y prioridad con filtros por diagnóstico y por pacientes con interacciones pendientes. La paginación sigue siendo de presentación sobre la respuesta ya acotada del servidor.
- Se conectaron las acciones clínicas ya aplicadas en Supabase: resolución de alertas, marca de urgencia, corrección de mediciones y ajuste de receta. Cada una valida la entrada, exige contexto de escritura, conserva su token de concurrencia y traduce `PT401/PT403/PT409/PT422` al envelope `{ data, error }`.
- La ficha incorpora RF28: registro y retiro de complicaciones E110–E119. La acción valida que el paciente pertenezca al consultorio seleccionado, usa RLS y respeta la exclusión de E119 frente a otros códigos vigentes.
- Se formatearon los componentes clínicos que tenían líneas kilométricas, con Prettier, para que los diffs vuelvan a ser revisables.
- El árbol de dependencias se reinstaló desde Windows y se añadió el binding opcional de Rolldown para Windows. Vitest vuelve a arrancar; las pruebas unitarias de filtros y del adaptador de alerta pasan.
- Estadísticas vive en `/estadisticas`, accesible desde la cabecera compartida. Genera reportes agregados de resumen, prioridad y adherencia con vista previa, CSV e impresión/PDF local. Los reportes identifican corte, unidad, consultorio y ventanas de lectura; no exportan nombres ni identificadores de pacientes.
- Programar cita usa React Hook Form y valida paciente del censo, motivo y horario futuro en la zona del consultorio. Ofrece resumen y limpieza de campos; permanece sin guardar hasta conectar la operación transaccional e invalidación de recordatorios.
- Se retiraron los enlaces redundantes «Volver al dashboard» y el botón separado de Indicadores.
- Se añadió clasificación terapéutica en cada receta activa: el médico puede marcar el medicamento como antidiabético, antihipertensivo u otra clase. La Server Action verifica que la receta activa pertenezca al paciente y al consultorio seleccionados antes de actualizar el catálogo protegido por RLS; el cambio queda en la auditoría de `medications`.
- La clasificación terapéutica ya se vuelve a leer desde Supabase y se presenta como vigente al reabrir la ficha. El censo también muestra alertas, pendientes de respuesta y próxima cita por paciente; el dashboard principal dirige sus accesos rápidos a los flujos reales de alertas y tratamiento, en vez de dejarlos deshabilitados.
- La ficha ya integra RF30. El panel consulta el modelo solo desde el servidor, se entrega progresivamente con skeleton y muestra nivel, probabilidad o techo de riesgo, suficiencia y brechas. Si no hay endpoint o la respuesta es inválida, conserva un estado neutral y visible de «Servicio no disponible», sin fabricar una predicción ni modificar la prioridad clínica.

- Dashboard, censo, ficha, alta, alertas, citas y estadísticas usan `ClinicalHeader`, con los mismos controles y selección activa derivada de la ruta. Los datos del médico/consultorio siguen llegando desde el contexto SSR.
- El alta usa React Hook Form: validación por campo, códigos de diagnóstico compatibles con SQL y consentimiento opcional con versión de aviso, método y evidencia. Es preparación en memoria; todavía no persiste pacientes.
- Se añadieron `loading.tsx` para dashboard, censo, alta, ficha, alertas, citas y estadísticas, con skeletons adaptados a sus distribuciones. Las entradas de contenido y microinteracciones respetan movimiento reducido.
- El login conserva sus acciones y errores de acceso en una tarjeta compacta, sin el panel institucional lateral.
- B/C todavía deben conectar la creación atómica y la trazabilidad del consentimiento; el formulario no envía identidades de autoridad ni escribe directamente a Supabase. No se modificaron migraciones ni tipos generados.

## Resumen del avance

En la primera etapa se inició el trabajo asignado al integrante A con fixtures para integrar el diseño mientras avanzaban la base de datos y las automatizaciones. La integración actual sustituye el acceso de demostración por Supabase Auth SSR y la selección real de consultorios de la unidad autorizada.

El flujo funcional disponible es:

```text
/login → /consultorios → /dashboard
```

Desde el dashboard se navega a censo, alta, ficha individual, alertas, citas y estadísticas. Las lecturas usan Supabase; el alta y la preparación de citas siguen siendo formularios en memoria sin persistencia. Los reportes agregados se generan localmente con los datos cargados.

Esta continuidad de A no modificó el esquema SQL, los tipos generados, el cron ni el transporte de WhatsApp.

## Lo que se hizo de A

### Base técnica y contratos

- Se estableció la estructura de rutas públicas y protegidas con Next.js App Router.
- Se mantuvieron las páginas como Server Components y se aisló la interacción del dashboard en un Client Component.
- Se crearon contratos Zod y tipos clínicos compartidos.
- La primera etapa usó fixtures tipados; sus módulos y credenciales de demostración se retiraron al conectar las consultas reales.
- La sesión provisional por fixtures fue retirada del flujo operativo. Login y logout usan Supabase Auth; las cookies SSR son administradas por su SDK.
- Las Server Actions de acceso validan entradas y vuelven a comprobar JWT, membresía, unidad activa y pertenencia del consultorio. `requireClinicalWriteContext()` rechaza mutaciones de cuentas `viewer`.

### Inicio de sesión

- Se conectó el formulario a `signInWithPassword` con credenciales administradas en Supabase Auth y estados de validación, error y carga.
- La pantalla conserva el diseño integrado en la primera etapa: fondo gris azulado, azul marino, acentos índigo, tarjetas redondeadas y tipografía Plus Jakarta Sans.
- Se retiraron el panel institucional lateral y sus elementos difuminados. Quedó una tarjeta compacta del ancho del formulario, con bienvenida, credenciales y botón «Iniciar sesión», conservando errores y reintento de cierre de sesión.
- Una sesión con membresía activa pasa al consultorio o al dashboard según su selección. Una sesión sin membresía muestra el error en login, sin bucles de redirección.
- El proxy renueva las cookies de Supabase y conserva sus cambios también al redirigir. El login permanece accesible para explicar errores de membresía o conexión; no basta con tener un JWT para acceder a datos clínicos.
- Cerrar sesión ejecuta `signOut` local y borra la preferencia de consultorio y cookies antiguas de demostración. Si falla, se informa y se ofrece reintentar.
- Los destinos posteriores al acceso se limitan a rutas internas; se rechazan URLs externas y retornos a login.

### Selección de consultorio

- La vista consulta en Supabase los consultorios activos de la unidad autenticada con médico activo, usando el JWT del usuario y RLS.
- Cada tarjeta muestra médico, cédula profesional, conteo exacto de pacientes activos y alertas abiertas o en revisión de ese consultorio.
- La selección se guarda en una cookie HTTP-only y redirige al dashboard.
- Se valida que el identificador tenga formato UUID y que el consultorio pertenezca a la unidad autenticada y siga activo; la selección se revalida al recuperar el contexto de cada operación.
- Se incluyeron estados de consulta fallida, ausencia de consultorios operativos y cierre de sesión. Una cuenta `viewer` puede seleccionar consultorio para consultar, sin permiso para modificar datos clínicos.

### Dashboard / landing clínica

- Se trasladó el diseño de `landingstitch.html` a React y Tailwind CSS 4.
- Se reprodujeron el lienzo flotante, navegación en cápsulas, métricas, triaje, esquemas farmacológicos, próximas citas y ficha clínica lateral.
- El dashboard carga datos reales de Supabase mediante una consulta SSR que verifica de nuevo unidad y consultorio; un error de consulta no se sustituye por fixtures ni por indicadores en cero.
- La búsqueda filtra por nombre, expediente, CURP y diagnóstico, tolera acentos y permite alternar filtro de prioridad y orden por prioridad/nombre.
- Seleccionar un paciente cambia mediciones, diagnósticos, motivos de riesgo, recetas, adherencia e hitos del bot del mismo expediente. La cabecera lleva a censo, alertas, citas y estadísticas; las métricas y el historial del dashboard permanecen disponibles.
- El consultorio y el médico provienen del contexto autorizado. Se puede cambiar de consultorio y actualizar las lecturas del dashboard.
- Se retiraron probabilidades ficticias, porcentajes de abandono, stock de insumos, confirmación automática de citas y conversaciones/síntomas inventados.
- La prioridad actual procede de `evaluateRisk()`; la adherencia y cobertura proceden de `computeAdherence()` con cohortes de tomas. Se muestran desconocidos y valores «Sin datos».
- La gráfica utiliza fechas y valores observados, con ventanas de 7/14/30/90 días, glucosa en ayuno y presión sistólica/diastólica. No se inventan curvas ni bandas objetivo. Otros contextos de glucosa permanecen en el DTO para la ficha completa pendiente.
- Las próximas citas son las registradas para el consultorio dentro de 90 días; no se afirma que el bot las haya confirmado.
- «Abrir WhatsApp» abre contacto manual con el paciente que tiene consentimiento vigente; no envía mensajes ni sustituye el bot automatizado. «Nuevo paciente» abre el formulario de preparación; el alta persistente sigue pendiente de su comando transaccional.

### Vistas clínicas y reportes

| Ruta | Disponible | Límite actual |
|---|---|---|
| `/pacientes` | Censo real, búsqueda por nombre/expediente/CURP/diagnóstico, filtro de prioridad, diagnóstico y pacientes con interacciones pendientes; enlaces a ficha y páginas de 12 pacientes. | Paginación de presentación sobre el censo cargado, no paginación de servidor. Falta filtro por periodo y consultas especializadas para mayor volumen. |
| `/pacientes/nuevo` | React Hook Form, errores por campo, identificación, contacto, grupo sanguíneo, códigos de diagnóstico, valoración inicial y datos de consentimiento. | Solo revisión en memoria. No crea paciente ni evento de consentimiento; faltan objetivos, monitoreo, receta y horarios. |
| `/pacientes/[patientId]` | Resumen, diagnósticos, prioridad y motivos, últimas mediciones, contacto, consentimiento, tratamiento vigente, clasificación terapéutica por receta, complicaciones RF28 y panel RF30. Permite corregir la última glucosa/presión, ajustar una receta y registrar o retirar complicaciones. | No es ficha completa ni editable en todos sus campos; faltan historial de versiones y mediciones, corrección de respuestas de medicamento y mostrar la clasificación ya guardada desde el DTO. RF30 requiere que el endpoint del modelo esté configurado para publicar un resultado. |
| `/alertas` | Listado real de alertas abiertas/en revisión, paciente, fecha y severidad. Permite reconocer, resolver o descartar con motivo, y marcar urgencia. | Requiere comprobación autenticada contra Supabase; no hay filtros dedicados ni historial completo de atención. |
| `/citas` | Agenda de citas programadas para los próximos 90 días. Formulario con paciente del consultorio, fecha/hora, rutina/prioritaria, motivo, resumen y limpieza. | No guarda, edita ni cancela. Valida horario futuro en la zona del consultorio; no comprueba disponibilidad ni conflictos de agenda. |
| `/estadisticas` | Resumen del consultorio, prioridad actual y adherencia/cobertura. Vista previa, descarga CSV e impresión/guardar como PDF desde el navegador. | Reportes agregados de ventanas fijas; no hay periodos arbitrarios, archivo de reportes ni PDF generado por servidor. |

El alta permite preparar un paciente sin activar WhatsApp. Si se indica consentimiento, solicita versión del aviso, método y evidencia. Esa captura no acredita un consentimiento persistido. Los datos del formulario se pierden al abandonar la vista; no se guardan en almacenamiento del navegador.

Los reportes identifican unidad, consultorio, zona horaria y corte. Prioridad y alertas corresponden al estado actual; adherencia y glucosa en ayuno a 30 días; citas futuras a 90 días. Distinguen cero de «Sin datos» y exportan agregados, sin nombres ni identificadores de pacientes. No recalculan cohortes para periodos distintos de los que entrega el DTO.

### Sistema visual

- Se creó una marca Kuni reutilizable con el símbolo de telemedicina.
- Se cargan localmente Plus Jakarta Sans y JetBrains Mono; no se depende de Google Fonts.
- Se añadieron utilidades globales para datos monoespaciados, sombras y scrollbar.
- Se unificó la cabecera completa: marca, navegación en cápsulas, contadores, alertas, historial, médico/consultorio y salida. El activo se deriva de la ruta, incluyendo las subrutas de pacientes.
- Se eliminaron los enlaces redundantes «Volver al dashboard» y el botón separado de Indicadores; Estadísticas está en la barra.
- Se mejoraron botones, foco, estados deshabilitados, superficies, gradientes discretos y secciones numeradas de formularios.
- Hay animaciones de entrada, microinteracciones y skeletons de carga mediante las rutas de Next. Se respeta `prefers-reduced-motion`; queda pendiente la revisión visual completa en navegador.

## Archivos principales trabajados

- `src/actions/auth.ts`
- `src/actions/clinical.ts`
- `src/lib/clinical/rpc-errors.ts`
- `src/app/(auth)/login/page.tsx`
- `src/app/(protected)/layout.tsx`
- `src/app/(protected)/consultorios/page.tsx`
- `src/app/(protected)/dashboard/page.tsx`
- `src/components/dashboard/clinical-dashboard.tsx`
- `src/components/dashboard/presentation.ts`
- `src/components/kuni-mark.tsx`
- `src/components/login-form.tsx`
- `src/contracts/clinical.ts`
- `src/contracts/index.ts`
- `src/lib/auth/context.ts`
- `src/lib/auth/navigation.ts`
- `src/lib/queries/consulting-rooms.ts`
- `src/lib/queries/dashboard.ts`
- `src/lib/domain/dashboard.ts`
- `src/app/global-error.tsx` y los `error.tsx` de dashboard, censo, ficha, alta, alertas, citas y estadísticas.
- `src/app/globals.css`
- `src/components/clinical-header.tsx`
- `src/components/clinical-workspace.tsx`
- `src/components/route-error.tsx`
- `src/components/clinical-actions.tsx`
- `src/components/patient-prediction-panel.tsx`
- `src/components/clinical-skeleton.tsx`
- `src/components/patient-create-form.tsx`
- `src/components/appointment-form.tsx`
- `src/components/statistics-view.tsx`
- `src/app/(protected)/pacientes/page.tsx`
- `src/app/(protected)/pacientes/nuevo/page.tsx`
- `src/app/(protected)/pacientes/[patientId]/page.tsx`
- `src/app/(protected)/alertas/page.tsx`
- `src/app/(protected)/citas/page.tsx`
- `src/app/(protected)/estadisticas/page.tsx`
- `loading.tsx` de dashboard, pacientes, alta, ficha, alertas, citas y estadísticas.

## Decisiones que conviene conocer

- Los fixtures de la primera etapa ya no autentican usuarios ni determinan consultorios operativos.
- La protección del layout mejora la experiencia, pero no reemplaza la autorización dentro de cada Server Action.
- Los módulos de la barra ya tienen rutas. Tener una ruta o un formulario no acredita un CRUD completo.
- Las nuevas vistas reutilizan `getDashboardData()` y el DTO existente. Conservan sus límites de lectura: hasta 1,000 pacientes y ventanas acotadas; no son consultas especializadas para cada módulo.
- React Hook Form valida la preparación en cliente. Las futuras acciones deben volver a validar con Zod, obtener autoridad desde la sesión y usar resultados de error consistentes; la validación visual no sustituye esos controles.
- Las cifras proceden de la base conectada. Que los registros de demo sean ficticios depende del dataset cargado por B; el dashboard ya no mantiene su propio censo de ejemplo.
- La prioridad actual sigue siendo exclusiva de `evaluateRisk()`. RF30 es un panel adicional, no validado clínicamente, que no crea alertas ni cambia la prioridad. La interfaz muestra un estado seguro cuando el servicio no está configurado o no responde.
- El dashboard conserva el aspecto de Stitch, pero usa HTML semántico, etiquetas accesibles y componentes React en lugar del script DOM original.

## Verificación realizada

### Continuidad de frontend — estado de la última comprobación

- `npm run typecheck`, `npm run lint` y `git diff --check`: aprobados tras integrar la relectura de clase terapéutica y las señales reales del censo.
- `npm test -- --run`: 347 pruebas aprobadas en 33 archivos. Incluye el alcance de unidad, receta activa y conflicto de la actualización terapéutica, además del render de los accesos rápidos del dashboard.
- `npm run build`: build de producción completo aprobado con Next.js 16.3.4; incluye las rutas dinámicas de ficha, el límite Server/Client del panel RF30 y los accesos del dashboard a flujos clínicos reales.
- La revisión manual en navegador se dejó fuera por decisión del equipo. Estas comprobaciones no escribieron en Supabase, no enviaron WhatsApp ni demostraron la inferencia alojada.

### Evidencia histórica de la integración visual original

La siguiente lista corresponde a la integración visual original; no acredita el nuevo flujo remoto con Supabase:

- `npm run lint`: sin errores.
- `npx tsc --noEmit`: sin errores.
- `npm run build`: compilación de producción exitosa.
- Flujo probado en navegador: login, selección de consultorio y llegada al dashboard.
- Búsqueda y selección de paciente probadas; la ficha lateral se actualiza correctamente.
- Sin errores ni advertencias en consola durante las pruebas.
- Sin desbordamiento horizontal en los anchos revisados.

### Verificación de la integración de acceso

- 31 pruebas locales con mocks de Supabase/Next verifican login/logout, rechazo de membresía ausente, selección de consultorio con ámbito de unidad, cookies manipuladas, permiso `viewer`, destinos seguros y conservación de cookies SSR en redirecciones.
- ESLint de los archivos de acceso y sus pruebas: sin errores. `tsc --noEmit` global: sin errores al finalizar esta integración.
- Estas pruebas no autentican usuarios contra Supabase remoto ni sustituyen la comprobación de RLS alojado con dos unidades. La validación global del dashboard y del canal se documenta por separado.
- Hay pruebas de adaptadores y presentación para ámbito de unidad/consultorio, cohortes de tomas, riesgo sin rangos, búsqueda/orden y fechas/contextos de gráfica. El resultado conjunto está en [plan-integracion.md](plan-integracion.md).

## Acceso de unidad

Las credenciales se crean y administran en Supabase Auth; no hay un usuario o contraseña de demostración habilitados en el formulario. El usuario necesita una fila activa en `unit_memberships`, una unidad activa y un consultorio operativo con médico activo. La contraseña no se registra en tablas clínicas ni se comparte en esta documentación.

## De qué va A

A es responsable de la aplicación web y de integrar el diseño de Stitch. Su trabajo abarca las rutas de autenticación y área protegida, componentes, formularios, estados de error, consultas y DTO, login SSR, las ocho vistas funcionales y el CRUD sencillo de pacientes y citas. A debe poder avanzar primero con fixtures y después sustituirlos por Supabase sin cambiar los contratos acordados con el resto del equipo.

El resultado final de A debe permitir recorrer la operación clínica completa desde la interfaz: entrar a la unidad, elegir consultorio, consultar el censo, registrar y revisar pacientes, atender alertas, administrar citas y visualizar los indicadores acordados.

## Qué falta de A

1. Completar los flujos de las rutas ya creadas. Alta y citas tienen preparación sin guardar; ficha ya permite las acciones clínicas disponibles, clasificación terapéutica y RF30; estadísticas genera reportes agregados con ventanas fijas. La recuperación de errores ya cubre las rutas protegidas.
2. Conectar alta y edición persistentes: paciente, diagnósticos y consentimiento como evento, más objetivos, frecuencia de control, planes de monitoreo, receta y horarios. Falta el comando atómico de captura.
3. Completar ficha con edición, todos los contextos de glucosa, fechas observadas/recibidas, corrección de respuestas de medicamento e historial de versiones de receta.
4. Conectar crear, editar, cancelar y actualizar estado de citas, conservando la conversión horaria y acordando conflictos de agenda e invalidación de pendientes con el backend.
5. Probar en Supabase las acciones ya conectadas: urgencia, ajuste de dosis, resolución de alertas, corrección de mediciones, RF28 y clasificación terapéutica; completar la corrección de respuestas de medicamento cuando exista un `schedule_id` recuperable.
6. Completar la integración clínica y comprobar el acceso Supabase SSR alojado con dos unidades, roles de lectura y una cuenta sin membresía; login y selección de consultorio ya usan contexto real.
7. Añadir pruebas de integración/mocks para `correctMeasurement`, `adjustPrescription` y la actualización de clase terapéutica; el patrón de Zod, autorización y envelope ya se aplica a las acciones disponibles.
8. Completar filtro del censo por periodo. La navegación, paginación visual, diagnóstico y pendientes ya existen; para mayor volumen, acordar con B paginación de servidor sin convertir una muestra en métricas del consultorio. Acordar también consultas de reportes si se necesitan otros periodos.
9. La suite completa ya está acreditada; falta comprobar manualmente en Supabase formularios, horarios, reportes, autorización de acciones y métricas cuando se retome esa revisión. A también debe revisar el flujo crítico del bot.
10. La revisión de navegador (accesibilidad, teclado, foco, móvil, impresión, skeletons y movimiento reducido) se difirió por decisión del equipo.
11. RF30 ya está integrado con probabilidad futura, versión, suficiencia, brechas y ausencia segura. Falta desplegar/configurar el endpoint del modelo y que C conecte `therapeutic_class` al DTO/vector para eliminar las brechas de adherencia por clase; no añadir otro riesgo actual ni cambiar la frecuencia del bot.

Dependencias: B entrega esquema/tipos, transporte y configuración; C entrega las RPC y el vector predictivo. A puede construir formularios contra contratos tipados mientras esas piezas avanzan, conservando el diseño existente.

### Acuerdos de integración pendientes con B/C

- A conecta formularios y estados de carga/error/éxito; B/C entregan o acuerdan comandos atómicos para captura, consentimiento y cambios clínicos. No presentar éxito antes de recibir persistencia confirmada.
- Unidad, usuario Auth y médico atribuido deben resolverse y validarse en servidor. Aplicar `requireClinicalWriteContext()` a cada mutación y adaptar la interfaz para cuentas de solo lectura.
- Mantener los valores SQL de sexo, diagnósticos, estados y contextos. La captura actual de consentimiento debe transformarse en un evento con evidencia, no en una actualización de un booleano.
- Cambios de cita, plan o receta deben invalidar/regenerar pendientes sin modificar mensajes entregados. El front no debe implementar una cola alternativa.
- La ficha ampliada necesita consultas de mediciones y recetas históricas; el DTO de dashboard actual no entrega toda esa historia. Los estados del canal deben venir del worker/webhooks de B/C.
- RF28 ya está aplicada y conectada en la ficha. RF30 ya tiene panel seguro; requiere el servicio real de C/IA para mostrar inferencia. C debe incorporar la clase terapéutica que A ya captura al DTO/vector antes de considerar completas las variables de adherencia. Estos pendientes no bloquean cerrar el circuito principal del plan de integración.
