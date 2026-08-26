import { useState, useEffect, useMemo, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  seedInicial,
  crearArquero,
  crearRival,
  crearPartido,
  actualizarPartido,
  crearAccion,
  borrarAccion,
  crearCategoriaAccion,
  crearZona,
  renombrar,
  toggleActivo,
} from "./db.js";
import { resumirAcciones, generarObservaciones, compararPeriodos, conteoYPct } from "./stats.js";
import { exportarTodo, importarDesdeArchivo } from "./exportImport.js";

const todayISO = () => new Date().toISOString().slice(0, 10);

// ---------- Capa 1: Interfaz ----------

export default function App() {
  const [listo, setListo] = useState(false);
  const [view, setView] = useState("registrar");

  useEffect(() => {
    seedInicial().then(() => setListo(true));
  }, []);

  // sesión activa: qué arquero y qué partido estoy tipificando ahora.
  // Vive en localStorage de ESTE dispositivo — no se comparte con nadie.
  const [arqueroId, setArqueroId] = useState(() => localStorage.getItem("bp_arqueroId") || "");
  const [partidoId, setPartidoId] = useState(() => localStorage.getItem("bp_partidoId") || "");

  useEffect(() => {
    if (arqueroId) localStorage.setItem("bp_arqueroId", arqueroId);
  }, [arqueroId]);
  useEffect(() => {
    if (partidoId) localStorage.setItem("bp_partidoId", partidoId);
    else localStorage.removeItem("bp_partidoId");
  }, [partidoId]);

  const arqueros = useLiveQuery(() => db.arqueros.filter((a) => a.activo).toArray(), []) || [];
  const rivales = useLiveQuery(() => db.rivales.filter((r) => r.activo).toArray(), []) || [];
  const categorias = useLiveQuery(() => db.categoriasAccion.orderBy("orden").filter((c) => c.activo).toArray(), []) || [];
  const zonas = useLiveQuery(() => db.zonas.orderBy("orden").filter((z) => z.activo).toArray(), []) || [];
  const partidosDelArquero =
    useLiveQuery(
      () => (arqueroId ? db.partidos.where("arqueroId").equals(arqueroId).reverse().sortBy("fecha") : []),
      [arqueroId]
    ) || [];
  const partidoActivo = useLiveQuery(() => (partidoId ? db.partidos.get(partidoId) : null), [partidoId]);

  const categoriasPorId = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const zonasPorId = useMemo(() => Object.fromEntries(zonas.map((z) => [z.id, z])), [zonas]);
  const rivalesPorId = useMemo(() => Object.fromEntries(rivales.map((r) => [r.id, r])), [rivales]);
  const arquerosPorId = useMemo(() => Object.fromEntries(arqueros.map((a) => [a.id, a])), [arqueros]);

  if (!listo) {
    return (
      <div className="app">
        <style>{CSS}</style>
        <div className="empty">Preparando Bajo Palos…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="topbar">
        <div className="brand">
          <GoalMark size={34} />
          <div className="brand-text">
            <span className="brand-title">BAJO PALOS</span>
            <span className="brand-sub">bitácora de arquero · futsal</span>
          </div>
        </div>
        <nav className="tabs">
          {[
            ["registrar", "Registrar"],
            ["panel", "Panel"],
            ["config", "Configuración"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={"tab" + (view === id ? " tab--active" : "")}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {view === "registrar" && (
          <RegistrarView
            arqueros={arqueros}
            rivales={rivales}
            categorias={categorias}
            zonas={zonas}
            arqueroId={arqueroId}
            setArqueroId={setArqueroId}
            partidoId={partidoId}
            setPartidoId={setPartidoId}
            partidoActivo={partidoActivo}
            partidosDelArquero={partidosDelArquero}
            categoriasPorId={categoriasPorId}
            zonasPorId={zonasPorId}
            rivalesPorId={rivalesPorId}
          />
        )}
        {view === "panel" && (
          <PanelView
            arqueros={arqueros}
            categoriasPorId={categoriasPorId}
            zonasPorId={zonasPorId}
            rivalesPorId={rivalesPorId}
          />
        )}
        {view === "config" && (
          <ConfigView
            arqueros={arqueros}
            rivales={rivales}
            categorias={categorias}
            zonas={zonas}
          />
        )}
      </main>
    </div>
  );
}

// ---------- Vista: Registrar (uso durante el partido, mobile-first) ----------

function RegistrarView({
  arqueros,
  rivales,
  categorias,
  zonas,
  arqueroId,
  setArqueroId,
  partidoId,
  setPartidoId,
  partidoActivo,
  partidosDelArquero,
  categoriasPorId,
  zonasPorId,
  rivalesPorId,
}) {
  const [nuevoArquero, setNuevoArquero] = useState("");
  const [creandoPartido, setCreandoPartido] = useState(false);
  const [fechaNueva, setFechaNueva] = useState(todayISO());
  const [rivalNuevo, setRivalNuevo] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null);
  const [toast, setToast] = useState(null);
  const [videoInput, setVideoInput] = useState("");

  useEffect(() => {
    setVideoInput(partidoActivo?.videoUrl || "");
  }, [partidoActivo?.id]);

  const acciones =
    useLiveQuery(
      () => (partidoId ? db.acciones.where("partidoId").equals(partidoId).reverse().sortBy("creadoEn") : []),
      [partidoId]
    ) || [];

  const resumen = useMemo(() => resumirAcciones(acciones), [acciones]);

  async function handleNuevoArquero() {
    const a = await crearArquero(nuevoArquero);
    if (a) {
      setArqueroId(a.id);
      setPartidoId("");
      setNuevoArquero("");
    }
  }

  async function handleCrearPartido() {
    let rivalId = null;
    if (rivalNuevo.trim()) {
      const r = await crearRival(rivalNuevo);
      rivalId = r?.id || null;
    }
    const p = await crearPartido({ fecha: fechaNueva, arqueroId, rivalId });
    setPartidoId(p.id);
    setCreandoPartido(false);
    setRivalNuevo("");
  }

  async function handleTapCategoria(catId) {
    setCategoriaSeleccionada(catId);
  }

  async function handleTapZona(zonaId) {
    if (!categoriaSeleccionada || !partidoId) return;
    await crearAccion({ partidoId, arqueroId, categoriaAccionId: categoriaSeleccionada, zonaId });
    setToast(`${categoriasPorId[categoriaSeleccionada]?.etiqueta} — ${zonasPorId[zonaId]?.etiqueta}`);
    setTimeout(() => setToast(null), 1400);
    setCategoriaSeleccionada(null);
  }

  async function handleSinZona() {
    if (!categoriaSeleccionada || !partidoId) return;
    await crearAccion({ partidoId, arqueroId, categoriaAccionId: categoriaSeleccionada, zonaId: null });
    setToast(`${categoriasPorId[categoriaSeleccionada]?.etiqueta}`);
    setTimeout(() => setToast(null), 1400);
    setCategoriaSeleccionada(null);
  }

  function guardarVideo() {
    if (!partidoId) return;
    actualizarPartido(partidoId, { videoUrl: videoInput.trim() });
  }

  const embed = useMemo(() => parseVideoEmbed(partidoActivo?.videoUrl), [partidoActivo?.videoUrl]);

  const zonasLado = zonas.filter((z) => z.grupo === "lado");
  const zonasArco = zonas.filter((z) => z.grupo === "arco");
  const zonasEspeciales = zonas.filter((z) => z.grupo !== "lado" && z.grupo !== "arco");

  // ---- Paso 1: elegir arquero ----
  if (!arqueroId) {
    return (
      <div className="card">
        <h3>¿Qué arquero vas a registrar?</h3>
        <div className="chip-row" style={{ marginTop: 10 }}>
          {arqueros.map((a) => (
            <button key={a.id} className="chip" onClick={() => setArqueroId(a.id)}>
              {a.nombre}
            </button>
          ))}
        </div>
        <div className="video-input-row" style={{ marginTop: 14 }}>
          <input
            type="text"
            placeholder="agregar arquero nuevo"
            value={nuevoArquero}
            onChange={(e) => setNuevoArquero(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNuevoArquero()}
          />
          <button className="btn-secondary" onClick={handleNuevoArquero}>
            Añadir
          </button>
        </div>
      </div>
    );
  }

  // ---- Paso 2: elegir o crear partido ----
  if (!partidoId || !partidoActivo) {
    return (
      <div className="card">
        <div className="row-between">
          <h3>Partidos de {arquerosPorIdLabel(arqueros, arqueroId)}</h3>
          <button className="btn-ghost-text" onClick={() => setArqueroId("")}>
            cambiar arquero
          </button>
        </div>

        {partidosDelArquero.length > 0 && (
          <div className="lista" style={{ marginBottom: 14 }}>
            {partidosDelArquero.map((p) => (
              <button key={p.id} className="lista-item lista-item--btn" onClick={() => setPartidoId(p.id)}>
                <span className="lista-item__title">{p.fecha}</span>
                <span className="muted small">{rivalesPorId[p.rivalId]?.nombre || ""}</span>
              </button>
            ))}
          </div>
        )}

        {!creandoPartido ? (
          <button className="btn-primary" onClick={() => setCreandoPartido(true)}>
            + Nuevo partido
          </button>
        ) : (
          <div className="form-grid">
            <label className="field">
              <span>Fecha</span>
              <input type="date" value={fechaNueva} onChange={(e) => setFechaNueva(e.target.value)} />
            </label>
            <label className="field">
              <span>Rival</span>
              <input
                type="text"
                placeholder="ej. Deportivo Norte"
                value={rivalNuevo}
                onChange={(e) => setRivalNuevo(e.target.value)}
              />
            </label>
            <button className="btn-primary" onClick={handleCrearPartido}>
              Crear y empezar a registrar
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- Paso 3: registro rápido de acciones ----
  return (
    <div className="split-layout">
      <div className="video-col">
        <div className="card">
          <div className="row-between">
            <div>
              <div className="lista-item__title">{partidoActivo.fecha}</div>
              <div className="muted small">
                {rivalesPorId[partidoActivo.rivalId]?.nombre || "sin rival cargado"} · {arquerosPorIdLabel(arqueros, arqueroId)}
              </div>
            </div>
            <button className="btn-ghost-text" onClick={() => setPartidoId("")}>
              cambiar partido
            </button>
          </div>
          <label className="field" style={{ marginTop: 10, marginBottom: 0 }}>
            <span>Video del partido (opcional)</span>
            <div className="video-input-row">
              <input
                type="text"
                placeholder="YouTube, Drive, Vimeo o .mp4"
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
              />
              <button className="btn-secondary" onClick={guardarVideo}>
                Guardar
              </button>
            </div>
          </label>
        </div>

        {embed && (
          <div className="card video-embed-card">
            <div className="video-embed-wrap">
              {embed.kind === "video" ? <video src={embed.src} controls /> : <iframe src={embed.src} title="video" allowFullScreen />}
            </div>
          </div>
        )}

        <div className="card">
          <h3>Este partido</h3>
          <MiniResumen resumen={resumen} />
        </div>
      </div>

      <div className="card">
        {!categoriaSeleccionada ? (
          <>
            <span className="field-label">Acción</span>
            <div className="chip-row chip-row--grande">
              {categorias.map((c) => (
                <button key={c.id} className="chip chip--grande" onClick={() => handleTapCategoria(c.id)}>
                  {c.etiqueta}
                  {resumen.porCategoria[c.id] && (
                    <span className="chip__count">{resumen.porCategoria[c.id].total}</span>
                  )}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="row-between">
              <span className="field-label">
                {categoriasPorId[categoriaSeleccionada]?.etiqueta} — ¿de qué lado / zona?
              </span>
              <button className="btn-ghost-text" onClick={() => setCategoriaSeleccionada(null)}>
                atrás
              </button>
            </div>
            <div className="chip-row chip-row--grande" style={{ marginTop: 8 }}>
              {zonasLado.map((z) => (
                <button key={z.id} className="chip chip--grande chip--save" onClick={() => handleTapZona(z.id)}>
                  {z.etiqueta}
                </button>
              ))}
            </div>
            {(zonasArco.length > 0 || zonasEspeciales.length > 0) && (
              <>
                <span className="field-label" style={{ marginTop: 12, display: "block" }}>
                  Detalle del arco (opcional)
                </span>
                <div className="chip-row" style={{ marginTop: 6 }}>
                  {[...zonasArco, ...zonasEspeciales].map((z) => (
                    <button key={z.id} className="chip" onClick={() => handleTapZona(z.id)}>
                      {z.etiqueta}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button className="btn-ghost-text" style={{ marginTop: 10 }} onClick={handleSinZona}>
              guardar sin zona
            </button>
          </>
        )}

        <h3 style={{ marginTop: 18 }}>Últimas acciones cargadas</h3>
        <div className="lista">
          {acciones.slice(0, 12).map((a) => (
            <div key={a.id} className="lista-item">
              <div>
                <span className="lista-item__title">{categoriasPorId[a.categoriaAccionId]?.etiqueta || "—"}</span>
                {a.zonaId && <span className="muted small"> · {zonasPorId[a.zonaId]?.etiqueta}</span>}
              </div>
              <button className="btn-ghost" onClick={() => borrarAccion(a.id)}>
                ✕
              </button>
            </div>
          ))}
          {acciones.length === 0 && <span className="muted small">Todavía no cargaste ninguna acción.</span>}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function arquerosPorIdLabel(arqueros, id) {
  return arqueros.find((a) => a.id === id)?.nombre || "";
}

function MiniResumen({ resumen }) {
  return (
    <div className="mini-resumen">
      <div>
        <span className="mini-resumen__val">{resumen.tirosRecibidos}</span>
        <span className="muted small">tiros recibidos</span>
      </div>
      <div>
        <span className="mini-resumen__val" style={{ color: "var(--accent-goal)" }}>
          {resumen.golesRecibidos}
        </span>
        <span className="muted small">goles recibidos</span>
      </div>
      <div>
        <span className="mini-resumen__val" style={{ color: "var(--accent-save)" }}>
          {resumen.atajadas}
        </span>
        <span className="muted small">atajadas</span>
      </div>
      <div>
        <span className="mini-resumen__val">{resumen.baseEfectividad ? `${resumen.efectividad.pct}%` : "—"}</span>
        <span className="muted small">efectividad</span>
      </div>
    </div>
  );
}

// ---------- Vista: Panel (análisis acumulado, pensado para la compu) ----------

function PanelView({ arqueros, categoriasPorId, zonasPorId, rivalesPorId }) {
  const [arqueroId, setArqueroId] = useState(arqueros[0]?.id || "");
  useEffect(() => {
    if (!arqueroId && arqueros[0]) setArqueroId(arqueros[0].id);
  }, [arqueros, arqueroId]);

  const partidos =
    useLiveQuery(() => (arqueroId ? db.partidos.where("arqueroId").equals(arqueroId).sortBy("fecha") : []), [arqueroId]) || [];
  const [partidoId, setPartidoId] = useState("todos");

  const todasLasAcciones =
    useLiveQuery(
      () => (arqueroId ? db.acciones.where("arqueroId").equals(arqueroId).toArray() : []),
      [arqueroId]
    ) || [];

  const accionesPorPartido = useMemo(() => {
    const map = {};
    todasLasAcciones.forEach((a) => {
      map[a.partidoId] = map[a.partidoId] || [];
      map[a.partidoId].push(a);
    });
    return map;
  }, [todasLasAcciones]);

  const accionesFiltradas = useMemo(() => {
    if (partidoId === "todos") return todasLasAcciones;
    return todasLasAcciones.filter((a) => a.partidoId === partidoId);
  }, [todasLasAcciones, partidoId]);

  const resumen = useMemo(() => resumirAcciones(accionesFiltradas), [accionesFiltradas]);
  const observaciones = useMemo(
    () => generarObservaciones(resumen, categoriasPorId, zonasPorId),
    [resumen, categoriasPorId, zonasPorId]
  );

  const comparacionGoles = useMemo(
    () => compararPeriodos(partidos, accionesPorPartido, "gol_recibido", null, 5),
    [partidos, accionesPorPartido]
  );

  const zonasArco = useMemo(
    () => Object.values(zonasPorId).filter((z) => z.grupo === "arco").sort((a, b) => a.orden - b.orden),
    [zonasPorId]
  );

  if (arqueros.length === 0) {
    return <div className="empty card">Todavía no cargaste ningún arquero. Andá a "Registrar" para crear el primero.</div>;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="field field--inline">
          <span>Arquero</span>
          <select value={arqueroId} onChange={(e) => { setArqueroId(e.target.value); setPartidoId("todos"); }}>
            {arqueros.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field field--inline">
          <span>Partido</span>
          <select value={partidoId} onChange={(e) => setPartidoId(e.target.value)}>
            <option value="todos">Todos ({partidos.length})</option>
            {[...partidos].reverse().map((p) => (
              <option key={p.id} value={p.id}>
                {p.fecha} {rivalesPorId[p.rivalId]?.nombre ? `vs ${rivalesPorId[p.rivalId].nombre}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="kpi-row">
          <KPI label="Tiros recibidos" value={resumen.tirosRecibidos} />
          <KPI label="Efectividad" value={resumen.baseEfectividad ? `${resumen.efectividad.pct}%` : "—"} />
          <KPI label="Goles recibidos" value={resumen.golesRecibidos} tono="mal" />
        </div>
      </div>

      {observaciones.length > 0 && (
        <div className="card insight">
          <div className="insight__col">
            {observaciones.map((o, i) => (
              <p key={i} className={"insight__linea insight__linea--" + o.tono}>
                {o.texto}
              </p>
            ))}
          </div>
        </div>
      )}

      {comparacionGoles && (
        <div className="card">
          <h3>Evolución: goles recibidos</h3>
          <p className="muted small">
            Primeros {comparacionGoles.cantidad} partidos vs últimos {comparacionGoles.cantidad}.
          </p>
          <div className="comparativa-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="lado-card" style={{ margin: 0 }}>
              <span className="muted small">Primeros</span>
              <BigStat pct={comparacionGoles.primeros.pct} n={comparacionGoles.primeros.n} />
            </div>
            <div className="lado-card" style={{ margin: 0 }}>
              <span className="muted small">Últimos</span>
              <BigStat pct={comparacionGoles.ultimos.pct} n={comparacionGoles.ultimos.n} />
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Por tipo de acción</h3>
        <div className="tabla">
          {Object.entries(resumen.porCategoria)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([catId, data]) => (
              <div key={catId} className="tabla-row" style={{ gridTemplateColumns: "1fr auto" }}>
                <span className="tabla-row__label">{categoriasPorId[catId]?.etiqueta || catId}</span>
                <span className="tabla-row__val">{data.total}</span>
              </div>
            ))}
          {Object.keys(resumen.porCategoria).length === 0 && (
            <span className="muted small">Sin acciones cargadas todavía.</span>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Mapa del arco</h3>
        <p className="muted small">Se arma solo con las zonas de tipo "arco" que tengas en Configuración.</p>
        <div className="mapa-row">
          <div>
            <span className="situacion-group__label">Tiros recibidos por zona</span>
            <GoalHeatmap
              zonasArco={zonasArco}
              conteos={resumen.porCategoria["tiro_recibido"]?.porZona || {}}
              totalCategoria={resumen.tirosRecibidos}
              tono="ok"
            />
          </div>
          <div>
            <span className="situacion-group__label">Goles recibidos por zona</span>
            <GoalHeatmap
              zonasArco={zonasArco}
              conteos={resumen.porCategoria["gol_recibido"]?.porZona || {}}
              totalCategoria={resumen.golesRecibidos}
              tono="mal"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Tiros y goles por zona</h3>
        <ZonaTabla resumen={resumen} zonasPorId={zonasPorId} />
      </div>
    </div>
  );
}

function ZonaTabla({ resumen, zonasPorId }) {
  const etiquetas = { tiro_recibido: "Tiro recibido", atajada: "Atajada", gol_recibido: "Gol recibido" };
  const categoriasRelevantes = Object.keys(etiquetas).filter((c) => resumen.porCategoria[c]);
  if (categoriasRelevantes.length === 0) {
    return (
      <span className="muted small">
        Cargá acciones de tipo "Tiro recibido", "Atajada" o "Gol recibido" para ver este desglose.
      </span>
    );
  }
  return (
    <div className="zona-tabla">
      {categoriasRelevantes.map((catId) => {
        const data = resumen.porCategoria[catId];
        const filas = Object.entries(data.porZona).sort((a, b) => b[1] - a[1]);
        return (
          <div key={catId} className="zona-tabla__grupo">
            <span className="situacion-group__label">{etiquetas[catId]}</span>
            {filas.length === 0 && <span className="muted small">sin zona registrada</span>}
            {filas.map(([zonaId, n]) => {
              const { texto } = conteoYPct(n, data.total);
              return (
                <div key={zonaId} className="tabla-row" style={{ gridTemplateColumns: "1fr auto", marginTop: 4 }}>
                  <span className="small">{zonasPorId[zonaId]?.etiqueta || zonaId}</span>
                  <span className="tabla-row__val small">{texto}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Mapa visual del arco: agrupa las zonas de grupo "arco" en una grilla de 3
// columnas (se adapta sola si en Configuración se agregan más zonas de arco)
// y pinta cada celda según cuántas veces se registró ahí la categoría elegida.
function GoalHeatmap({ zonasArco, conteos, totalCategoria, tono }) {
  if (zonasArco.length === 0) return null;
  const cols = 3;
  const rows = Math.ceil(zonasArco.length / cols);
  const cellW = 91;
  const cellH = 57;
  const w = 14 + cols * cellW + 14;
  const h = 8 + rows * cellH + 8;
  const max = Math.max(1, ...zonasArco.map((z) => conteos[z.id] || 0));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="heatmap__svg">
      <path d={`M14 8 H${w - 14} V${h - 8}`} stroke="var(--chalk)" strokeWidth="4" fill="none" strokeLinecap="square" />
      <path d={`M14 8 V${h - 8}`} stroke="var(--chalk)" strokeWidth="4" fill="none" strokeLinecap="square" />
      {zonasArco.map((z, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 14 + col * cellW + 1;
        const y = 8 + row * cellH + 1;
        const n = conteos[z.id] || 0;
        const intensity = n / max;
        const pct = totalCategoria ? Math.round((n / totalCategoria) * 100) : 0;
        return (
          <g key={z.id}>
            <rect
              x={x}
              y={y}
              width={cellW - 2}
              height={cellH - 2}
              rx="4"
              fill="var(--panel-2)"
              stroke="var(--chalk-dim)"
              strokeWidth={n ? 1.5 : 0.5}
              opacity={n ? 0.3 + 0.5 * intensity : 0.35}
            />
            {n > 0 && (
              <rect
                x={x}
                y={y}
                width={cellW - 2}
                height={cellH - 2}
                rx="4"
                fill={tono === "mal" ? "var(--accent-goal)" : "var(--accent-save)"}
                opacity={0.2 + intensity * 0.55}
              />
            )}
            <text x={x + (cellW - 2) / 2} y={y + (cellH - 2) / 2 - 3} textAnchor="middle" className="heatmap__num">
              {n}
              {totalCategoria ? ` (${pct}%)` : ""}
            </text>
            <text x={x + (cellW - 2) / 2} y={y + (cellH - 2) / 2 + 14} textAnchor="middle" className="heatmap__label">
              {z.etiqueta}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function KPI({ label, value, tono }) {
  return (
    <div className={"kpi" + (tono ? " kpi--" + tono : "")}>
      <span className="kpi__value">{value}</span>
      <span className="kpi__label">{label}</span>
    </div>
  );
}

function BigStat({ pct, n }) {
  return (
    <div className="bigstat">
      <span className="bigstat__pct">{n ? `${pct}%` : "—"}</span>
      <span className="muted small">{n} caso{n === 1 ? "" : "s"}</span>
    </div>
  );
}

// ---------- Vista: Configuración ----------

function ConfigView() {
  const [importando, setImportando] = useState(false);
  const [mensajeImport, setMensajeImport] = useState(null);
  const fileRef = useRef(null);

  const todosArqueros = useLiveQuery(() => db.arqueros.toArray(), []) || [];
  const todosRivales = useLiveQuery(() => db.rivales.toArray(), []) || [];
  const todasCategorias = useLiveQuery(() => db.categoriasAccion.orderBy("orden").toArray(), []) || [];
  const todasZonas = useLiveQuery(() => db.zonas.orderBy("orden").toArray(), []) || [];

  async function handleImportar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const resultado = await importarDesdeArchivo(file, "reemplazar");
      setMensajeImport(
        `Importado: ${resultado.arqueros} arqueros, ${resultado.partidos} partidos, ${resultado.acciones} acciones.`
      );
    } catch (err) {
      setMensajeImport("Error al importar: " + err.message);
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="panel">
      <div className="card">
        <h3>Exportar / importar</h3>
        <p className="muted small">
          Los datos viven en este navegador. Exportá seguido para tener un backup — es la única forma de
          llevarlos a otra computadora o recuperarlos si cambiás de dispositivo.
        </p>
        <div className="chip-row" style={{ marginTop: 10 }}>
          <button className="btn-secondary" onClick={() => exportarTodo()}>
            Exportar todo (.json)
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={importando}>
            {importando ? "Importando…" : "Importar backup (.json)"}
          </button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleImportar} />
        </div>
        {mensajeImport && <p className="small muted" style={{ marginTop: 8 }}>{mensajeImport}</p>}
      </div>

      <ConfigLista titulo="Arqueros" items={todosArqueros} campo="nombre" placeholder="nombre del arquero" onCrear={crearArquero} tabla="arqueros" />
      <ConfigLista titulo="Rivales" items={todosRivales} campo="nombre" placeholder="nombre del rival" onCrear={crearRival} tabla="rivales" />
      <ConfigLista titulo="Tipos de acción" items={todasCategorias} campo="etiqueta" placeholder="ej. Segundo palo" onCrear={crearCategoriaAccion} tabla="categoriasAccion" />
      <ConfigLista titulo="Zonas" items={todasZonas} campo="etiqueta" placeholder="ej. Palo corto" onCrear={crearZona} tabla="zonas" />
    </div>
  );
}

function ConfigLista({ titulo, items, campo, placeholder, onCrear, tabla }) {
  const [nuevo, setNuevo] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [valorEdit, setValorEdit] = useState("");

  async function handleCrear() {
    if (!nuevo.trim()) return;
    await onCrear(nuevo);
    setNuevo("");
  }

  function empezarEdicion(item) {
    setEditandoId(item.id);
    setValorEdit(item[campo]);
  }

  async function guardarEdicion(id) {
    await renombrar(tabla, id, valorEdit);
    setEditandoId(null);
  }

  return (
    <div className="card">
      <h3>{titulo}</h3>
      <div className="lista" style={{ marginTop: 8 }}>
        {items.map((item) => (
          <div key={item.id} className="lista-item">
            {editandoId === item.id ? (
              <div className="video-input-row" style={{ flex: 1 }}>
                <input value={valorEdit} onChange={(e) => setValorEdit(e.target.value)} />
                <button className="btn-secondary" onClick={() => guardarEdicion(item.id)}>
                  Guardar
                </button>
              </div>
            ) : (
              <>
                <span className={item.activo === false ? "muted" : ""}>
                  {item[campo]} {item.activo === false && <span className="small">(desactivado)</span>}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn-ghost-text" onClick={() => empezarEdicion(item)}>
                    editar
                  </button>
                  <button className="btn-ghost-text" onClick={() => toggleActivo(tabla, item.id, item.activo === false)}>
                    {item.activo === false ? "activar" : "desactivar"}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="video-input-row" style={{ marginTop: 10 }}>
        <input
          type="text"
          placeholder={placeholder}
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCrear()}
        />
        <button className="btn-secondary" onClick={handleCrear}>
          Añadir
        </button>
      </div>
    </div>
  );
}

// ---------- Video: detectar tipo de link y armar embed ----------

function parseVideoEmbed(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1);
      return id ? { kind: "iframe", src: `https://www.youtube.com/embed/${id}` } : null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) return { kind: "iframe", src: `https://www.youtube.com/embed/${u.searchParams.get("v")}` };
      if (u.pathname.startsWith("/embed/")) return { kind: "iframe", src: url };
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/")[2];
        return id ? { kind: "iframe", src: `https://www.youtube.com/embed/${id}` } : null;
      }
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id ? { kind: "iframe", src: `https://player.vimeo.com/video/${id}` } : null;
    }
    if (u.hostname.includes("drive.google.com")) {
      const match = u.pathname.match(/\/d\/([^/]+)/);
      if (match) return { kind: "iframe", src: `https://drive.google.com/file/d/${match[1]}/preview` };
    }
    if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(u.pathname)) return { kind: "video", src: url };
    return { kind: "iframe", src: url };
  } catch (e) {
    return null;
  }
}

function GoalMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M4 6 H36 V34" stroke="var(--chalk)" strokeWidth="3" strokeLinecap="square" />
      <path d="M4 6 V34" stroke="var(--chalk)" strokeWidth="3" strokeLinecap="square" />
      <circle cx="14" cy="24" r="2.4" fill="var(--accent-save)" />
    </svg>
  );
}

// ---------- Estilos (misma identidad visual del prototipo original) ----------

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');

:root {
  --bg-deep: #101c14;
  --panel: #17271c;
  --panel-2: #1e3327;
  --chalk: #ECE6D6;
  --chalk-dim: #8FA391;
  --accent-save: #4FB0A0;
  --accent-goal: #C1502E;
  --accent-warn: #E3B23C;
  --muted: #9FB0A2;
}

* { box-sizing: border-box; }

.app {
  font-family: 'IBM Plex Sans', sans-serif;
  background: var(--bg-deep);
  background-image: radial-gradient(circle at 20% 0%, #17301f 0%, var(--bg-deep) 55%);
  color: var(--chalk);
  min-height: 100vh;
  padding: 0 0 28px;
}

.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 16px 12px; border-bottom: 1px solid #2A4432; flex-wrap: wrap; gap: 12px;
  position: sticky; top: 0; background: var(--bg-deep); z-index: 5;
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-text { display: flex; flex-direction: column; line-height: 1.15; }
.brand-title { font-family: 'Oswald', sans-serif; font-weight: 700; letter-spacing: 0.06em; font-size: 17px; }
.brand-sub { font-size: 11px; color: var(--muted); }

.tabs { display: flex; gap: 6px; background: #0C1610; padding: 4px; border-radius: 10px; }
.tab { font-family: 'Oswald', sans-serif; background: transparent; border: none; color: var(--muted);
  padding: 9px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; letter-spacing: 0.02em; }
.tab:hover { color: var(--chalk); }
.tab--active { background: var(--accent-save); color: #08201B; font-weight: 600; }

.main { padding: 16px; max-width: 980px; margin: 0 auto; }

.card { background: var(--panel); border: 1px solid #274031; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
.card h3 { font-family: 'Oswald', sans-serif; font-size: 14px; letter-spacing: 0.03em; margin: 0 0 8px; }

.empty { text-align: center; color: var(--muted); padding: 30px 16px; line-height: 1.6; }
.muted { color: var(--muted); }
.small { font-size: 12.5px; }

.row-between { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }

.field { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--muted); margin-bottom: 12px; }
.field--inline { flex-direction: row; align-items: center; gap: 8px; margin-bottom: 0; }
.field-label { font-size: 12.5px; color: var(--muted); }

input, select, textarea {
  background: #0C1610; border: 1px solid #2A4432; border-radius: 8px; padding: 10px 11px;
  color: var(--chalk); font-family: 'IBM Plex Sans', sans-serif; font-size: 14px; width: 100%;
}
input:focus, select:focus, textarea:focus { outline: 2px solid var(--accent-save); outline-offset: 1px; }

.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; align-items: end; }

.chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.chip-row--grande { gap: 10px; }
.chip {
  background: #0C1610; border: 1px solid #2A4432; color: var(--chalk); padding: 9px 14px;
  border-radius: 999px; font-size: 13.5px; cursor: pointer; display: flex; align-items: center; gap: 6px;
}
.chip:hover { border-color: var(--accent-save); }
.chip--grande { padding: 16px 18px; font-size: 15px; font-weight: 500; border-radius: 14px; flex: 1 1 130px; justify-content: center; }
.chip--save:hover { border-color: var(--accent-save); background: rgba(79,176,160,0.15); }
.chip__count {
  background: var(--accent-save); color: #08201B; border-radius: 999px; font-size: 11px;
  font-weight: 700; padding: 1px 7px; font-family: 'IBM Plex Mono', monospace;
}

.btn-primary {
  font-family: 'Oswald', sans-serif; background: var(--accent-save); color: #08201B; border: none;
  border-radius: 8px; padding: 13px; font-size: 14px; font-weight: 600; cursor: pointer; width: 100%;
}
.btn-secondary {
  font-family: 'Oswald', sans-serif; background: transparent; border: 1px solid var(--accent-save);
  color: var(--accent-save); border-radius: 8px; padding: 0 14px; font-size: 13px; font-weight: 600;
  cursor: pointer; white-space: nowrap;
}
.btn-secondary:hover { background: var(--accent-save); color: #08201B; }
.btn-secondary:disabled { opacity: 0.5; cursor: default; }
.btn-ghost { background: transparent; border: 1px solid #2A4432; color: var(--muted); border-radius: 6px;
  width: 26px; height: 26px; cursor: pointer; flex-shrink: 0; }
.btn-ghost:hover { color: var(--accent-goal); border-color: var(--accent-goal); }
.btn-ghost-text { background: transparent; border: none; color: var(--accent-save); font-size: 12.5px; cursor: pointer; padding: 0; }

.video-input-row { display: flex; gap: 8px; flex-wrap: wrap; }
.video-input-row input { flex: 1; min-width: 120px; }
.video-embed-card { padding-bottom: 10px; }
.video-embed-wrap { position: relative; width: 100%; padding-top: 56.25%; background: #000; border-radius: 8px; overflow: hidden; }
.video-embed-wrap iframe, .video-embed-wrap video { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }

.split-layout { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(300px, 1.3fr); gap: 14px; align-items: start; }
.video-col { display: flex; flex-direction: column; gap: 14px; }
@media (max-width: 760px) { .split-layout { grid-template-columns: 1fr; } }

.mini-resumen { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; margin-top: 6px; }
.mini-resumen__val { display: block; font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 600; }

.lista { display: flex; flex-direction: column; gap: 8px; }
.lista-item { display: flex; justify-content: space-between; align-items: center; gap: 10px;
  border-bottom: 1px solid #22392A; padding-bottom: 8px; }
.lista-item:last-child { border-bottom: none; padding-bottom: 0; }
.lista-item--btn { background: #0C1610; border: 1px solid #2A4432; border-radius: 8px; padding: 10px 12px; cursor: pointer; text-align: left; width: 100%; }
.lista-item--btn:hover { border-color: var(--accent-save); }
.lista-item__title { font-size: 13.5px; font-weight: 500; }

.toast {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: var(--accent-save);
  color: #08201B; padding: 9px 18px; border-radius: 999px; font-size: 13px; font-weight: 600;
  box-shadow: 0 4px 14px rgba(0,0,0,0.35); z-index: 20;
}

.panel-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; margin-bottom: 14px; }
.panel { display: flex; flex-direction: column; }
.kpi-row { display: flex; gap: 10px; }
.kpi { background: var(--panel); border: 1px solid #274031; border-radius: 10px; padding: 10px 14px;
  display: flex; flex-direction: column; align-items: center; min-width: 84px; }
.kpi__value { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 600; }
.kpi__label { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.kpi--mal .kpi__value { color: var(--accent-goal); }

.insight { border-color: var(--accent-warn); }
.insight__col { display: flex; flex-direction: column; gap: 8px; }
.insight__linea { margin: 0; font-size: 13.5px; line-height: 1.5; padding-left: 10px; border-left: 3px solid var(--chalk-dim); }
.insight__linea--mal { border-color: var(--accent-goal); }
.insight__linea--alerta { border-color: var(--accent-warn); }
.insight__linea--ok { border-color: var(--accent-save); }

.tabla { display: flex; flex-direction: column; gap: 8px; }
.tabla-row { display: grid; gap: 10px; align-items: center; font-size: 13px; }
.tabla-row__label { color: var(--chalk); }
.tabla-row__val { font-family: 'IBM Plex Mono', monospace; text-align: right; }

.zona-tabla { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
.zona-tabla__grupo { display: flex; flex-direction: column; gap: 2px; }
.situacion-group__label { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--accent-warn); margin-bottom: 4px; }

.lado-card { text-align: center; }
.bigstat { display: flex; flex-direction: column; align-items: center; gap: 2px; margin-top: 6px; }
.bigstat__pct { font-family: 'IBM Plex Mono', monospace; font-size: 24px; font-weight: 600; }

.mapa-row { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 8px; }
.mapa-row > div { flex: 1 1 260px; min-width: 240px; }
.heatmap__svg { width: 100%; max-width: 420px; margin-top: 6px; }
.heatmap__num { font-family: 'IBM Plex Mono', monospace; font-size: 10px; fill: var(--chalk); }
.heatmap__label { font-family: 'IBM Plex Sans', sans-serif; font-size: 9px; fill: var(--muted); }

@media (max-width: 480px) {
  .kpi-row { flex-wrap: wrap; }
  .mini-resumen { grid-template-columns: repeat(2, 1fr); }
}
`;
