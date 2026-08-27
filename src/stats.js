// ---------- Capa 2: Lógica de estadísticas ----------
// Funciones puras: no tocan la base de datos ni React. Reciben acciones ya
// resueltas (categoriaAccionId -> categoría) y devuelven números derivados.
// Nunca se asume "tiros recibidos" como algo cargado aparte: siempre se
// deriva de atajada + gol.

const UMBRAL_MINIMO = 3; // menos de esto: se muestra el dato, no se saca conclusión
const UMBRAL_PATRON = 5; // a partir de esto, un patrón se considera más relevante

export function conteoYPct(n, total) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return { n, pct, texto: `${n} — ${pct}%` };
}

// resumen de un conjunto de acciones ya resueltas a su categoría
export function resumirAcciones(acciones, categoriasPorId) {
  const porFamilia = {}; // familia -> { total, porZona: {zonaId: n} }
  const porCategoria = {}; // categoriaAccionId -> n

  for (const a of acciones) {
    const cat = categoriasPorId[a.categoriaAccionId];
    if (!cat) continue;
    porCategoria[cat.id] = (porCategoria[cat.id] || 0) + 1;
    if (!porFamilia[cat.familia]) porFamilia[cat.familia] = { total: 0, porZona: {}, tono: cat.tono };
    porFamilia[cat.familia].total += 1;
    if (cat.zonaId) {
      porFamilia[cat.familia].porZona[cat.zonaId] = (porFamilia[cat.familia].porZona[cat.zonaId] || 0) + 1;
    }
  }

  const atajadas = porFamilia.atajada?.total || 0;
  const golesRecibidos = porFamilia.gol?.total || 0;
  const tirosRecibidos = atajadas + golesRecibidos;
  const efectividad = conteoYPct(atajadas, tirosRecibidos);

  return {
    totalAcciones: acciones.length,
    porFamilia,
    porCategoria,
    atajadas,
    golesRecibidos,
    tirosRecibidos,
    efectividad,
  };
}

// observaciones automáticas: dato -> patrón -> sugerencia de revisar. Nunca
// un diagnóstico técnico inventado, y nada de conclusiones fuertes con
// muestra chica.
export function generarObservaciones(resumen, zonasPorId) {
  const obs = [];

  if (resumen.tirosRecibidos >= UMBRAL_MINIMO) {
    obs.push({
      tono: resumen.efectividad.pct >= 60 ? "ok" : resumen.efectividad.pct >= 40 ? "alerta" : "mal",
      titulo: "Efectividad general",
      texto: `Efectividad general: ${resumen.efectividad.texto} (sobre ${resumen.tirosRecibidos} tiros recibidos).`,
    });
  }

  ["gol", "atajada"].forEach((familia) => {
    const data = resumen.porFamilia[familia];
    if (!data || data.total < UMBRAL_MINIMO) return;
    const zonas = Object.entries(data.porZona).sort((a, b) => b[1] - a[1]);
    if (!zonas.length) return;
    const [zonaId, n] = zonas[0];
    const pct = Math.round((n / data.total) * 100);
    if (pct < 35) return; // no concentrado, no vale la pena resaltarlo
    const etiquetaFamilia = familia === "gol" ? "goles recibidos" : "atajadas";
    const fuerte = data.total >= UMBRAL_PATRON;
    obs.push({
      tono: familia === "gol" ? "mal" : "ok",
      titulo: fuerte ? "Patrón detectado" : "Zona a observar",
      texto: `El ${pct}% de "${etiquetaFamilia}" (${n} de ${data.total}) se concentró en "${zonasPorId[zonaId]?.etiqueta || zonaId}".${
        familia === "gol" ? " Conviene revisar estas acciones en video y evaluar el comportamiento del arquero ahí." : ""
      }`,
    });
  });

  if (resumen.totalAcciones < UMBRAL_MINIMO) {
    obs.push({
      tono: "alerta",
      titulo: "Muestra chica",
      texto: `Todavía hay pocos registros (${resumen.totalAcciones}) para sacar conclusiones confiables. Los números de arriba son reales, pero conviene esperar más partidos/entrenamientos.`,
    });
  }

  return obs;
}

// compara dos conjuntos de acciones (ej. semana 1 vs semana 2) para una
// familia puntual (ej. "gol") y devuelve la diferencia en puntos porcentuales
export function compararConjuntos(accionesA, accionesB, categoriasPorId, familia) {
  const rA = resumirAcciones(accionesA, categoriasPorId);
  const rB = resumirAcciones(accionesB, categoriasPorId);
  const dA = rA.porFamilia[familia];
  const dB = rB.porFamilia[familia];
  if (!dA || !dB || dA.total < UMBRAL_MINIMO || dB.total < UMBRAL_MINIMO) return null;
  const pctA = Math.round((dA.total / rA.totalAcciones) * 100);
  const pctB = Math.round((dB.total / rB.totalAcciones) * 100);
  return { pctA, pctB, diferencia: pctB - pctA };
}

// atributos derivados para el panel de comparación entre jugadores. Cada
// atributo declara la muestra mínima que necesita: si no la alcanza, se
// muestra null (N/D en la interfaz), nunca un número inventado.
export function calcularAtributos(acciones, categoriasPorId) {
  const r = resumirAcciones(acciones, categoriasPorId);
  const pctFamilia = (familia, base) => {
    const d = r.porFamilia[familia];
    if (!d || base < UMBRAL_MINIMO) return null;
    return Math.round((d.total / base) * 100);
  };

  const salidasTotal = (r.porFamilia.salida_correcta?.total || 0) + (r.porFamilia.salida_incorrecta?.total || 0);

  return {
    Atajadas: r.tirosRecibidos >= UMBRAL_MINIMO ? r.efectividad.pct : null,
    Caídas: r.porFamilia.caida?.total >= UMBRAL_MINIMO ? Math.min(100, r.porFamilia.caida.total * 8) : null,
    Cruces: r.porFamilia.cruz?.total >= UMBRAL_MINIMO ? Math.min(100, r.porFamilia.cruz.total * 10) : null,
    Salidas:
      salidasTotal >= UMBRAL_MINIMO
        ? Math.round(((r.porFamilia.salida_correcta?.total || 0) / salidasTotal) * 100)
        : null,
    Saques: r.porFamilia.saque?.total >= UMBRAL_MINIMO ? Math.min(100, r.porFamilia.saque.total * 6) : null,
    Volumen: Math.min(100, r.totalAcciones * 3),
  };
}
