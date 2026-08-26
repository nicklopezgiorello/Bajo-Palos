// ---------- Capa 2: Lógica de estadísticas ----------
// Funciones puras: reciben datos, devuelven números. No tocan la base ni el DOM.
// Así se pueden reusar igual el día que cambie de dónde vienen los datos.

// Siempre devolvemos el número absoluto JUNTO con el porcentaje (nunca el % solo).
export function conteoYPct(n, total) {
  if (!total) return { n: 0, pct: 0, texto: "0 — 0%" };
  const pct = Math.round((n / total) * 100);
  return { n, pct, texto: `${n} — ${pct}%` };
}

// Agrupa acciones por categoría y, dentro de cada categoría, por zona.
export function resumirAcciones(acciones) {
  const porCategoria = {};
  acciones.forEach((a) => {
    const c = (porCategoria[a.categoriaAccionId] = porCategoria[a.categoriaAccionId] || { total: 0, porZona: {} });
    c.total += 1;
    if (a.zonaId) {
      c.porZona[a.zonaId] = (c.porZona[a.zonaId] || 0) + 1;
    }
  });

  const totalAcciones = acciones.length;
  const atajadas = porCategoria["atajada"]?.total || 0;
  const golesRecibidos = porCategoria["gol_recibido"]?.total || 0;
  const tirosRecibidos = porCategoria["tiro_recibido"]?.total || 0;
  const baseEfectividad = atajadas + golesRecibidos;

  return {
    totalAcciones,
    porCategoria,
    atajadas,
    golesRecibidos,
    tirosRecibidos,
    baseEfectividad,
    efectividad: conteoYPct(atajadas, baseEfectividad),
    golesPct: conteoYPct(golesRecibidos, baseEfectividad),
  };
}

// Mapa de conteos por zona para UNA categoría puntual (para pintar el arco).
export function porZonaDeCategoria(resumen, categoriaId) {
  return resumen.porCategoria[categoriaId]?.porZona || {};
}

// ---------- Observaciones basadas en reglas (sin IA, sin inventar) ----------
// Umbrales de confianza: con muestra chica mostramos el dato pero no una
// "observación" con peso. Configurables acá mismo si más adelante se quieren ajustar.
const UMBRAL_OBSERVACION = 3;
const UMBRAL_PATRON_FUERTE = 5;
const CONCENTRACION_MIN_PCT = 50;

export function generarObservaciones(resumen, categoriasPorId, zonasPorId) {
  const observaciones = [];

  Object.entries(resumen.porCategoria).forEach(([catId, data]) => {
    if (data.total < UMBRAL_OBSERVACION) return;
    const zonasOrdenadas = Object.entries(data.porZona).sort((a, b) => b[1] - a[1]);
    if (!zonasOrdenadas.length) return;
    const [zonaTopId, count] = zonasOrdenadas[0];
    const pct = Math.round((count / data.total) * 100);
    if (pct < CONCENTRACION_MIN_PCT) return;

    const etiquetaCat = categoriasPorId[catId]?.etiqueta || catId;
    const etiquetaZona = zonasPorId[zonaTopId]?.etiqueta || zonaTopId;
    const fuerte = data.total >= UMBRAL_PATRON_FUERTE;
    const esGol = catId === "gol_recibido";

    observaciones.push({
      tono: esGol ? "mal" : fuerte ? "alerta" : "ok",
      texto: `El ${pct}% de "${etiquetaCat}" (${count} de ${data.total}) se concentró en "${etiquetaZona}". ${
        esGol
          ? "Conviene revisar esas acciones en video y evaluar el comportamiento técnico ahí."
          : "Vale la pena tenerlo en cuenta para planificar el entrenamiento."
      }`,
    });
  });

  if (resumen.baseEfectividad >= UMBRAL_OBSERVACION) {
    observaciones.push({
      tono: resumen.efectividad.pct >= 60 ? "ok" : resumen.efectividad.pct >= 40 ? "alerta" : "mal",
      texto: `Efectividad general: ${resumen.efectividad.texto} (sobre ${resumen.baseEfectividad} situaciones resueltas entre atajada y gol recibido).`,
    });
  } else if (resumen.baseEfectividad > 0) {
    observaciones.push({
      tono: "alerta",
      texto: `Todavía hay poca muestra (${resumen.baseEfectividad} situaciones) para sacar una conclusión de efectividad confiable.`,
    });
  }

  return observaciones;
}

// ---------- Comparación temporal: primeros N partidos vs últimos N ----------
export function compararPeriodos(partidosOrdenadosPorFecha, accionesPorPartido, categoriaId, zonaId, n = 5) {
  if (partidosOrdenadosPorFecha.length < 2) return null;
  const cantidad = Math.min(n, Math.floor(partidosOrdenadosPorFecha.length / 2));
  if (cantidad < 1) return null;

  const primeros = partidosOrdenadosPorFecha.slice(0, cantidad);
  const ultimos = partidosOrdenadosPorFecha.slice(-cantidad);

  function pctEnGrupo(grupo) {
    let total = 0;
    let enZona = 0;
    grupo.forEach((p) => {
      const acciones = accionesPorPartido[p.id] || [];
      acciones.forEach((a) => {
        if (a.categoriaAccionId !== categoriaId) return;
        total += 1;
        if (!zonaId || a.zonaId === zonaId) enZona += 1;
      });
    });
    return conteoYPct(enZona, total);
  }

  return {
    cantidad,
    primeros: pctEnGrupo(primeros),
    ultimos: pctEnGrupo(ultimos),
  };
}
