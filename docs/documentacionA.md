# Documentación A

## Continuidad de interfaz — 8 septiembre 2026

- Se añadieron fronteras de error recuperables a censo, ficha, alta, alertas, citas y estadísticas, más un `global-error.tsx`. Todas usan el mismo fallback accesible y no exponen detalles internos al navegador.
- El censo ahora combina búsqueda y prioridad con filtros por diagnóstico y por pacientes con interacciones pendientes. La paginación sigue siendo de presentación sobre la respuesta ya acotada del servidor.
- Se preparó `resolveAlert` como primera Server Action clínica: vuelve a validar con Zod, exige contexto de escritura, conserva el token textual de concurrencia y traduce `PT401/PT403/PT409/PT422` al envelope `{ data, error }`. Sigue sin habilitar UI ni llamar una base remota mientras `0003` no esté aplicada y los tipos no se regeneren.
- Se formatearon los componentes clínicos que tenían líneas kilométricas, con Prettier, para que los diffs vuelvan a ser revisables.
- El árbol de dependencias se reinstaló desde Windows y se añadió el binding opcional de Rolldown para Windows. Vitest vuelve a arrancar; las pruebas unitarias de filtros y del adaptador de alerta pasan.
- Estadísticas vive en `/estadisticas`, accesible desde la cabecera compartida. Genera reportes agregados de resumen, prioridad y adherencia con vista previa, CSV e impresión/PDF local. Los reportes identifican corte, unidad, consultorio y ventanas de lectura; no exportan nombres ni identificadores de pacientes.
- Programar cita usa React Hook Form y valida paciente del censo, motivo y horario futuro en la zona del consultorio. Ofrece resumen y limpieza de campos; permanece sin guardar hasta conectar la operación transaccional e invalidación de recordatorios.
- Se retiraron los enlaces redundantes «Volver al dashboard» y el botón separado de Indicadores.

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
- «Abrir WhatsApp» abre contacto manual con el paciente que tiene consentimiento vigente; no envía mensajes ni sustituye el bot automatizado. «Nuevo paciente» abre el formulario de preparación; guardar, urgencia y ajuste de dosis siguen pendientes de sus flujos transaccionales.

### Vistas clínicas y reportes

| Ruta | Disponible | Límite actual |
|---|---|---|
| `/pacientes` | Censo real, búsqueda por nombre/expediente/CURP/diagnóstico, filtro de prioridad, diagnóstico y pacientes con interacciones pendientes; enlaces a ficha y páginas de 12 pacientes. | Paginación de presentación sobre el censo cargado, no paginación de servidor. Falta filtro por periodo y consultas especializadas para mayor volumen. |
| `/pacientes/nuevo` | React Hook Form, errores por campo, identificación, contacto, grupo sanguíneo, códigos de diagnóstico, valoración inicial y datos de consentimiento. | Solo revisión en memoria. No crea paciente ni evento de consentimiento; faltan objetivos, monitoreo, receta y horarios. |
| `/pacientes/[patientId]` | Resumen, diagnósticos, prioridad y motivos, últimas mediciones, contacto, estado del consentimiento y tratamiento vigente. Solo encuentra pacientes dentro del censo autorizado. | No es ficha completa ni editable; faltan historial detallado, versiones y acciones clínicas. |
| `/alertas` | Listado real de alertas abiertas/en revisión, paciente, fecha y severidad. | Atención y resolución siguen deshabilitadas hasta aplicar las RPC y regenerar tipos; `resolveAlert` ya está preparado y probado contra mocks. |
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
- Solo existe riesgo actual por reglas; la salida predictiva futura requiere la ampliación de [plan-integracion.md](plan-integracion.md). No hay inferencia ML conectada a esta interfaz.
- El dashboard conserva el aspecto de Stitch, pero usa HTML semántico, etiquetas accesibles y componentes React en lugar del script DOM original.

## Verificación realizada

### Continuidad de frontend — estado de la última comprobación

