import { db } from "./db.js";

// ---------- Capa 5: Exportar / importar ----------
// Formato versionado para poder evolucionarlo sin romper backups viejos.

const VERSION_FORMATO = 2;

export async function exportarTodo() {
  const [arqueros, rivales, semanas, sesiones, categoriasAccion, zonas, acciones] = await Promise.all([
    db.arqueros.toArray(),
    db.rivales.toArray(),
    db.semanas.toArray(),
    db.sesiones.toArray(),
    db.categoriasAccion.toArray(),
    db.zonas.toArray(),
    db.acciones.toArray(),
  ]);

  const payload = {
    version: VERSION_FORMATO,
    exportadoEn: new Date().toISOString(),
    arqueros,
    rivales,
    semanas,
    sesiones,
    categoriasAccion,
    zonas,
    acciones,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bajo-palos-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importarDesdeArchivo(file) {
  const texto = await file.text();
  const data = JSON.parse(texto);
  if (!data.version) throw new Error("El archivo no tiene el formato esperado de backup de Bajo Palos.");

  await db.transaction(
    "rw",
    [db.arqueros, db.rivales, db.semanas, db.sesiones, db.categoriasAccion, db.zonas, db.acciones],
    async () => {
      await Promise.all([
        db.arqueros.clear(),
        db.rivales.clear(),
        db.semanas.clear(),
        db.sesiones.clear(),
        db.categoriasAccion.clear(),
        db.zonas.clear(),
        db.acciones.clear(),
      ]);
      await db.arqueros.bulkAdd(data.arqueros || []);
      await db.rivales.bulkAdd(data.rivales || []);
      await db.semanas.bulkAdd(data.semanas || []);
      await db.sesiones.bulkAdd(data.sesiones || []);
      await db.categoriasAccion.bulkAdd(data.categoriasAccion || []);
      await db.zonas.bulkAdd(data.zonas || []);
      await db.acciones.bulkAdd(data.acciones || []);
    }
  );
}
