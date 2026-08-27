import Dexie from "dexie";

// ---------- Capa 3+4: Modelo de datos + almacenamiento local (IndexedDB) ----------
//
// Jerarquía: Jugador -> Semana -> Sesión (partido | entrenamiento) -> Acciones.
// Las acciones son la fuente de verdad; las estadísticas siempre se derivan de
// ellas, nunca se guardan totales sueltos.
//
// Cada acción registrable (categoriaAccion) puede traer la zona ya incorporada
// (ej. "Atajada abajo derecha") para que registrar sea UN solo toque. La zona
// se guarda igual como referencia propia (zonaId) para poder cruzar
// estadísticas por zona entre distintas categorías (ej. goles vs atajadas en
// la misma celda del arco).

export const db = new Dexie("bajo_palos_v2");

db.version(1).stores({
  arqueros: "id, nombre, activo",
  rivales: "id, nombre, activo",
  semanas: "id, jugadorId, fechaInicio",
  sesiones: "id, jugadorId, tipo, fecha, semanaId, estado",
  categoriasAccion: "id, grupo, familia, zonaId, activo, orden",
  zonas: "id, especial, activo, orden",
  acciones: "id, jugadorId, sesionId, categoriaAccionId, creadoEn",
});

const uid = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();

function slugify(txt) {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------- Semilla inicial: zonas y botonera por defecto ----------
// Todo esto es editable/desactivable después desde Configuración. Los IDs son
// slugs estables: si el entrenador renombra la etiqueta, el histórico no se
// rompe porque las acciones referencian el ID, nunca el texto.

const ZONAS_ARCO = [
  "Arriba izquierda", "Arriba centro", "Arriba derecha",
  "Centro izquierda", "Centro", "Centro derecha",
  "Abajo izquierda", "Abajo centro", "Abajo derecha",
];
const ZONAS_ESPECIALES = ["Caño", "Rebote", "Mano a mano", "Penal", "Segundo palo"];
const ZONAS_LADO = ["Izquierda", "Centro", "Derecha"];

function construirZonasSemilla() {
  const lista = [];
  ZONAS_ARCO.forEach((etiqueta, i) => lista.push({ id: `arco_${slugify(etiqueta)}`, etiqueta, grupo: "arco", especial: false, orden: i, activo: true }));
  ZONAS_ESPECIALES.forEach((etiqueta, i) => lista.push({ id: `esp_${slugify(etiqueta)}`, etiqueta, grupo: "especial", especial: true, orden: 100 + i, activo: true }));
  ZONAS_LADO.forEach((etiqueta, i) => lista.push({ id: `lado_${slugify(etiqueta)}`, etiqueta, grupo: "lado", especial: true, orden: 200 + i, activo: true }));
  return lista;
}

function construirCategoriasSemilla() {
  const cat = (etiqueta, grupo, familia, zonaId, tono, orden) => ({
    id: slugify(`${familia}_${etiqueta}`),
    etiqueta,
    grupo, // bloque visual: Atajadas / Caídas / Cruces / Goles / Saques / Otras
    familia, // bucket para agregación estadística
    zonaId: zonaId || null,
    tono, // positivo | gol | negativo | neutral -> cómo cuenta en efectividad
    activo: true,
    orden,
  });

  const lista = [];
  let o = 0;

  // Atajadas: una por cada celda del arco (1 toque)
  ZONAS_ARCO.forEach((z) => lista.push(cat(`Atajada ${z.toLowerCase()}`, "Atajadas", "atajada", `arco_${slugify(z)}`, "positivo", o++)));

  // Caídas: técnica, sin necesitar resultado
  ["Abajo izquierda", "Abajo derecha", "Abajo centro", "Centro izquierda", "Centro derecha"].forEach((z) =>
    lista.push(cat(`Caída ${z.toLowerCase()}`, "Caídas", "caida", null, "neutral", o++))
  );

  // Cruces
  ["Izquierda", "Centro", "Derecha"].forEach((z) => lista.push(cat(`Cruz ${z.toLowerCase()}`, "Cruces", "cruz", `lado_${slugify(z)}`, "neutral", o++)));

  // Goles: una por celda del arco + especiales
  ZONAS_ARCO.forEach((z) => lista.push(cat(`Gol ${z.toLowerCase()}`, "Goles", "gol", `arco_${slugify(z)}`, "gol", o++)));
  ZONAS_ESPECIALES.forEach((z) => lista.push(cat(`Gol de ${z.toLowerCase()}`, "Goles", "gol", `esp_${slugify(z)}`, "gol", o++)));

  // Saques
  [
    "Saque al pívot", "Saque al fondo", "Saque fondo izquierda", "Saque fondo derecha",
    "Saque centro", "Saque lateral izquierda", "Saque lateral derecha",
  ].forEach((etq) => lista.push(cat(etq, "Saques", "saque", null, "neutral", o++)));

  // Otras
  lista.push(cat("Rebote", "Otras", "rebote", null, "neutral", o++));
  lista.push(cat("Desvío", "Otras", "desvio", null, "positivo", o++));
  lista.push(cat("Error", "Otras", "error", null, "negativo", o++));
  lista.push(cat("Salida correcta", "Otras", "salida_correcta", null, "positivo", o++));
  lista.push(cat("Salida incorrecta", "Otras", "salida_incorrecta", null, "negativo", o++));
  lista.push(cat("Mano a mano", "Otras", "mano_a_mano", null, "neutral", o++));
  lista.push(cat("Penal atajado", "Otras", "penal_atajado", null, "positivo", o++));

  return lista;
}

export async function seedInicial() {
  const yaHay = await db.categoriasAccion.count();
  if (yaHay > 0) return;
  await db.zonas.bulkAdd(construirZonasSemilla());
  await db.categoriasAccion.bulkAdd(construirCategoriasSemilla());
}

// ---------- Semanas ----------

export function rangoSemana(fechaISO) {
  const d = new Date(fechaISO + "T00:00:00");
  const dia = d.getDay(); // 0=domingo
  const diffLunes = dia === 0 ? -6 : 1 - dia;
  const lunes = new Date(d);
  lunes.setDate(d.getDate() + diffLunes);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const fmt = (x) => x.toISOString().slice(0, 10);
  return { fechaInicio: fmt(lunes), fechaFin: fmt(domingo) };
}

export async function obtenerOCrearSemana(jugadorId, fechaISO) {
  const { fechaInicio, fechaFin } = rangoSemana(fechaISO);
  const existente = await db.semanas.where({ jugadorId }).and((s) => s.fechaInicio === fechaInicio).first();
  if (existente) return existente;
  const semana = { id: uid(), jugadorId, fechaInicio, fechaFin };
  await db.semanas.add(semana);
  return semana;
}

// ---------- CRUD: arqueros / rivales ----------

export async function crearArquero(nombre) {
  const limpio = nombre.trim();
  if (!limpio) return null;
  const existente = await db.arqueros.filter((a) => a.activo && a.nombre.toLowerCase() === limpio.toLowerCase()).first();
  if (existente) return existente;
  const nuevo = { id: uid(), nombre: limpio, activo: true };
  await db.arqueros.add(nuevo);
  return nuevo;
}

export async function crearRival(nombre) {
  const limpio = (nombre || "").trim();
  if (!limpio) return null;
  const existente = await db.rivales.filter((r) => r.activo && r.nombre.toLowerCase() === limpio.toLowerCase()).first();
  if (existente) return existente;
  const nuevo = { id: uid(), nombre: limpio, activo: true };
  await db.rivales.add(nuevo);
  return nuevo;
}

// ---------- CRUD: sesiones (partido | entrenamiento) ----------

export async function crearSesion({ jugadorId, tipo, fecha, rivalId, notas }) {
  const semana = await obtenerOCrearSemana(jugadorId, fecha);
  const sesion = {
    id: uid(),
    jugadorId,
    tipo, // "partido" | "entrenamiento"
    fecha,
    rivalId: rivalId || null,
    semanaId: semana.id,
    notas: notas || "",
    videoUrl: "",
    estado: "activa",
    creadoEn: ahora(),
  };
  await db.sesiones.add(sesion);
  return sesion;
}

export async function actualizarSesion(id, cambios) {
  await db.sesiones.update(id, cambios);
}

export async function finalizarSesion(id) {
  await db.sesiones.update(id, { estado: "finalizada" });
}

// ---------- CRUD: acciones ----------

export async function crearAccion({ jugadorId, sesionId, categoriaAccionId, notas }) {
  const accion = {
    id: uid(),
    jugadorId,
    sesionId,
    categoriaAccionId,
    notas: notas || "",
    creadoEn: ahora(),
  };
  await db.acciones.add(accion);
  return accion;
}

export async function borrarAccion(id) {
  await db.acciones.delete(id);
}

// ---------- Configuración editable (categorías / zonas) ----------
// Nunca se borra físicamente algo ya usado: se desactiva. Así el histórico
// que ya referencia ese ID sigue funcionando.

export async function crearCategoriaAccion({ etiqueta, grupo, familia, zonaId, tono }) {
  const id = slugify(`${familia}_${etiqueta}_${Date.now()}`);
  const orden = (await db.categoriasAccion.count()) + 1;
  const nueva = { id, etiqueta: etiqueta.trim(), grupo, familia, zonaId: zonaId || null, tono, activo: true, orden };
  await db.categoriasAccion.add(nueva);
  return nueva;
}

export async function crearZona({ etiqueta, grupo }) {
  const id = `${grupo}_${slugify(etiqueta)}_${Date.now()}`;
  const orden = (await db.zonas.count()) + 1;
  const nueva = { id, etiqueta: etiqueta.trim(), grupo: grupo || "especial", especial: grupo !== "arco", activo: true, orden };
  await db.zonas.add(nueva);
  return nueva;
}

export async function renombrar(tabla, id, valor) {
  const campo = tabla === "arqueros" || tabla === "rivales" ? "nombre" : "etiqueta";
  await db.table(tabla).update(id, { [campo]: valor.trim() });
}

export async function toggleActivo(tabla, id, activo) {
  await db.table(tabla).update(id, { activo });
}
