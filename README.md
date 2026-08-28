# Bajo Palos — herramienta web para entrenadores de arqueros de futsal

Registrás lo que ves durante el partido o entrenamiento con UN toque por
acción (el botón ya trae la zona incorporada: "Atajada abajo derecha" es un
solo botón), y después analizás el perfil histórico de cada arquero,
organizado por semana, con mapa del arco, observaciones automáticas y
comparación entre arqueros.

## Cómo funciona el almacenamiento

Sigue sin backend ni cuentas. Cada dispositivo guarda sus propios datos en
el navegador (IndexedDB). Varios entrenadores pueden usar la misma URL sin
ver los datos entre sí. Para pasar información entre dispositivos o tener
un backup, usá **Configuración → Exportar todo (.json)** / **Importar**.

## Probarlo local

```bash
npm install
npm run dev
```

## Publicarlo (sin claves, sin backend)

```bash
npx vercel login
npx vercel --prod
```

## Qué probar (el flujo real)

1. Andá a **Configuración** y creá dos arqueros (ej. Santiago y Nicolás).
2. Arriba de todo, siempre visibles, vas a ver sus nombres como pestañas
   grandes — tocá **Santiago** para que quede activo.
3. En **Registrar**, elegí **Partido** o **Entrenamiento**, cargá fecha (y
   rival si es partido), **Empezar**.
4. Tocá los botones grandes: **Atajada abajo derecha**, **Gol de caño**,
   **Saque al pívot**, **Cruz derecha** — cada toque guarda solo, sin
   confirmar nada. El mini-resumen de arriba se actualiza en el momento.
5. Si te equivocás: **↩ Deshacer última acción** (arriba de la botonera) o
   tocá la ✕ al lado de cualquier acción en "Últimas acciones cargadas".
6. **Finalizar sesión** cuando termina el partido/entrenamiento.
7. Cambiá a **Nicolás** (pestaña de arriba) y repetí con un entrenamiento —
   verificá que no aparece nada de Santiago.
8. Andá a **Perfil**, con Santiago seleccionado: vas a ver sus estadísticas
   históricas, el mapa del arco, observaciones automáticas, y el historial
   organizado por semana — abrí la semana y después el partido puntual para
   ver el detalle de esa sesión.
9. Andá a **Comparar**, elegí a Santiago y Nicolás, y mirá el rombo de
   atributos — los ejes sin muestra suficiente se marcan como **N/D**, nunca
   se inventa un número.
10. En **Configuración → Backup**, probá "Exportar todo" y guardá el
    archivo — es tu respaldo.

## Estructura (capas)

- `src/db.js` — IndexedDB (Dexie): jugador → semana (auto-calculada por
  fecha) → sesión (partido/entrenamiento) → acciones. La botonera
  (`categoriasAccion`) ya trae la zona incorporada para que cargar sea un
  solo toque; igual queda una referencia de zona propia para poder cruzar
  estadísticas entre categorías (ej. goles vs atajadas en la misma celda).
- `src/stats.js` — funciones puras: resumen, observaciones con umbral de
  muestra (mínimo 3 para opinar, 5 para "patrón"), atributos derivados para
  el comparador (null = N/D si falta muestra).
- `src/exportImport.js` — backup completo versionado.
- `src/App.jsx` — interfaz: pestañas de jugador siempre visibles arriba,
  Registrar / Perfil / Comparar / Configuración.

## Decisiones que tomé sin preguntar (para no frenar el desarrollo)

- La **semana** se calcula sola a partir de la fecha de la sesión (lunes a
  domingo) — no hay que elegirla a mano al finalizar.
- Los **atributos del comparador** (Atajadas, Caídas, Cruces, Salidas,
  Saques, Volumen) son una primera versión razonable a partir de lo que se
  puede medir hoy; son fáciles de ajustar una vez que los uses en cancha y
  veas qué números realmente sirven.
- El **rombo de comparación** es una implementación propia (SVG hecho a
  medida), no una copia de ningún videojuego — solo tomé el concepto de
  "atributos en varios ejes".

## Qué queda pendiente

- Gráfico de evolución semana a semana con líneas (hoy la comparación es
  tabla + rombo, no un gráfico de tendencia histórico).
- Video/nota asociado a una acción puntual (hoy el video es por sesión).
- Vista de escritorio con panel lateral de carpetas (hoy funciona bien en
  ambos tamaños pero no hay un layout específico distinto para desktop).

## Rediseño: modo Captura vs modo Análisis (última actualización)

Bajo Palos ahora separa claramente dos experiencias:

- **⚡ Captura** (pestaña propia, resaltada en verde): pantalla de tablero
  táctil. Header grande con el nombre del jugador y "● CAPTURA ACTIVA",
  botones grandes agrupados por bloque (Atajadas/Goles se muestran como una
  grilla con forma de arco; Saques usa contadores −/+ en vez de un botón
  por tipo), y una barra inferior siempre visible con las últimas acciones
  y "↩ Deshacer".
- **Perfil / Comparar / Configuración**: modo análisis, sin cambios de
  fondo respecto de antes — ahí sigue viviendo la administración de la
  botonera (agregar/renombrar/desactivar categorías y zonas).

La botonera de Configuración sigue siendo la fuente de verdad: lo que
activás/desactivás ahí es exactamente lo que aparece en Captura.
