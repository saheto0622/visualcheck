export const LENS_TYPES = [
  { id: "sv",   label: "Visión sencilla",              precio: 80000 },
  { id: "prog", label: "Progresivos",                  precio: 250000 },
  { id: "ar_sv", label: "Antirreflejo (sencilla)",     precio: 120000 },
  { id: "ar_p",  label: "Antirreflejo (progresivo)",   precio: 290000 },
];

export const BLUE_FILTER_EXTRA = { label: "Filtro luz azul", precio: 40000 };

export function calcTotal(precioMontura, lensId, conFiltroAzul) {
  const lens = LENS_TYPES.find((l) => l.id === lensId);
  const base = precioMontura + (lens?.precio ?? 0);
  return base + (conFiltroAzul ? BLUE_FILTER_EXTRA.precio : 0);
}
