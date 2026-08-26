import Dexie from "dexie";

// ---------- Capa 4: Almacenamiento local (IndexedDB vía Dexie) ----------
// Nada de esto depende de un servidor: cada navegador/dispositivo tiene su
// propia base, así que cada entrenador que abre la misma URL arranca con su
// propio espacio de trabajo vacío, sin login y sin ver datos de nadie más.

export const db = new Dexie("bajoPalosDB");

db.version(1).stores({
  arqueros: "id, nombre, activo",
  rivales: "id, nombre, activo",
  categoriasAccion: "id, orden, activo",
  zonas: "id, orden, activo",
  partidos: "id, fecha, arqueroId, rivalId, creadoEn",
  acciones: "id, partidoId, arqueroId, categoriaAccionId, zonaId, creadoEn",
  meta: "clave",
});

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function slugify(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Categorías y zonas por defecto. Son datos, no constantes de código: el
// entrenador las puede renombrar, desactivar o agregar nuevas desde
// Configuración sin que se rompa el historial (todo se referencia por id).
const CATEGORIAS_DEFAULT = [
  "Tiro recibido",
  "Atajada",
  "Gol recibido",
  "Salida correcta",
  "Salida incorrecta",
  "Caída baja",
  "Mano a mano",
  "Rebote",
  "Desvío",
  "Error",
  "Otra situación",
];

const ZONAS_DEFAULT = [
  { etiqueta: "Izquierda", grupo: "lado" },
  { etiqueta: "Centro", grupo: "lado" },
  { etiqueta: "Derecha", grupo: "lado" },
  { etiqueta: "Arriba izquierda", grupo: "arco" },
  { etiqueta: "Arriba centro", grupo: "arco" },
  { etiqueta: "Arriba derecha", grupo: "arco" },
  { etiqueta: "Abajo izquierda", grupo: "arco" },
  { etiqueta: "Abajo centro", grupo: "arco" },
  { etiqueta: "Abajo derecha", grupo: "arco" },
  { etiqueta: "Caño", grupo: "especial" },
];

export async function seedInicial() {
  const yaSembrado = await db.meta.get("seed_v1");
  if (yaSembrado) return;

  await db.categoriasAccion.bulkAdd(
    CATEGORIAS_DEFAULT.map((etiqueta, i) => ({
      id: slugify(etiqueta),
      etiqueta,
      activo: true,
      orden: i,
    }))
  );

  await db.zonas.bulkAdd(
    ZONAS_DEFAULT.map((z, i) => ({
      id: slugify(z.etiqueta),
      etiqueta: z.etiqueta,
      grupo: z.grupo,
      activo: true,
      orden: i,
    }))
  );

  await db.meta.put({ clave: "seed_v1", valor: true });
}

// ---------- Operaciones CRUD ----------
// Todas devuelven o reciben ids estables. Nada se borra físicamente si ya fue
// usado en el historial: se "desactiva" (activo: false) y deja de aparecer
// como opción nueva, pero las acciones viejas la siguen mostrando bien.

export async function crearArquero(nombre) {
  const limpio = nombre.trim();
  if (!limpio) return null;
  const existente = await db.arqueros.filter((a) => a.nombre.toLowerCase() === limpio.toLowerCase()).first();
  if (existente) return existente;
  const nuevo = { id: uid(), nombre: limpio, activo: true };
  await db.arqueros.add(nuevo);
  return nuevo;
}

export async function crearRival(nombre) {
  const limpio = nombre.trim();
  if (!limpio) return null;
  const existente = await db.rivales.filter((r) => r.nombre.toLowerCase() === limpio.toLowerCase()).first();
  if (existente) return existente;
  const nuevo = { id: uid(), nombre: limpio, activo: true };
  await db.rivales.add(nuevo);
  return nuevo;
}

export async function crearPartido({ fecha, arqueroId, rivalId, notas }) {
  const nuevo = { id: uid(), fecha, arqueroId, rivalId, notas: notas || "", videoUrl: "", creadoEn: Date.now() };
  await db.partidos.add(nuevo);
  return nuevo;
}

export async function actualizarPartido(id, cambios) {
  await db.partidos.update(id, cambios);
}

export async function crearAccion({ partidoId, arqueroId, categoriaAccionId, zonaId, notas }) {
  const nueva = {
    id: uid(),
    partidoId,
    arqueroId,
    categoriaAccionId,
    zonaId: zonaId || null,
    notas: notas || "",
    creadoEn: Date.now(),
  };
  await db.acciones.add(nueva);
  return nueva;
}

export async function borrarAccion(id) {
  await db.acciones.delete(id);
}

export async function crearCategoriaAccion(etiqueta) {
  const limpio = etiqueta.trim();
  if (!limpio) return null;
  const id = slugify(limpio);
  const existente = await db.categoriasAccion.get(id);
  if (existente) return existente;
  const max = await db.categoriasAccion.orderBy("orden").last();
  const nueva = { id, etiqueta: limpio, activo: true, orden: (max?.orden ?? 0) + 1 };
  await db.categoriasAccion.add(nueva);
  return nueva;
}

export async function crearZona(etiqueta, grupo = "otras") {
  const limpio = etiqueta.trim();
  if (!limpio) return null;
  const id = slugify(limpio);
  const existente = await db.zonas.get(id);
  if (existente) return existente;
  const max = await db.zonas.orderBy("orden").last();
  const nueva = { id, etiqueta: limpio, grupo, activo: true, orden: (max?.orden ?? 0) + 1 };
  await db.zonas.add(nueva);
  return nueva;
}

export async function renombrar(tabla, id, etiquetaOrNombre) {
  const campo = tabla === "arqueros" || tabla === "rivales" ? "nombre" : "etiqueta";
  await db[tabla].update(id, { [campo]: etiquetaOrNombre });
}

export async function toggleActivo(tabla, id, activo) {
  await db[tabla].update(id, { activo });
}
