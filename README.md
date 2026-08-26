# Bajo Palos — herramienta web para entrenadores de arqueros de futsal

Registrás lo que ves durante el partido (tiros, atajadas, goles, salidas,
caídas, etc.) con pocos toques desde el teléfono, y después analizás
estadísticas acumuladas, por zona del arco, y la evolución entre partidos.

## Cómo funciona el almacenamiento (importante)

Esta versión **no tiene backend ni cuentas**. Cada dispositivo que abre la
URL guarda sus propios datos en el navegador (con IndexedDB). Eso significa:

- Vos y otro entrenador pueden usar la MISMA url, cada uno con sus propios
  arqueros y partidos, sin verse los datos entre sí.
- Los datos NO se sincronizan solos entre tu teléfono y tu computadora — son
  independientes por dispositivo/navegador.
- Para pasar datos de un dispositivo a otro (o tener un backup), usá
  **Configuración → Exportar todo (.json)** y después **Importar backup**
  en el otro dispositivo.
- Si borrás los datos del navegador (o el historial/caché) sin haber
  exportado antes, esa información se pierde. Exportá seguido.

## Probarlo ahora mismo en tu computadora

```bash
npm install
npm run dev
```

Te abre algo como `http://localhost:5173`. Entrá, creá un arquero, un
partido, y empezá a tocar los chips para registrar acciones.

## Publicarlo en una URL real (para probarlo desde el teléfono)

Como no depende de ninguna base de datos externa, publicarlo es mucho más
simple que antes: no hay claves que configurar.

**Con la terminal (más rápido si ya tenés Node.js instalado):**

```bash
npx vercel login
npx vercel --prod
```

Al terminar te tira una URL pública. Listo — abrila desde tu teléfono y ya
podés registrar en vivo.

## Qué probar primero (según lo que describiste como objetivo)

1. Abrí la URL desde tu teléfono.
2. En "Registrar", creá el arquero (ej. Nicolás).
3. Creá un partido nuevo (fecha + rival).
4. Registrá acciones tocando: **tipo de acción → lado/zona** (2 toques,
   se guarda solo, sin botón de "enviar").
5. Mirá que el mini-resumen del partido se actualice solo.
6. Cerrá la pestaña, volvé a abrir la URL: los datos tienen que seguir ahí.
7. Andá a "Panel" y mirá las estadísticas acumuladas, el mapa del arco, y
   las observaciones automáticas (aparecen solo con muestra mínima de 3).
8. Creá un segundo partido y verificá que las estadísticas acumuladas del
   arquero sumen los dos partidos, y que aparezca la comparación de
   "primeros partidos vs últimos partidos".
9. Andá a "Configuración" y probá renombrar un tipo de acción — el
   historial ya cargado no debería romperse (los datos viejos se guardan
   por ID interno, no por el nombre).
10. Probá "Exportar todo" y guardate el archivo — es tu backup.

## Estructura del proyecto (capas)

- `src/db.js` — capa de datos: esquema de IndexedDB (Dexie), semillas por
  defecto y funciones para crear/editar/desactivar arqueros, rivales,
  partidos, acciones, categorías y zonas.
- `src/stats.js` — capa de estadísticas: funciones puras (sin React, sin
  base de datos) que calculan resúmenes, porcentajes, observaciones
  automáticas con umbral de muestra, y comparación de períodos.
- `src/exportImport.js` — exportar/importar todo el espacio de trabajo en
  un JSON versionado.
- `src/App.jsx` — interfaz: pestañas Registrar / Panel / Configuración.

## Qué queda pendiente (a propósito, para no sobre-construir ahora)

- Video: se puede asociar un link al partido completo, pero todavía no hay
  forma de asociar un clip puntual a UNA acción específica — es la próxima
  mejora natural si te sirve.
- Historial de partidos: hoy se navega por el desplegable "Partido" del
  Panel; una vista de lista/calendario más visual queda para después.
- Nube / sincronización / IA: deliberadamente afuera de esta etapa, como
  pediste.
