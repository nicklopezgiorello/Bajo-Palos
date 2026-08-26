import { db } from "./db.js";

const VERSION_BACKUP = 1;

export async function exportarTodo() {
  const [arqueros, rivales, categoriasAccion, zonas, partidos, acciones] = await Promise.all([
    db.arqueros.toArray(),
    db.rivales.toArray(),
    db.categoriasAccion.toArray(),
    db.zonas.toArray(),
    db.partidos.toArray(),
    db.acciones.toArray(),
  ]);

  const backup = {
    version: VERSION_BACKUP,
    exportadoEn: new Date().toISOString(),
    arqueros,
    rivales,
    categoriasAccion,
    zonas,
    partidos,
    acciones,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `bajo-palos-backup-${fecha}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// modo "reemplazar": borra todo lo actual y pone lo del backup.
// modo "fusionar": agrega lo que falte sin tocar lo que ya está (por id).
export async function importarDesdeArchivo(file, modo = "reemplazar") {
  const texto = await file.text();
  const data = JSON.parse(texto);

  if (!data || typeof data.version !== "number") {
    throw new Error("El archivo no tiene el formato esperado de backup de Bajo Palos.");
  }
  if (data.version > VERSION_BACKUP) {
    throw new Error("Este backup fue exportado con una versión más nueva de Bajo Palos.");
  }

  const tablas = ["arqueros", "rivales", "categoriasAccion", "zonas", "partidos", "acciones"];

  await db.transaction("rw", tablas.map((t) => db[t]), async () => {
    for (const t of tablas) {
      const filas = data[t] || [];
      if (modo === "reemplazar") {
        await db[t].clear();
        if (filas.length) await db[t].bulkPut(filas);
      } else {
        if (filas.length) await db[t].bulkPut(filas); // put = agrega o actualiza por id
      }
    }
  });

  return {
    arqueros: data.arqueros?.length || 0,
    rivales: data.rivales?.length || 0,
    partidos: data.partidos?.length || 0,
    acciones: data.acciones?.length || 0,
  };
}
