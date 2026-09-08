# Documentación A

## Resumen del avance

En esta etapa se inició el trabajo asignado al integrante A: construir la aplicación clínica, integrar el diseño proporcionado y permitir que el equipo avance con fixtures mientras la base de datos y las automatizaciones se desarrollan en paralelo.

El flujo funcional disponible es:

```text
/login → /consultorios → /dashboard
```

No se modificaron el esquema SQL, el cron ni la integración de WhatsApp. Esta entrega se concentra en interfaz, navegación, estado de sesión de demostración y contratos de lectura.

## Lo que se hizo de A

### Base técnica y contratos

- Se estableció la estructura de rutas públicas y protegidas con Next.js App Router.
- Se mantuvieron las páginas como Server Components y se aisló la interacción del dashboard en un Client Component.
- Se crearon contratos Zod y tipos clínicos compartidos.
- Se añadieron fixtures tipados para unidad, consultorios, médicos y pacientes.
- Se implementó una sesión provisional mediante cookies HTTP-only para poder trabajar sin esperar la conexión con Supabase.
- Las Server Actions validan las entradas y vuelven a comprobar sesión y pertenencia a la unidad.

### Inicio de sesión

- Se implementó el acceso con credenciales de demostración y estados de validación, error y carga.
- Se rediseñó la pantalla con el mismo lenguaje visual del dashboard: fondo gris azulado, azul marino, acentos índigo, tarjetas redondeadas y tipografía Plus Jakarta Sans.
- En escritorio aparece un panel institucional con el propósito de Kuni y métricas de muestra; en pantallas pequeñas se presenta una versión compacta.
- Un usuario con sesión activa es redirigido a la selección de consultorio.

### Selección de consultorio

- Se implementó la vista de consultorios asociados a la unidad.
- Cada tarjeta muestra médico, cédula profesional, cantidad de pacientes y alertas abiertas.
- La selección se guarda en una cookie HTTP-only y redirige al dashboard.
- Se valida que el identificador tenga formato UUID y que el consultorio pertenezca a la unidad autenticada.
- Se incluyeron mensajes de error y una acción para cerrar sesión.

### Dashboard / landing clínica

- Se trasladó el diseño de `landingstitch.html` a React y Tailwind CSS 4.
- Se reprodujeron el lienzo flotante, navegación en cápsulas, métricas, triaje, esquemas farmacológicos, próximas citas y ficha clínica lateral.
- La búsqueda filtra la lista de pacientes por nombre, contexto o diagnóstico.
- Seleccionar un paciente actualiza su nombre, lecturas, clasificación, resumen y horario en la ficha lateral.
- El consultorio y el médico mostrados provienen de la selección previa.
- Se conservaron avisos visibles de que el contenido es ficticio.

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
- `src/components/kuni-mark.tsx`
- `src/components/login-form.tsx`
- `src/contracts/clinical.ts`
- `src/contracts/index.ts`
- `src/lib/auth/fixture-session.ts`
- `src/lib/queries/fixtures.ts`
- `src/app/globals.css`

## Decisiones que conviene conocer

- Los fixtures son temporales, pero respetan los tipos que deberá consumir la integración con Supabase.
- La protección del layout mejora la experiencia, pero no reemplaza la autorización dentro de cada Server Action.
- Los botones de módulos todavía no navegan a vistas inexistentes; se conectarán conforme se implementen.
- Las cifras y casos de la landing son demostrativos y no representan umbrales clínicos universales ni pacientes reales.
- El dashboard conserva el aspecto de Stitch, pero usa HTML semántico, etiquetas accesibles y componentes React en lugar del script DOM original.

## Verificación realizada

- `npm run lint`: sin errores.
- `npx tsc --noEmit`: sin errores.
- `npm run build`: compilación de producción exitosa.
- Flujo probado en navegador: login, selección de consultorio y llegada al dashboard.
- Búsqueda y selección de paciente probadas; la ficha lateral se actualiza correctamente.
- Sin errores ni advertencias en consola durante las pruebas.
- Sin desbordamiento horizontal en los anchos revisados.

## Credenciales de demostración

- Usuario: `demo@kuni.mx`
- Contraseña: `KuniDemo2026`

Estas credenciales y la sesión por fixtures deben eliminarse al completar la integración con Supabase.

## De qué va A

A es responsable de la aplicación web y de integrar el diseño de Stitch. Su trabajo abarca las rutas de autenticación y área protegida, componentes, formularios, estados de error, consultas y DTO, login SSR, las ocho vistas funcionales y el CRUD sencillo de pacientes y citas. A debe poder avanzar primero con fixtures y después sustituirlos por Supabase sin cambiar los contratos acordados con el resto del equipo.

El resultado final de A debe permitir recorrer la operación clínica completa desde la interfaz: entrar a la unidad, elegir consultorio, consultar el censo, registrar y revisar pacientes, atender alertas, administrar citas y visualizar los indicadores acordados.

## Qué falta de A

1. Implementar y conectar las vistas restantes: censo de pacientes, triaje crítico, citas, bot de WhatsApp y estadísticas.
2. Crear el alta de paciente con datos personales, diagnósticos, consentimiento, objetivos y frecuencia de control.
3. Crear la ficha de paciente con edición, historial de mediciones, recetas y alertas.
4. Implementar el CRUD sencillo de citas y la invalidación de pendientes acordada con el backend.
5. Conectar los botones del dashboard a rutas y acciones reales.
6. Sustituir sesión, fixtures y lecturas por Supabase SSR con RLS y contexto de unidad/consultorio.
7. Implementar Server Actions clínicas con Zod, autorización y resultados de error consistentes.
8. Añadir paginación, filtros y estados vacíos/carga/error en las listas.
9. Completar pruebas de formularios, autorización de acciones y métricas; A también debe revisar el flujo crítico del bot.
10. Revisar accesibilidad y adaptación móvil de todas las vistas cuando el conjunto esté completo.
