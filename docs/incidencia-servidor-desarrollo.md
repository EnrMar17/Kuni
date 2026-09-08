# Incidencia local de compilación — 2026-09-08

El navegador en `localhost:3000` mostró `Module not found` para `./pagination`, importado por `src/lib/jobs/materialize.ts`. Al revisar la instancia activa, también respondió HTTP 500 por `./effective-time`.

Ambos archivos existían y eran legibles desde Windows y desde el mismo repositorio montado en WSL. El proceso activo era `next dev` en `/mnt/d/Proyectos/Kuni/Kuni`. La evidencia es compatible con un estado desactualizado del servidor de desarrollo; no se determinó el mecanismo exacto de invalidación que falló.

Se detuvo únicamente ese proceso de Next y se inició `npm run dev -- --port 3000` desde Windows, usando el lanzador actual del proyecto. No fue necesario modificar lógica, diseño ni los módulos importados, ni borrar la caché.

Verificación posterior en el puerto afectado:

- `/login`: HTTP 200.
- `/dashboard` y `/dashboards`: HTTP 307 sin sesión; esto comprueba la redirección de acceso, no el contenido autenticado.
- `GET /api/jobs/tick`: HTTP 405 esperado para una ruta que recibe POST; su compilación ya no devuelve el error de módulo. No se ejecutó el job ni se enviaron mensajes.

Las comprobaciones anteriores de producción en el puerto 3100 no cubrían esta instancia de desarrollo en el puerto 3000. Se incorpora esa comprobación explícita al cierre de la incidencia. El servidor de desarrollo queda iniciado en el puerto 3000.
