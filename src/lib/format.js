// ─── Validation status (optometrist formula workflow) ─────────────────────────
export const VALIDACION_INFO = {
  "pendiente":   { bg: "var(--color-background-secondary)", c: "var(--color-text-tertiary)", label: "Pendiente" },
  "en revision": { bg: "var(--color-background-info)",      c: "var(--color-text-info)",      label: "En revisión" },
  "validada":    { bg: "var(--color-background-success)",   c: "var(--color-text-success)",   label: "Validada" },
};

// ─── Risk helper ──────────────────────────────────────────────────────────────
export function getRisk(lR, rR, as, qS) {
  if (lR > 55 || rR > 55 || as > 60 || qS > 65)
    return { label: "Requiere atención", tc: "var(--color-text-danger)",  bc: "var(--color-background-danger)" };
  if (lR > 22 || rR > 22 || as > 28 || qS > 32)
    return { label: "Riesgo moderado",   tc: "var(--color-text-warning)", bc: "var(--color-background-warning)" };
  return   { label: "Bajo riesgo",       tc: "var(--color-text-success)", bc: "var(--color-background-success)" };
}

// ─── Supabase row <-> app object mapping ──────────────────────────────────────
export function toDb(r) {
  return {
    id: r.id, fecha: r.fecha, nombre: r.nombre, cedula: r.cedula,
    direccion: r.direccion, correo: r.correo, celular: r.celular,
    overall: r.overall, left_red: r.leftRed, right_red: r.rightRed,
    asym: r.asym, q_score: r.qScore, riesgo: r.riesgo, estado: r.estado,
    acuidad: r.acuidad, astigmatismo: r.astigmatismo, vision_cerca: r.visionCerca,
    optometrista_id: r.optometristaId, optometrista_nombre: r.optometristaNombre,
    estado_validacion: r.estadoValidacion,
    esfera_od: r.esferaOd, cilindro_od: r.cilindroOd, eje_od: r.ejeOd, adicion_od: r.adicionOd,
    esfera_oi: r.esferaOi, cilindro_oi: r.cilindroOi, eje_oi: r.ejeOi, adicion_oi: r.adicionOi,
    observaciones_optometra: r.observacionesOptometra, validado_en: r.validadoEn,
  };
}

export function fromDb(row) {
  return {
    id: row.id, fecha: row.fecha, nombre: row.nombre, cedula: row.cedula,
    direccion: row.direccion, correo: row.correo, celular: row.celular,
    overall: row.overall, leftRed: row.left_red, rightRed: row.right_red,
    asym: row.asym, qScore: row.q_score, riesgo: row.riesgo, estado: row.estado,
    acuidad: row.acuidad, astigmatismo: row.astigmatismo, visionCerca: row.vision_cerca,
    optometristaId: row.optometrista_id, optometristaNombre: row.optometrista_nombre,
    estadoValidacion: row.estado_validacion,
    esferaOd: row.esfera_od, cilindroOd: row.cilindro_od, ejeOd: row.eje_od, adicionOd: row.adicion_od,
    esferaOi: row.esfera_oi, cilindroOi: row.cilindro_oi, ejeOi: row.eje_oi, adicionOi: row.adicion_oi,
    observacionesOptometra: row.observaciones_optometra, validadoEn: row.validado_en,
  };
}