- `npm run typecheck`, `npm run lint` y `git diff --check`: aprobados al cerrar los cambios de interfaz, citas y estadísticas.
- Tras reinstalar dependencias desde Windows y añadir el binding de Rolldown correspondiente, Vitest volvió a arrancar. `tests/unit/dashboard-presentation.test.ts` y `tests/unit/clinical-action.test.ts`: 8 pruebas aprobadas.
- Se ajustó la prueba existente de render para el pathname de la cabecera compartida y el enlace de alta.
- Antes de esta continuidad, `npm test` no arrancaba por el binding nativo faltante de Rolldown/Vitest. El problema de inicio está resuelto; falta volver a ejecutar y acreditar la suite completa después de estos cambios.
- El intento de comprobación adicional de reportes mediante `tsx` tampoco arrancó: el entorno devolvió `uv_os_get_passwd / ENOMEM`. Los cálculos y exportaciones nuevos requieren prueba ejecutada.
- El último build intentado compiló y pasó TypeScript, pero se detuvo al recolectar páginas por ausencia de variables obligatorias de Supabase. No acredita un build completo de esta versión.
- No se hizo una nueva revisión visual en navegador de las vistas, formularios, skeletons, navegación responsive o impresión. Tampoco se ejecutaron escrituras remotas, envío de WhatsApp ni validación alojada de RLS.

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

1. Completar los flujos de las rutas ya creadas. Alta y citas tienen preparación sin guardar; ficha y alertas son de consulta; estadísticas genera reportes agregados con ventanas fijas. La recuperación de errores ya cubre las rutas protegidas.
2. Conectar alta y edición persistentes: paciente, diagnósticos y consentimiento como evento, más objetivos, frecuencia de control, planes de monitoreo, receta y horarios. Añadir complicaciones y fases médicas (RF28) cuando B entregue la migración.
3. Completar ficha con edición, todos los contextos de glucosa, fechas observadas/recibidas, correcciones, historial de versiones de receta y acciones de alerta.
4. Conectar crear, editar, cancelar y actualizar estado de citas, conservando la conversión horaria y acordando conflictos de agenda e invalidación de pendientes con el backend.
5. Habilitar alta, urgencia, ajuste de dosis y resolución de alertas solo al conectarlos con acciones/RPC de C, motivo, autorización, concurrencia y auditoría.
6. Completar la integración clínica y comprobar el acceso Supabase SSR alojado con dos unidades, roles de lectura y una cuenta sin membresía; login y selección de consultorio ya usan contexto real.
7. Integrar `resolveAlert` con la RPC aplicada y tipos regenerados; después repetir el patrón de Zod, autorización y envelope para los demás comandos clínicos.
8. Completar filtro del censo por periodo. La navegación, paginación visual, diagnóstico y pendientes ya existen; para mayor volumen, acordar con B paginación de servidor sin convertir una muestra en métricas del consultorio. Acordar también consultas de reportes si se necesitan otros periodos.
9. Ejecutar y acreditar la suite completa ya recuperada; verificar formularios, horarios, reportes, autorización de acciones y métricas. Probar CSV e impresión/PDF. A también debe revisar el flujo crítico del bot.
10. Revisar en navegador accesibilidad, teclado, foco, errores por campo, adaptación móvil, barra con Estadísticas, cambios de página, skeletons y movimiento reducido. La implementación visual está hecha; su comprobación integral sigue pendiente.
11. Mostrar RF30 únicamente después del contrato real de IA: probabilidad futura, versión y suficiencia por variable, con ausencia segura; no añadir otro riesgo actual ni cambiar la frecuencia del bot.

Dependencias: B entrega esquema/tipos, transporte y configuración; C entrega las RPC y el vector predictivo. A puede construir formularios contra contratos tipados mientras esas piezas avanzan, conservando el diseño existente.

### Acuerdos de integración pendientes con B/C

- A conecta formularios y estados de carga/error/éxito; B/C entregan o acuerdan comandos atómicos para captura, consentimiento y cambios clínicos. No presentar éxito antes de recibir persistencia confirmada.
- Unidad, usuario Auth y médico atribuido deben resolverse y validarse en servidor. Aplicar `requireClinicalWriteContext()` a cada mutación y adaptar la interfaz para cuentas de solo lectura.
- Mantener los valores SQL de sexo, diagnósticos, estados y contextos. La captura actual de consentimiento debe transformarse en un evento con evidencia, no en una actualización de un booleano.
- Cambios de cita, plan o receta deben invalidar/regenerar pendientes sin modificar mensajes entregados. El front no debe implementar una cola alternativa.
- La ficha ampliada necesita consultas de mediciones y recetas históricas; el DTO de dashboard actual no entrega toda esa historia. Los estados del canal deben venir del worker/webhooks de B/C.
- RF28 necesita migración incremental y tipos de B; RF29/RF30 necesitan contrato y servicio real de C/IA. Estos pendientes no bloquean cerrar el circuito principal del plan de integración.
