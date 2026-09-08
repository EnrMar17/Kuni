# U13: ensayo funcional y accesibilidad

Fecha: 8 septiembre 2026. **Entrega de frontend/UI; no cierra el circuito clínico alojado ni sustituye U09/U10.**

## Alcance

Revisión y corrección de pantallas ya existentes (login, selección de consultorio, dashboard, censo, alta/edición de paciente, ficha, alertas, citas con borrador, estadísticas/CSV/impresión, estados de carga y errores de ruta). Trabajo limitado a estructura, estilos y accesibilidad: sin features nuevas, sin cambios de textos clínicos (umbrales, reglas de riesgo, copys de WhatsApp) y sin tocar `src/actions/`, `src/lib/`, `src/contracts/`, migraciones, `domain-core/` ni SQL.

## Qué se revisó

| Área | Pantallas / piezas |
|---|---|
| Accesibilidad | Roles/`aria`, foco visible, orden de tabulación, errores asociados a campos, contraste de chips/etiquetas |
| Teclado | Botones y paneles expandibles (alertas, retiro de complicaciones); Escape para cerrar; sin trampas de foco (no hay diálogos modales con trap) |
| Responsive | Viewports angostos: búsqueda del dashboard, filtros del censo, tablas con scroll, acciones de formulario, navegación |
| Carga | Skeletons existentes; skeleton de estadísticas alineado; `aria-busy` / `role="status"` |
| Motion | Animaciones condicionadas a `prefers-reduced-motion: no-preference`; shimmer y pulse respetan reduce |
| CSV / impresión | Vista de estadísticas: scroll de tabla, `aria-live` en vista previa, estilos `@media print` reforzados |
| Formularios | Login, alta/edición de paciente, borrador de cita, paneles de ficha/alertas |

## Qué se corrigió

### Estilos globales (`src/app/globals.css`)

- Enlace «Saltar al contenido principal» y foco visible genérico en controles.
- Animaciones de página, login y skeleton solo con motion permitida; reduce desactiva shimmer.
- Contenedores con `overflow-x: clip`; utilidad `.table-scroll` para tablas en móvil.
- Impresión de reportes: tipografía legible, sin chrome clínico, saltos de fila controlados.
- Form actions a ancho completo en <640px; hover con desplazamiento solo si hay hover y motion.

### Navegación y shells

- Skip link en `src/app/layout.tsx`; `id="contenido-principal"` en mains de login, dashboard, consultorios, workspace y skeleton.
- Header: badges con `aria-label` agregados, pulso `motion-safe`, acceso a consultorio también en móvil (iniciales + label).
- Contraste: textos/chips que usaban tonos demasiado claros subidos a variantes `*-700`/`*-800` donde aplicaba sin cambiar el significado clínico.

### Formularios

- **Login:** `aria-invalid` / `aria-describedby` hacia el error; ids estables; botón con `aria-busy`.
- **Alta/edición:** error de guardado enfocable (`tabIndex={-1}`), anuncio live al guardar, diagnósticos con error a nivel de `fieldset`, foco al primer campo inválido tras fallo de Zod, botón deshabilitado al enviar.
- **Citas (borrador):** `aria-invalid` omitido cuando no hay error.
- **Acciones clínicas:** paneles con `aria-expanded` / `aria-controls` / región etiquetada; Escape cierra; hints de motivo con `aria-describedby`; mensajes de éxito/error discriminados; etiquetas con `htmlFor`.

### Listados y reportes

- Censo: filtros con labels verticales usables en 375px; tabla en región desplazable por teclado; caption y paginación anunciada.
- Dashboard: búsqueda sin `min-width` fijo en móvil; filtros/orden con `aria-label`; ficha con `aria-live="polite"`.
- Estadísticas: vista previa con live region, scroll de tabla, botones CSV/imprimir intactos; loading dedicado `view="statistics"`.

### Carga y errores

- Skeleton admite `statistics` y ancla de skip.
- `RouteError` usa botones clínicos consistentes y wrap en pantallas estrechas.

## Límites deliberados

- **No se añadieron flujos de citas persistentes ni receta inicial** (U09 / resto de U08).
- El formulario de citas sigue siendo borrador «sin guardar»; solo se endureció a11y.
- No hay ensayo autenticado E2E contra Supabase en esta entrega: la verificación es typecheck, lint, build y revisión de markup/CSS. Queda el ensayo con dos unidades/roles en navegador real (parte del criterio de cierre de U13 en el backlog).
- No se auditó contraste con herramienta automática sobre cada token de Tailwind; se corrigieron casos evidentes en chips y errores.
- No se introdujo un focus trap de modal: los paneles de alerta/complicación son regiones expandibles, no `role="dialog"`.
- Cambios ajenos observados en el working tree (`domain-core/tests/...`, `supabase/migrations/0009_...`) **no forman parte de esta entrega** y no deben mezclarse en el PR de U13.

## Archivos tocados (esta entrega)

- `src/app/globals.css`, `src/app/layout.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/app/(protected)/dashboard/page.tsx`, `consultorios/page.tsx`, `estadisticas/loading.tsx`
- `src/components/login-form.tsx`, `patient-create-form.tsx`, `appointment-form.tsx`
- `src/components/clinical-actions.tsx`, `clinical-header.tsx`, `clinical-workspace.tsx`, `clinical-skeleton.tsx`
- `src/components/dashboard/clinical-dashboard.tsx`, `statistics-view.tsx`, `route-error.tsx`, `kuni-mark.tsx`
- Este documento: `docs/u13-ux-accesibilidad.md`

## Verificación local

Ejecutado en Windows nativo sobre la rama `feature/u13-accesibilidad`:

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | Aprobado |
| `npm run lint` | Sin errores |
| `npm run build` | Aprobado (Next.js 16.3.4) |
| `npm run verify` | Aprobado: 432 pruebas raíz, 346 de dominio/SQL, ambos typechecks, lint y build |

Prueba manual recomendada (no automatizada aquí):

1. Viewport 375px y 1440px: login → consultorios → dashboard → censo → alta → ficha → alertas → citas → estadísticas.
2. Solo teclado: Tab/Shift+Tab, Enter/Espacio en botones, Escape en «Atender alerta» y retiro de complicación, scroll de tabla del censo con foco en la región.
3. Activar «reducir movimiento» del SO y confirmar ausencia de shimmer/pulse/desplazamientos.
4. En estadísticas: generar vista previa, Descargar CSV e Imprimir / PDF.

## Pendiente para cerrar U13 en el backlog

El backlog unificado pide además ensayo con dos unidades/roles y flujo completo autenticado. Eso depende de datos y backend (U08/U09/U06 alojados) y queda fuera de este PR de UI. Quien actualice `docs/continuidad-unificada.md` puede marcar U13 como avanzado en frontend y dejar explícito el ensayo alojado pendiente.
