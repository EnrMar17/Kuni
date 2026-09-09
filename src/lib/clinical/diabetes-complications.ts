export const DIABETES_COMPLICATIONS = [
  {
    code: "E110",
    label: "Con coma",
    description:
      "Diabetes tipo 2 asociada a coma diabético, incluido el estado hiperosmolar o hiperglucémico.",
    modelSeverity: "high",
  },
  {
    code: "E111",
    label: "Con cetoacidosis",
    description:
      "Diabetes tipo 2 con acidosis o cetoacidosis, sin mención de coma.",
    modelSeverity: "high",
  },
  {
    code: "E112",
    label: "Con complicaciones renales",
    description:
      "Afectación renal atribuida a la diabetes, por ejemplo nefropatía diabética.",
    modelSeverity: "high",
  },
  {
    code: "E113",
    label: "Con complicaciones oftálmicas",
    description:
      "Afectación ocular atribuida a la diabetes, por ejemplo retinopatía o catarata diabética.",
    modelSeverity: "standard",
  },
  {
    code: "E114",
    label: "Con complicaciones neurológicas",
    description:
      "Afectación neurológica atribuida a la diabetes, por ejemplo neuropatía diabética.",
    modelSeverity: "standard",
  },
  {
    code: "E115",
    label: "Con complicaciones circulatorias periféricas",
    description:
      "Afectación de la circulación periférica atribuida a la diabetes.",
    modelSeverity: "standard",
  },
  {
    code: "E116",
    label: "Con otras complicaciones especificadas",
    description:
      "Otra complicación diabética identificada que no corresponde a las categorías anteriores.",
    modelSeverity: "standard",
  },
  {
    code: "E117",
    label: "Con complicaciones múltiples",
    description:
      "Hay más de un tipo de complicación diabética documentada en el diagnóstico.",
    modelSeverity: "standard",
  },
  {
    code: "E118",
    label: "Con complicaciones no especificadas",
    description:
      "Existe una complicación diabética documentada, pero su tipo no quedó especificado.",
    modelSeverity: "standard",
  },
  {
    code: "E119",
    label: "Sin complicaciones documentadas",
    description:
      "El expediente fue revisado y no se identificaron complicaciones diabéticas vigentes.",
    modelSeverity: "none",
  },
] as const;

export type DiabetesComplicationCode =
  (typeof DIABETES_COMPLICATIONS)[number]["code"];

export const DIABETES_COMPLICATION_CODES = DIABETES_COMPLICATIONS.map(
  ({ code }) => code,
) as [DiabetesComplicationCode, ...DiabetesComplicationCode[]];

export const DIABETES_COMPLICATION_BY_CODE = Object.fromEntries(
  DIABETES_COMPLICATIONS.map((item) => [item.code, item]),
) as Record<DiabetesComplicationCode, (typeof DIABETES_COMPLICATIONS)[number]>;

export function isDiabetesComplicationCode(
  code: string,
): code is DiabetesComplicationCode {
  return code in DIABETES_COMPLICATION_BY_CODE;
}

export function isDocumentedDiabetesComplication(
  code: DiabetesComplicationCode,
) {
  return code !== "E119";
}
