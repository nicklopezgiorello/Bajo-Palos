import { useState, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  seedInicial,
  crearArquero,
  crearRival,
  crearSesion,
  actualizarSesion,
  finalizarSesion,
  crearAccion,
  borrarAccion,
  crearCategoriaAccion,
  crearZona,
  renombrar,
  toggleActivo,
} from "./db.js";
import { resumirAcciones, generarObservaciones, calcularAtributos, conteoYPct } from "./stats.js";
import { exportarTodo, importarDesdeArchivo } from "./exportImport.js";

const todayISO = () => new Date().toISOString().slice(0, 10);

// ---------- Capa 1: Interfaz ----------

export default function App() {
  const [listo, setListo] = useState(false);
  const [view, setView] = useState("registrar");
  const [jugadorId, setJugadorId] = useState(() => localStorage.getItem("bp_jugadorId") || "");

  useEffect(() => {
    seedInicial().then(() => setListo(true));
  }, []);
  useEffect(() => {
    if (jugadorId) localStorage.setItem("bp_jugadorId", jugadorId);
  }, [jugadorId]);

  const arqueros = useLiveQuery(() => db.arqueros.filter((a) => a.activo).toArray(), []) || [];
  const rivales = useLiveQuery(() => db.rivales.filter((r) => r.activo).toArray(), []) || [];
  const categorias = useLiveQuery(() => db.categoriasAccion.orderBy("orden").filter((c) => c.activo).toArray(), []) || [];
  const zonas = useLiveQuery(() => db.zonas.orderBy("orden").filter((z) => z.activo).toArray(), []) || [];

  const categoriasPorId = useMemo(() => Object.fromEntries(categorias.map((c) => [c.id, c])), [categorias]);
  const zonasPorId = useMemo(() => Object.fromEntries(zonas.map((z) => [z.id, z])), [zonas]);
  const rivalesPorId = useMemo(() => Object.fromEntries(rivales.map((r) => [r.id, r])), [rivales]);

  // si el jugador activo dejó de existir (desactivado), soltamos la selección
  useEffect(() => {
    if (jugadorId && arqueros.length && !arqueros.find((a) => a.id === jugadorId)) setJugadorId("");
  }, [arqueros, jugadorId]);

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
          <GoalMark size={32} />
          <div className="brand-text">
            <span className="brand-title">BAJO PALOS</span>
            <span className="brand-sub">bitácora de arquero · futsal</span>
          </div>
        </div>
        <nav className="tabs">
          <button
            className={"tab tab--captura" + (view === "registrar" ? " tab--active" : "")}
            onClick={() => setView("registrar")}
          >
            ⚡ Captura
          </button>
          <span className="tabs__divisor" />
          {[
            ["perfil", "Perfil"],
            ["comparar", "Comparar"],
            ["config", "Configuración"],
          ].map(([id, label]) => (
            <button key={id} className={"tab" + (view === id ? " tab--active" : "")} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      {view !== "config" && view !== "comparar" && (
        <div className="jugador-tabs-wrap">
          <JugadorTabs arqueros={arqueros} jugadorId={jugadorId} setJugadorId={setJugadorId} />
        </div>
      )}

      <main className="main">
        {view === "registrar" &&
          (!jugadorId ? (
            <SinJugador arqueros={arqueros} setJugadorId={setJugadorId} />
          ) : (
            <RegistrarView
              jugadorId={jugadorId}
              nombreJugador={arqueros.find((a) => a.id === jugadorId)?.nombre || ""}
              rivales={rivales}
              categorias={categorias}
              categoriasPorId={categoriasPorId}
              zonasPorId={zonasPorId}
              rivalesPorId={rivalesPorId}
            />
          ))}

        {view === "perfil" &&
          (!jugadorId ? (
            <SinJugador arqueros={arqueros} setJugadorId={setJugadorId} />
          ) : (
            <PerfilView
              jugadorId={jugadorId}
              nombreJugador={arqueros.find((a) => a.id === jugadorId)?.nombre || ""}
              categoriasPorId={categoriasPorId}
              zonasPorId={zonasPorId}
              rivalesPorId={rivalesPorId}
            />
          ))}

        {view === "comparar" && <CompararView arqueros={arqueros} categoriasPorId={categoriasPorId} />}

        {view === "config" && (
          <ConfigView arqueros={arqueros} rivales={rivales} categorias={categorias} zonas={zonas} />
        )}
      </main>
    </div>
  );
}

function SinJugador({ arqueros, setJugadorId }) {
  return (
    <div className="empty card">
      {arqueros.length === 0
        ? 'Todavía no cargaste ningún arquero. Andá a "Configuración" para crear el primero.'
        : "Elegí un arquero arriba para empezar."}
    </div>
  );
}

// ---------- Selector de jugador: siempre visible, pestañas grandes ----------

function JugadorTabs({ arqueros, jugadorId, setJugadorId }) {
  if (arqueros.length === 0) return null;
  return (
    <div className="jugador-cards">
      {arqueros.map((a) => {
        const activo = jugadorId === a.id;
        return (
          <button key={a.id} className={"jugador-card" + (activo ? " jugador-card--active" : "")} onClick={() => setJugadorId(a.id)}>
            <span className="jugador-card__nombre">{a.nombre}</span>
            {activo && (
              <span className="jugador-card__estado">
                <span className="dot-activo" /> ACTIVO
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Vista: Registrar (botonera rápida, mobile-first) ----------

function RegistrarView({ jugadorId, nombreJugador, rivales, categorias, categoriasPorId, zonasPorId, rivalesPorId }) {
  const [toast, setToast] = useState(null);
  const [bloqueActivo, setBloqueActivo] = useState(null);

  // sesión activa por jugador: cada jugador recuerda la suya, nunca se mezclan
  const [mapaSesiones, setMapaSesiones] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("bp_sesionActivaPorJugador") || "{}");
    } catch {
      return {};
    }
  });
  const sesionId = mapaSesiones[jugadorId] || "";

  function setSesionId(id) {
    setMapaSesiones((prev) => {
      const next = { ...prev, [jugadorId]: id };
      localStorage.setItem("bp_sesionActivaPorJugador", JSON.stringify(next));
      return next;
    });
  }

  const sesion = useLiveQuery(() => (sesionId ? db.sesiones.get(sesionId) : null), [sesionId]);
  const acciones =
    useLiveQuery(
      () => (sesionId ? db.acciones.where("sesionId").equals(sesionId).reverse().sortBy("creadoEn") : []),
      [sesionId]
    ) || [];

  const resumen = useMemo(() => resumirAcciones(acciones, categoriasPorId), [acciones, categoriasPorId]);

  const bloques = useMemo(() => {
    const orden = ["Atajadas", "Caídas", "Cruces", "Goles", "Saques", "Otras"];
    const presentes = Array.from(new Set(categorias.map((c) => c.grupo)));
    return orden.filter((b) => presentes.includes(b)).concat(presentes.filter((b) => !orden.includes(b)));
  }, [categorias]);

  useEffect(() => {
    if (!bloqueActivo && bloques.length) setBloqueActivo(bloques[0]);
  }, [bloques, bloqueActivo]);

  async function handleTap(categoriaId) {
    await crearAccion({ jugadorId, sesionId, categoriaAccionId: categoriaId });
    setToast(categoriasPorId[categoriaId]?.etiqueta || "Cargado");
    setTimeout(() => setToast(null), 1000);
  }

  async function handleDecrement(categoriaId) {
    const ultima = acciones.find((a) => a.categoriaAccionId === categoriaId);
    if (ultima) await borrarAccion(ultima.id);
  }

  async function handleDeshacer() {
    if (!acciones.length) return;
    await borrarAccion(acciones[0].id);
  }

  async function handleFinalizar() {
    await finalizarSesion(sesionId);
    setSesionId("");
  }

  if (!sesion || sesion.estado === "finalizada") {
    return <NuevaSesionForm jugadorId={jugadorId} nombreJugador={nombreJugador} rivales={rivales} onCreada={(id) => setSesionId(id)} />;
  }

  const categoriasBloque = categorias.filter((c) => c.grupo === bloqueActivo);
  const esGrillaArco = ["Atajadas", "Goles"].includes(bloqueActivo);
  const conZona = esGrillaArco ? categoriasBloque.filter((c) => zonasPorId[c.zonaId]?.grupo === "arco") : [];
  const sinZona = esGrillaArco ? categoriasBloque.filter((c) => !zonasPorId[c.zonaId] || zonasPorId[c.zonaId].grupo !== "arco") : categoriasBloque;
  conZona.sort((a, b) => (zonasPorId[a.zonaId]?.orden ?? 0) - (zonasPorId[b.zonaId]?.orden ?? 0));

  return (
    <div className="captura">
      <div className="captura-hero">
        <span className="captura-hero__nombre">{nombreJugador}</span>
        <span className="captura-hero__estado">
          <span className="dot-activo" /> CAPTURA ACTIVA
        </span>
        <div className="captura-hero__sesion">
          <span>
            {sesion.tipo === "partido" ? "⚽" : "🏋️"}{" "}
            {sesion.tipo === "partido" ? rivalesPorId[sesion.rivalId]?.nombre || "Partido" : "Entrenamiento"}
          </span>
          <span className="muted small">{sesion.fecha}</span>
        </div>
        <button className="captura-hero__finalizar" onClick={handleFinalizar}>
          Finalizar sesión
        </button>
      </div>

      <div className="captura-mini-resumen">
        <span>{resumen.tirosRecibidos} tiros</span>
        <span style={{ color: "var(--accent-goal)" }}>{resumen.golesRecibidos} goles</span>
        <span style={{ color: "var(--accent-save)" }}>{resumen.atajadas} atajadas</span>
        <span>{resumen.tirosRecibidos ? `${resumen.efectividad.pct}%` : "—"} efectividad</span>
      </div>

      <div className="bloque-tabs">
        {bloques.map((b) => (
          <button
            key={b}
            className={"bloque-tab" + (bloqueActivo === b ? " bloque-tab--active" : "")}
            onClick={() => setBloqueActivo(b)}
          >
            {b}
          </button>
        ))}
      </div>

      {bloqueActivo === "Saques" ? (
        <div className="contador-lista">
          {categoriasBloque.map((c) => (
            <Contador
              key={c.id}
              etiqueta={c.etiqueta}
              valor={resumen.porCategoria[c.id] || 0}
              onSumar={() => handleTap(c.id)}
              onRestar={() => handleDecrement(c.id)}
            />
          ))}
        </div>
      ) : esGrillaArco && conZona.length > 0 ? (
        <>
          <div className="arco-grid">
            {conZona.map((c) => (
              <button key={c.id} className={"arco-btn arco-btn--" + c.tono} onClick={() => handleTap(c.id)}>
                {abreviarZona(zonasPorId[c.zonaId]?.etiqueta)}
                {resumen.porCategoria[c.id] ? <span className="accion-btn__count">{resumen.porCategoria[c.id]}</span> : null}
              </button>
            ))}
          </div>
          {sinZona.length > 0 && (
            <div className="accion-grid accion-grid--especiales">
              {sinZona.map((c) => (
                <button key={c.id} className={"accion-btn accion-btn--" + c.tono} onClick={() => handleTap(c.id)}>
                  {c.etiqueta}
                  {resumen.porCategoria[c.id] ? <span className="accion-btn__count">{resumen.porCategoria[c.id]}</span> : null}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="accion-grid">
          {categoriasBloque.map((c) => (
            <button key={c.id} className={"accion-btn accion-btn--" + c.tono} onClick={() => handleTap(c.id)}>
              {c.etiqueta}
              {resumen.porCategoria[c.id] ? <span className="accion-btn__count">{resumen.porCategoria[c.id]}</span> : null}
            </button>
          ))}
        </div>
      )}

      <div className="captura-footer">
        <div className="captura-footer__ultimas">
          {acciones.slice(0, 4).map((a) => (
            <button key={a.id} className="ultima-chip" onClick={() => borrarAccion(a.id)} title="Tocar para borrar">
              {categoriasPorId[a.categoriaAccionId]?.etiqueta || "—"} ✕
            </button>
          ))}
          {acciones.length === 0 && <span className="muted small">Sin acciones todavía</span>}
        </div>
        <button className="captura-footer__deshacer" onClick={handleDeshacer} disabled={!acciones.length}>
          ↩ Deshacer
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function abreviarZona(etq) {
  if (!etq) return "";
  return etq.replace(/izquierda/i, "IZQ").replace(/derecha/i, "DER").toUpperCase();
}

function Contador({ etiqueta, valor, onSumar, onRestar }) {
  return (
    <div className="contador-row">
      <span className="contador-row__etiqueta">{etiqueta}</span>
      <div className="contador-row__controles">
        <button className="contador-btn" onClick={onRestar} disabled={!valor}>
          −
        </button>
        <span className="contador-row__valor">{valor}</span>
        <button className="contador-btn contador-btn--sumar" onClick={onSumar}>
          +
        </button>
      </div>
    </div>
  );
}

function NuevaSesionForm({ jugadorId, nombreJugador, rivales, onCreada }) {
  const [tipo, setTipo] = useState("partido");
  const [fecha, setFecha] = useState(todayISO());
  const [rivalNuevo, setRivalNuevo] = useState("");

  async function handleCrear() {
    let rivalId = null;
    if (tipo === "partido" && rivalNuevo.trim()) {
      const r = await crearRival(rivalNuevo);
      rivalId = r?.id || null;
    }
    const s = await crearSesion({ jugadorId, tipo, fecha, rivalId });
    onCreada(s.id);
  }

  return (
    <div className="captura">
      <div className="captura-hero captura-hero--inactiva">
        <span className="captura-hero__nombre">{nombreJugador}</span>
        <span className="captura-hero__estado captura-hero__estado--inactiva">⚡ CAPTURA RÁPIDA</span>
      </div>
      <div className="card">
        <div className="segmented">
          <button className={"segmented__opt" + (tipo === "partido" ? " segmented__opt--active" : "")} onClick={() => setTipo("partido")}>
            ⚽ Partido
          </button>
          <button
            className={"segmented__opt" + (tipo === "entrenamiento" ? " segmented__opt--active" : "")}
            onClick={() => setTipo("entrenamiento")}
          >
            🏋️ Entrenamiento
          </button>
        </div>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <label className="field">
            <span>Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          {tipo === "partido" && (
            <label className="field">
              <span>Rival</span>
              <input
                type="text"
                list="rivales-lista"
                placeholder="ej. Villa Luro Norte"
                value={rivalNuevo}
                onChange={(e) => setRivalNuevo(e.target.value)}
              />
              <datalist id="rivales-lista">
                {rivales.map((r) => (
                  <option key={r.id} value={r.nombre} />
                ))}
              </datalist>
            </label>
          )}
        </div>
        <button className="btn-primary" onClick={handleCrear}>
          Iniciar captura
        </button>
      </div>
    </div>
  );
}

// ---------- Vista: Perfil (histórico del jugador, análisis después del partido) ----------

function PerfilView({ jugadorId, nombreJugador, categoriasPorId, zonasPorId, rivalesPorId }) {
  const [filtroTipo, setFiltroTipo] = useState("todo"); // todo | partido | entrenamiento

  const semanas =
    useLiveQuery(() => db.semanas.where("jugadorId").equals(jugadorId).reverse().sortBy("fechaInicio"), [jugadorId]) ||
    [];
  const sesiones =
    useLiveQuery(() => db.sesiones.where("jugadorId").equals(jugadorId).toArray(), [jugadorId]) || [];
  const todasLasAcciones =
    useLiveQuery(() => db.acciones.where("jugadorId").equals(jugadorId).toArray(), [jugadorId]) || [];

  const sesionesFiltradas = useMemo(
    () => sesiones.filter((s) => filtroTipo === "todo" || s.tipo === filtroTipo),
    [sesiones, filtroTipo]
  );
  const sesionIdsFiltradas = useMemo(() => new Set(sesionesFiltradas.map((s) => s.id)), [sesionesFiltradas]);
  const acciones = useMemo(
    () => todasLasAcciones.filter((a) => sesionIdsFiltradas.has(a.sesionId)),
    [todasLasAcciones, sesionIdsFiltradas]
  );

  const resumen = useMemo(() => resumirAcciones(acciones, categoriasPorId), [acciones, categoriasPorId]);
  const observaciones = useMemo(() => generarObservaciones(resumen, zonasPorId), [resumen, zonasPorId]);

  const zonasArco = useMemo(
    () => Object.values(zonasPorId).filter((z) => z.grupo === "arco").sort((a, b) => a.orden - b.orden),
    [zonasPorId]
  );

  const partidosCount = sesiones.filter((s) => s.tipo === "partido").length;
  const entrenamientosCount = sesiones.filter((s) => s.tipo === "entrenamiento").length;

  const sesionesPorSemana = useMemo(() => {
    const mapa = {};
    sesionesFiltradas.forEach((s) => {
      if (!mapa[s.semanaId]) mapa[s.semanaId] = [];
      mapa[s.semanaId].push(s);
    });
    Object.values(mapa).forEach((lista) => lista.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)));
    return mapa;
  }, [sesionesFiltradas]);

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'Oswald', sans-serif", margin: 0 }}>{nombreJugador}</h2>
        <div className="segmented">
          {[
            ["todo", "Todo"],
            ["partido", "Partidos"],
            ["entrenamiento", "Entrenamientos"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={"segmented__opt" + (filtroTipo === id ? " segmented__opt--active" : "")}
              onClick={() => setFiltroTipo(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="kpi-row" style={{ flexWrap: "wrap" }}>
        <KPI label="Partidos" value={partidosCount} />
        <KPI label="Entrenamientos" value={entrenamientosCount} />
        <KPI label="Tiros recibidos" value={resumen.tirosRecibidos} />
        <KPI label="Goles recibidos" value={resumen.golesRecibidos} tono="mal" />
        <KPI label="Atajadas" value={resumen.atajadas} />
        <KPI label="Efectividad" value={resumen.tirosRecibidos ? `${resumen.efectividad.pct}%` : "—"} />
      </div>

      {observaciones.length > 0 && (
        <div className="card insight">
          <h3>🔎 Observaciones</h3>
          <div className="insight__col">
            {observaciones.map((o, i) => (
              <p key={i} className={"insight__linea insight__linea--" + o.tono}>
                <strong>{o.titulo}.</strong> {o.texto}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Mapa del arco</h3>
        <div className="mapa-row">
          <div>
            <span className="situacion-group__label">Tiros recibidos por zona</span>
            <GoalHeatmap zonasArco={zonasArco} conteos={resumen.porFamilia.atajada?.porZona || {}} conteosB={resumen.porFamilia.gol?.porZona || {}} totalCategoria={resumen.tirosRecibidos} tono="ok" combinado />
          </div>
          <div>
            <span className="situacion-group__label">Goles recibidos por zona</span>
            <GoalHeatmap zonasArco={zonasArco} conteos={resumen.porFamilia.gol?.porZona || {}} totalCategoria={resumen.golesRecibidos} tono="mal" />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Historial por semana</h3>
        {semanas.length === 0 && <span className="muted small">Todavía no hay sesiones cargadas.</span>}
        <div className="semana-lista">
          {semanas.map((sem) => {
            const items = sesionesPorSemana[sem.id] || [];
            if (!items.length) return null;
            return <SemanaBloque key={sem.id} semana={sem} sesiones={items} rivalesPorId={rivalesPorId} categoriasPorId={categoriasPorId} zonasPorId={zonasPorId} />;
          })}
        </div>
      </div>
    </div>
  );
}

function SemanaBloque({ semana, sesiones, rivalesPorId, categoriasPorId, zonasPorId }) {
  const [abierta, setAbierta] = useState(false);
  const [sesionAbiertaId, setSesionAbiertaId] = useState(null);

  return (
    <div className="semana-bloque">
      <button className="semana-header" onClick={() => setAbierta((v) => !v)}>
        <span>
          📁 Semana {semana.fechaInicio} — {semana.fechaFin}
        </span>
        <span className="muted small">{sesiones.length} sesión{sesiones.length === 1 ? "" : "es"}</span>
      </button>
      {abierta && (
        <div className="semana-contenido">
          {sesiones.map((s) => (
            <div key={s.id}>
              <button className="lista-item--btn" onClick={() => setSesionAbiertaId(sesionAbiertaId === s.id ? null : s.id)}>
                {s.tipo === "partido" ? "⚽" : "🏋️"} {s.fecha} {s.rivalId ? `vs ${rivalesPorId[s.rivalId]?.nombre || ""}` : ""}
              </button>
              {sesionAbiertaId === s.id && (
                <SesionDetalle sesion={s} categoriasPorId={categoriasPorId} zonasPorId={zonasPorId} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SesionDetalle({ sesion, categoriasPorId, zonasPorId }) {
  const acciones = useLiveQuery(() => db.acciones.where("sesionId").equals(sesion.id).reverse().sortBy("creadoEn"), [sesion.id]) || [];
  const resumen = useMemo(() => resumirAcciones(acciones, categoriasPorId), [acciones, categoriasPorId]);

  return (
    <div className="sesion-detalle">
      <div className="mini-resumen">
        <div>
          <span className="mini-resumen__val">{resumen.tirosRecibidos}</span>
          <span className="small muted">tiros</span>
        </div>
        <div>
          <span className="mini-resumen__val" style={{ color: "var(--accent-goal)" }}>{resumen.golesRecibidos}</span>
          <span className="small muted">goles</span>
        </div>
        <div>
          <span className="mini-resumen__val" style={{ color: "var(--accent-save)" }}>{resumen.atajadas}</span>
          <span className="small muted">atajadas</span>
        </div>
        <div>
          <span className="mini-resumen__val">{resumen.tirosRecibidos ? `${resumen.efectividad.pct}%` : "—"}</span>
          <span className="small muted">efectividad</span>
        </div>
      </div>
      <div className="lista" style={{ marginTop: 10 }}>
        {acciones.map((a) => (
          <div key={a.id} className="lista-item">
            <span className="small">{categoriasPorId[a.categoriaAccionId]?.etiqueta || "—"}</span>
          </div>
        ))}
        {acciones.length === 0 && <span className="muted small">Sin acciones cargadas en esta sesión.</span>}
      </div>
    </div>
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

// ---------- Vista: Comparar (rombo de atributos entre dos arqueros) ----------

const EJES_RADAR = ["Atajadas", "Caídas", "Cruces", "Salidas", "Saques", "Volumen"];

function CompararView({ arqueros, categoriasPorId }) {
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");

  const accionesA = useLiveQuery(() => (idA ? db.acciones.where("jugadorId").equals(idA).toArray() : []), [idA]) || [];
  const accionesB = useLiveQuery(() => (idB ? db.acciones.where("jugadorId").equals(idB).toArray() : []), [idB]) || [];

  const atributosA = useMemo(() => (idA ? calcularAtributos(accionesA, categoriasPorId) : null), [accionesA, categoriasPorId, idA]);
  const atributosB = useMemo(() => (idB ? calcularAtributos(accionesB, categoriasPorId) : null), [accionesB, categoriasPorId, idB]);

  return (
    <div>
      <div className="card">
        <h3>Comparar arqueros</h3>
        <p className="muted small">Elegí dos arqueros. Los atributos se calculan a partir de lo cargado — si falta muestra, aparece N/D.</p>
        <div className="form-grid">
          <label className="field">
            <span>Arquero A</span>
            <select value={idA} onChange={(e) => setIdA(e.target.value)}>
              <option value="">— elegir —</option>
              {arqueros.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Arquero B</span>
            <select value={idB} onChange={(e) => setIdB(e.target.value)}>
              <option value="">— elegir —</option>
              {arqueros.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {atributosA && atributosB && (
        <div className="card">
          <RadarChart
            nombreA={arqueros.find((a) => a.id === idA)?.nombre}
            nombreB={arqueros.find((a) => a.id === idB)?.nombre}
            atributosA={atributosA}
            atributosB={atributosB}
          />
          <div className="radar-leyenda">
            <span><span className="radar-dot radar-dot--a" /> {arqueros.find((a) => a.id === idA)?.nombre}</span>
            <span><span className="radar-dot radar-dot--b" /> {arqueros.find((a) => a.id === idB)?.nombre}</span>
          </div>
          <div className="tabla" style={{ marginTop: 12 }}>
            {EJES_RADAR.map((eje) => (
              <div key={eje} className="tabla-row" style={{ gridTemplateColumns: "1fr auto auto" }}>
                <span className="tabla-row__label">{eje}</span>
                <span className="tabla-row__val">{atributosA[eje] == null ? "N/D" : `${atributosA[eje]}%`}</span>
                <span className="tabla-row__val">{atributosB[eje] == null ? "N/D" : `${atributosB[eje]}%`}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RadarChart({ atributosA, atributosB, nombreA, nombreB }) {
  const size = 280;
  const centro = size / 2;
  const radio = size / 2 - 40;
  const n = EJES_RADAR.length;

  const puntoEje = (i, valorPct) => {
    const angulo = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (radio * Math.max(0, valorPct || 0)) / 100;
    return [centro + r * Math.cos(angulo), centro + r * Math.sin(angulo)];
  };
  const puntoEtiqueta = (i) => {
    const angulo = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [centro + (radio + 26) * Math.cos(angulo), centro + (radio + 26) * Math.sin(angulo)];
  };

  const poligono = (atributos) => EJES_RADAR.map((eje, i) => puntoEje(i, atributos[eje])).map((p) => p.join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar-svg">
      {[0.33, 0.66, 1].map((f) => (
        <polygon
          key={f}
          points={EJES_RADAR.map((_, i) => puntoEje(i, 100 * f).join(",")).join(" ")}
          fill="none"
          stroke="var(--chalk-dim)"
          strokeOpacity="0.35"
        />
      ))}
      {EJES_RADAR.map((_, i) => {
        const [x, y] = puntoEje(i, 100);
        return <line key={i} x1={centro} y1={centro} x2={x} y2={y} stroke="var(--chalk-dim)" strokeOpacity="0.35" />;
      })}
      <polygon points={poligono(atributosA)} fill="var(--accent-save)" fillOpacity="0.3" stroke="var(--accent-save)" strokeWidth="2" />
      <polygon points={poligono(atributosB)} fill="var(--accent-goal)" fillOpacity="0.25" stroke="var(--accent-goal)" strokeWidth="2" />
      {EJES_RADAR.map((eje, i) => {
        const [x, y] = puntoEtiqueta(i);
        const sinDatoA = atributosA[eje] == null;
        const sinDatoB = atributosB[eje] == null;
        return (
          <text key={eje} x={x} y={y} textAnchor="middle" className={"radar__label" + (sinDatoA && sinDatoB ? " radar__label--nd" : "")}>
            {eje}
            {sinDatoA && sinDatoB ? " (N/D)" : ""}
          </text>
        );
      })}
    </svg>
  );
}

// ---------- Mapa del arco (heatmap) ----------

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
            <rect x={x} y={y} width={cellW - 2} height={cellH - 2} rx="4" fill="var(--panel-2)" stroke="var(--chalk-dim)" strokeWidth={n ? 1.5 : 0.5} opacity={n ? 0.3 + 0.5 * intensity : 0.35} />
            {n > 0 && (
              <rect x={x} y={y} width={cellW - 2} height={cellH - 2} rx="4" fill={tono === "mal" ? "var(--accent-goal)" : "var(--accent-save)"} opacity={0.2 + intensity * 0.55} />
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

// ---------- Vista: Configuración ----------

function ConfigView({ arqueros, rivales, categorias, zonas }) {
  const [tab, setTab] = useState("arqueros");
  const [msg, setMsg] = useState("");

  async function handleExportar() {
    await exportarTodo();
  }
  async function handleImportar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importarDesdeArchivo(file);
      setMsg("Backup importado correctamente.");
    } catch (err) {
      setMsg("No se pudo importar: " + err.message);
    }
    e.target.value = "";
  }

  return (
    <div>
      <div className="chip-row" style={{ marginBottom: 14 }}>
        {["arqueros", "rivales", "categorias", "zonas"].map((t) => (
          <button key={t} className={"chip" + (tab === t ? " chip--active" : "")} onClick={() => setTab(t)}>
            {t === "arqueros" ? "Arqueros" : t === "rivales" ? "Rivales" : t === "categorias" ? "Botonera" : "Zonas"}
          </button>
        ))}
      </div>

      {tab === "arqueros" && <ConfigListaSimple tabla="arqueros" items={arqueros} onCrear={crearArquero} placeholder="Nombre del arquero" />}
      {tab === "rivales" && <ConfigListaSimple tabla="rivales" items={rivales} onCrear={crearRival} placeholder="Nombre del rival" />}
      {tab === "categorias" && <ConfigCategorias categorias={categorias} zonas={zonas} />}
      {tab === "zonas" && <ConfigZonas zonas={zonas} />}

      <div className="card">
        <h3>Backup</h3>
        <p className="muted small">Los datos viven en este navegador. Exportá seguido para no perder nada.</p>
        <div className="form-grid">
          <button className="btn-secondary" onClick={handleExportar}>
            Exportar todo (.json)
          </button>
          <label className="btn-secondary" style={{ textAlign: "center", cursor: "pointer" }}>
            Importar backup
            <input type="file" accept="application/json" onChange={handleImportar} style={{ display: "none" }} />
          </label>
        </div>
        {msg && <p className="small muted" style={{ marginTop: 8 }}>{msg}</p>}
      </div>
    </div>
  );
}

function ConfigListaSimple({ tabla, items, onCrear, placeholder }) {
  const [nombre, setNombre] = useState("");
  return (
    <div className="card">
      <div className="video-input-row" style={{ marginBottom: 12 }}>
        <input type="text" placeholder={placeholder} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <button
          className="btn-secondary"
          onClick={async () => {
            if (!nombre.trim()) return;
            await onCrear(nombre);
            setNombre("");
          }}
        >
          Agregar
        </button>
      </div>
      <div className="lista">
        {items.map((it) => (
          <ConfigFila key={it.id} tabla={tabla} item={it} etiqueta={it.nombre} />
        ))}
        {items.length === 0 && <span className="muted small">Todavía no hay nada cargado.</span>}
      </div>
    </div>
  );
}

function ConfigFila({ tabla, item, etiqueta }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(etiqueta);
  return (
    <div className="lista-item">
      {editando ? (
        <input value={valor} onChange={(e) => setValor(e.target.value)} style={{ width: "auto", flex: 1 }} />
      ) : (
        <span className="small">{etiqueta}</span>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        {editando ? (
          <button
            className="btn-ghost-text"
            onClick={async () => {
              await renombrar(tabla, item.id, valor);
              setEditando(false);
            }}
          >
            Guardar
          </button>
        ) : (
          <button className="btn-ghost-text" onClick={() => setEditando(true)}>
            Renombrar
          </button>
        )}
        <button className="btn-ghost-text" onClick={() => toggleActivo(tabla, item.id, false)}>
          Desactivar
        </button>
      </div>
    </div>
  );
}

function ConfigCategorias({ categorias, zonas }) {
  const [etiqueta, setEtiqueta] = useState("");
  const [grupo, setGrupo] = useState("Otras");
  const [familia, setFamilia] = useState("otra");
  const [tono, setTono] = useState("neutral");
  const [zonaId, setZonaId] = useState("");

  const porGrupo = useMemo(() => {
    const m = {};
    categorias.forEach((c) => {
      if (!m[c.grupo]) m[c.grupo] = [];
      m[c.grupo].push(c);
    });
    return m;
  }, [categorias]);

  return (
    <div className="card">
      <h3>Agregar botón nuevo</h3>
      <div className="form-grid">
        <label className="field">
          <span>Etiqueta</span>
          <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="ej. Tiro tras pase atrás" />
        </label>
        <label className="field">
          <span>Bloque</span>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            {["Atajadas", "Caídas", "Cruces", "Goles", "Saques", "Otras"].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Cuenta como</span>
          <select value={tono} onChange={(e) => setTono(e.target.value)}>
            <option value="positivo">Resuelto bien</option>
            <option value="gol">Gol recibido</option>
            <option value="negativo">Resuelto mal</option>
            <option value="neutral">Solo frecuencia (no afecta efectividad)</option>
          </select>
        </label>
        <label className="field">
          <span>Zona asociada (opcional)</span>
          <select value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
            <option value="">— sin zona —</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>{z.etiqueta}</option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="btn-primary"
        onClick={async () => {
          if (!etiqueta.trim()) return;
          const fam = familia.trim() || grupo.toLowerCase();
          await crearCategoriaAccion({ etiqueta, grupo, familia: fam, zonaId, tono });
          setEtiqueta("");
        }}
      >
        Agregar botón
      </button>

      <h3 style={{ marginTop: 20 }}>Botones actuales</h3>
      {Object.entries(porGrupo).map(([g, items]) => (
        <div key={g} style={{ marginBottom: 10 }}>
          <span className="situacion-group__label">{g}</span>
          <div className="lista">
            {items.map((it) => (
              <ConfigFila key={it.id} tabla="categoriasAccion" item={it} etiqueta={it.etiqueta} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfigZonas({ zonas }) {
  const [etiqueta, setEtiqueta] = useState("");
  return (
    <div className="card">
      <div className="video-input-row" style={{ marginBottom: 12 }}>
        <input type="text" placeholder="ej. Zona segundo palo" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} />
        <button
          className="btn-secondary"
          onClick={async () => {
            if (!etiqueta.trim()) return;
            await crearZona({ etiqueta, grupo: "especial" });
            setEtiqueta("");
          }}
        >
          Agregar
        </button>
      </div>
      <div className="lista">
        {zonas.map((z) => (
          <ConfigFila key={z.id} tabla="zonas" item={z} etiqueta={z.etiqueta} />
        ))}
      </div>
    </div>
  );
}

// ---------- Icono del arco ----------

function GoalMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M4 6 H36 V34" stroke="var(--chalk)" strokeWidth="3" strokeLinecap="square" />
      <path d="M4 6 V34" stroke="var(--chalk)" strokeWidth="3" strokeLinecap="square" />
      <circle cx="14" cy="24" r="2.4" fill="var(--accent-save)" />
    </svg>
  );
}

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

/* ---- selector de jugador (pestañas grandes, siempre visible) ---- */
.jugador-tabs-wrap { padding: 12px 16px 0; max-width: 980px; margin: 0 auto; }
.jugador-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.jugador-tab {
  font-family: 'Oswald', sans-serif; background: var(--panel); border: 1px solid #2A4432; color: var(--chalk);
  padding: 12px 20px; border-radius: 12px; font-size: 15px; font-weight: 600; letter-spacing: 0.02em; cursor: pointer;
}
.jugador-tab:hover { border-color: var(--accent-save); }
.jugador-tab--active { background: var(--accent-save); color: #08201B; border-color: var(--accent-save); }

/* ---- sesión activa ---- */
.sesion-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.sesion-header__tipo { font-family: 'Oswald', sans-serif; font-weight: 700; letter-spacing: 0.03em; font-size: 15px; }
.mini-resumen-card { padding-bottom: 10px; }

.btn-deshacer {
  width: 100%; font-family: 'Oswald', sans-serif; background: var(--panel); border: 1px solid var(--accent-warn);
  color: var(--accent-warn); border-radius: 10px; padding: 12px; font-size: 14px; font-weight: 600; cursor: pointer;
  margin-bottom: 14px;
}
.btn-deshacer:hover { background: rgba(227,178,60,0.12); }
.btn-deshacer:disabled { opacity: 0.4; cursor: default; }

/* ---- botonera por bloques ---- */
.bloque-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.accion-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
.accion-btn {
  position: relative; font-family: 'IBM Plex Sans', sans-serif; background: var(--panel); border: 1px solid #2A4432;
  color: var(--chalk); border-radius: 12px; padding: 16px 10px; font-size: 13.5px; font-weight: 500; cursor: pointer;
  min-height: 64px; text-align: center;
}
.accion-btn:active { transform: scale(0.97); }
.accion-btn--positivo:hover { border-color: var(--accent-save); }
.accion-btn--gol:hover { border-color: var(--accent-goal); }
.accion-btn--negativo:hover { border-color: var(--accent-goal); }
.accion-btn--neutral:hover { border-color: var(--chalk-dim); }
.accion-btn__count {
  position: absolute; top: -6px; right: -6px; background: var(--accent-save); color: #08201B; border-radius: 999px;
  font-size: 11px; font-weight: 700; padding: 2px 7px; font-family: 'IBM Plex Mono', monospace;
}

/* ---- segmented control (tipo partido/entrenamiento, filtros) ---- */
.segmented { display: flex; border: 1px solid #2A4432; border-radius: 8px; overflow: hidden; }
.segmented__opt {
  flex: 1; background: #0C1610; border: none; color: var(--chalk); padding: 9px 10px; font-size: 12.5px;
  cursor: pointer; border-right: 1px solid #2A4432; font-family: 'IBM Plex Sans', sans-serif;
}
.segmented__opt:last-child { border-right: none; }
.segmented__opt--active { background: var(--accent-save); color: #08201B; font-weight: 600; }

/* ---- historial por semana ---- */
.semana-lista { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.semana-bloque { border: 1px solid #22392A; border-radius: 10px; overflow: hidden; }
.semana-header {
  width: 100%; display: flex; justify-content: space-between; align-items: center; background: #0C1610;
  border: none; color: var(--chalk); padding: 12px 14px; font-family: 'Oswald', sans-serif; font-size: 13.5px;
  cursor: pointer; text-align: left;
}
.semana-contenido { padding: 10px 14px 14px; display: flex; flex-direction: column; gap: 8px; }
.sesion-detalle { background: #0C1610; border-radius: 8px; padding: 10px 12px; margin-top: 6px; }

/* ---- comparador / radar ---- */
.radar-svg { width: 100%; max-width: 320px; display: block; margin: 0 auto; }
.radar__label { font-family: 'IBM Plex Sans', sans-serif; font-size: 10px; fill: var(--chalk); }
.radar__label--nd { fill: var(--muted); font-style: italic; }
.radar-leyenda { display: flex; justify-content: center; gap: 20px; margin-top: 8px; font-size: 12.5px; }
.radar-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
.radar-dot--a { background: var(--accent-save); }
.radar-dot--b { background: var(--accent-goal); }

/* ================================================================
   MODO CAPTURA — visualmente distinto del modo análisis: máxima
   superficie táctil, mínima lectura, identificación del jugador
   siempre a la vista.
   ================================================================ */

.tab--captura { background: rgba(79,176,160,0.12); border: 1px solid var(--accent-save); color: var(--accent-save); }
.tab--captura.tab--active { background: var(--accent-save); color: #08201B; }
.tabs__divisor { width: 1px; align-self: stretch; background: #2A4432; margin: 2px 2px; }

/* pestañas grandes de jugador, estilo tarjeta */
.jugador-cards { display: flex; gap: 8px; flex-wrap: wrap; }
.jugador-card {
  font-family: 'Oswald', sans-serif; background: var(--panel); border: 2px solid #2A4432; color: var(--chalk);
  padding: 12px 22px; border-radius: 14px; font-size: 15px; font-weight: 700; letter-spacing: 0.03em; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 120px;
}
.jugador-card:hover { border-color: var(--accent-save); }
.jugador-card--active { border-color: var(--accent-save); background: rgba(79,176,160,0.12); box-shadow: 0 0 0 1px var(--accent-save); }
.jugador-card__estado {
  font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.08em; color: var(--accent-save);
  display: flex; align-items: center; gap: 4px;
}
.dot-activo { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-save); display: inline-block; box-shadow: 0 0 6px var(--accent-save); }

.captura { display: flex; flex-direction: column; }

.captura-hero {
  background: linear-gradient(135deg, #17301f, var(--panel));
  border: 1px solid var(--accent-save); border-radius: 16px; padding: 22px 20px; text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 14px; position: relative;
}
.captura-hero--inactiva { border-color: #2A4432; background: var(--panel); }
.captura-hero__nombre { font-family: 'Oswald', sans-serif; font-size: 28px; font-weight: 700; letter-spacing: 0.03em; }
.captura-hero__estado {
  font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.1em; color: var(--accent-save);
  display: flex; align-items: center; gap: 6px;
}
.captura-hero__estado--inactiva { color: var(--accent-warn); }
.captura-hero__sesion { display: flex; gap: 10px; align-items: baseline; font-size: 15px; margin-top: 4px; }
.captura-hero__finalizar {
  position: absolute; top: 14px; right: 14px; background: transparent; border: 1px solid #2A4432; color: var(--muted);
  border-radius: 8px; padding: 6px 12px; font-size: 11px; cursor: pointer; font-family: 'IBM Plex Sans', sans-serif;
}
.captura-hero__finalizar:hover { border-color: var(--accent-goal); color: var(--accent-goal); }

.captura-mini-resumen {
  display: flex; justify-content: space-around; flex-wrap: wrap; gap: 6px; font-family: 'IBM Plex Mono', monospace;
  font-size: 12px; color: var(--chalk); background: var(--panel); border: 1px solid #22392A; border-radius: 10px;
  padding: 8px 10px; margin-bottom: 14px;
}

.bloque-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.bloque-tab {
  font-family: 'Oswald', sans-serif; background: var(--panel); border: 1px solid #2A4432; color: var(--chalk);
  padding: 10px 18px; border-radius: 999px; font-size: 13.5px; font-weight: 600; cursor: pointer; letter-spacing: 0.02em;
}
.bloque-tab--active { background: var(--accent-save); color: #08201B; border-color: var(--accent-save); }

/* grilla con forma de arco para Atajadas / Goles */
.arco-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 10px; border: 3px solid var(--chalk);
  border-bottom: none; border-radius: 6px 6px 0 0; background: rgba(255,255,255,0.02); margin-bottom: 10px;
}
.arco-btn {
  position: relative; font-family: 'Oswald', sans-serif; background: var(--panel); border: 1px solid #2A4432;
  color: var(--chalk); border-radius: 10px; padding: 22px 6px; font-size: 13px; font-weight: 600; cursor: pointer;
  text-transform: uppercase; letter-spacing: 0.02em; min-height: 64px;
}
.arco-btn:active { transform: scale(0.96); }
.arco-btn--positivo:hover, .arco-btn--positivo:active { border-color: var(--accent-save); background: rgba(79,176,160,0.15); }
.arco-btn--gol:hover, .arco-btn--gol:active { border-color: var(--accent-goal); background: rgba(193,80,46,0.15); }
.accion-grid--especiales { margin-top: 4px; }

/* contadores +/- para acciones de volumen (saques, etc.) */
.contador-lista { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.contador-row {
  display: flex; justify-content: space-between; align-items: center; background: var(--panel);
  border: 1px solid #2A4432; border-radius: 12px; padding: 10px 14px;
}
.contador-row__etiqueta { font-size: 14px; font-weight: 500; }
.contador-row__controles { display: flex; align-items: center; gap: 14px; }
.contador-btn {
  width: 44px; height: 44px; border-radius: 10px; border: 1px solid #2A4432; background: #0C1610; color: var(--chalk);
  font-size: 22px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.contador-btn:disabled { opacity: 0.3; cursor: default; }
.contador-btn--sumar { border-color: var(--accent-save); color: var(--accent-save); }
.contador-btn--sumar:hover { background: var(--accent-save); color: #08201B; }
.contador-row__valor { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 600; min-width: 24px; text-align: center; }

/* pie fijo de la captura: últimas acciones + deshacer, siempre accesible */
.captura-footer {
  position: sticky; bottom: 8px; display: flex; align-items: center; gap: 10px; background: var(--panel);
  border: 1px solid #2A4432; border-radius: 12px; padding: 8px 10px; margin-top: 6px;
}
.captura-footer__ultimas { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; overflow: hidden; }
.ultima-chip {
  font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; background: #0C1610; border: 1px solid #2A4432;
  color: var(--muted); padding: 4px 8px; border-radius: 999px; cursor: pointer; white-space: nowrap;
}
.ultima-chip:hover { border-color: var(--accent-goal); color: var(--accent-goal); }
.captura-footer__deshacer {
  font-family: 'Oswald', sans-serif; background: var(--accent-warn); color: #2A1F03; border: none; border-radius: 10px;
  padding: 10px 16px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.captura-footer__deshacer:disabled { opacity: 0.35; cursor: default; }

@media (max-width: 480px) {
  .captura-hero__nombre { font-size: 24px; }
  .arco-btn { padding: 18px 4px; font-size: 11.5px; min-height: 56px; }
  .jugador-card { padding: 10px 16px; min-width: 100px; }
}
`;
