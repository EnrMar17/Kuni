# Documentación A

## Resumen del avance

En la primera etapa se inició el trabajo asignado al integrante A con fixtures para integrar el diseño mientras avanzaban la base de datos y las automatizaciones. La integración actual sustituye el acceso de demostración por Supabase Auth SSR y la selección real de consultorios de la unidad autorizada.

El flujo funcional disponible es:

```text
/login → /consultorios → /dashboard
```

No se modificaron el esquema SQL, el cron ni la integración de WhatsApp desde el flujo de autenticación. La integración de acceso conserva las clases, estilos y distribución existentes.

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
- El panel institucional conserva su estructura; sus tarjetas presentan información funcional en lugar de cifras de muestra.
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
- Seleccionar un paciente cambia mediciones, diagnósticos, motivos de riesgo, recetas, adherencia e hitos del bot del mismo expediente. Las secciones de censo, citas, indicadores e historial se alcanzan con los controles existentes.
- El consultorio y el médico provienen del contexto autorizado. Se puede cambiar de consultorio y actualizar las lecturas del dashboard.
- Se retiraron probabilidades ficticias, porcentajes de abandono, stock de insumos, confirmación automática de citas y conversaciones/síntomas inventados.
- La prioridad actual procede de `evaluateRisk()`; la adherencia y cobertura proceden de `computeAdherence()` con cohortes de tomas. Se muestran desconocidos y valores «Sin datos».
- La gráfica utiliza fechas y valores observados, con ventanas de 7/14/30/90 días, glucosa en ayuno y presión sistólica/diastólica. No se inventan curvas ni bandas objetivo. Otros contextos de glucosa permanecen en el DTO para la ficha completa pendiente.
- Las próximas citas son las registradas para el consultorio dentro de 90 días; no se afirma que el bot las haya confirmado.
- «Abrir WhatsApp» abre contacto manual con el paciente que tiene consentimiento vigente; no envía mensajes ni sustituye el bot automatizado. Alta, urgencia y ajuste de dosis están deshabilitados hasta implementar sus flujos transaccionales.

### Sistema visual

- Se creó una marca Kuni reutilizable con el símbolo de telemedicina.
- Se cargan localmente Plus Jakarta Sans y JetBrains Mono; no se depende de Google Fonts.
- Se añadieron utilidades globales para datos monoespaciados, sombras y scrollbar.
- Login, selección de consultorio y dashboard comparten paleta, radios, sombras, jerarquía tipográfica y comportamiento adaptable.

## Archivos principales trabajados

- `src/actions/auth.ts`
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
- `src/app/(protected)/dashboard/error.tsx`
- `src/app/globals.css`

## Decisiones que conviene conocer

- Los fixtures de la primera etapa ya no autentican usuarios ni determinan consultorios operativos.
- La protección del layout mejora la experiencia, pero no reemplaza la autorización dentro de cada Server Action.
- Los botones de módulos todavía no navegan a vistas inexistentes; se conectarán conforme se implementen.
- Las cifras proceden de la base conectada. Que los registros de demo sean ficticios depende del dataset cargado por B; el dashboard ya no mantiene su propio censo de ejemplo.
- Solo existe riesgo actual por reglas; la salida predictiva futura requiere la ampliación de [plan-integracion.md](plan-integracion.md). No hay inferencia ML conectada a esta interfaz.
- El dashboard conserva el aspecto de Stitch, pero usa HTML semántico, etiquetas accesibles y componentes React en lugar del script DOM original.

## Verificación realizada

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

1. Implementar las rutas completas de alta, ficha, alertas, citas y estadísticas. Hoy existe consulta de datos en el dashboard; los enlaces internos a sus secciones no equivalen a esas vistas terminadas.
2. Crear el alta/edición con datos personales, diagnósticos, consentimiento como evento, objetivos y frecuencia de control; añadir complicaciones y fases médicas (RF28) cuando B entregue la migración.
3. Completar ficha con edición, todos los contextos de glucosa, fechas observadas/recibidas, correcciones, historial de versiones de receta y acciones de alerta.
4. Implementar el CRUD sencillo de citas y la invalidación de pendientes acordada con el backend.
5. Habilitar alta, urgencia, ajuste de dosis y resolución de alertas solo al conectarlos con acciones/RPC de C, motivo, autorización, concurrencia y auditoría.
6. Completar la integración clínica y comprobar el acceso Supabase SSR alojado con dos unidades, roles de lectura y una cuenta sin membresía; login y selección de consultorio ya usan contexto real.
7. Implementar Server Actions clínicas con Zod, autorización y resultados de error consistentes.
8. Completar navegación/paginación del censo y filtros avanzados de diagnóstico, pendientes y periodos. Ya existen búsqueda y filtro/orden de prioridad dentro del dashboard.
9. Completar pruebas de formularios clínicos, autorización de sus acciones y métricas; las pruebas locales de acceso ya existen. A también debe revisar el flujo crítico del bot.
10. Revisar accesibilidad y adaptación móvil de todas las vistas cuando el conjunto esté completo.
11. Mostrar RF30 únicamente después del contrato real de IA: probabilidad futura, versión y suficiencia por variable, con ausencia segura; no añadir otro riesgo actual ni cambiar la frecuencia del bot.

Dependencias: B entrega esquema/tipos, transporte y configuración; C entrega las RPC y el vector predictivo. A puede construir formularios contra contratos tipados mientras esas piezas avanzan, conservando el diseño existente.
