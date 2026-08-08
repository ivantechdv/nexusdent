/** Catálogo base NexusDent — se usa si no hay clínica plantilla con datos */

export const DEFAULT_TREATMENT_CATEGORIES: Array<{
  code: string;
  name: string;
  sortOrder: number;
}> = [
  { code: 'GENERAL', name: 'General', sortOrder: 1 },
  { code: 'ENDODONCIA', name: 'Endodoncia', sortOrder: 2 },
  { code: 'CIRUGIA', name: 'Cirugía', sortOrder: 3 },
  { code: 'ORTODONCIA', name: 'Ortodoncia', sortOrder: 4 },
  { code: 'PERIODONCIA', name: 'Periodoncia', sortOrder: 5 },
  { code: 'PROTESIS', name: 'Prótesis', sortOrder: 6 },
  { code: 'RADIOLOGIA', name: 'Radiología', sortOrder: 7 },
];

export const DEFAULT_TREATMENT_CATALOG: Array<{
  code: string;
  name: string;
  category: string;
  basePrice: number;
  description?: string | null;
}> = [
  {
    code: 'EXA-001',
    name: 'Examen clínico inicial',
    category: 'GENERAL',
    basePrice: 25,
  },
  {
    code: 'RAD-001',
    name: 'Examen radiográfico (periapical)',
    category: 'RADIOLOGIA',
    basePrice: 15,
  },
  {
    code: 'RAD-002',
    name: 'Ortopantomografía',
    category: 'RADIOLOGIA',
    basePrice: 45,
  },
  {
    code: 'GEN-001',
    name: 'Detartraje / Limpieza dental',
    category: 'PERIODONCIA',
    basePrice: 40,
  },
  {
    code: 'GEN-002',
    name: 'Resina / Calza (1 cara)',
    category: 'GENERAL',
    basePrice: 50,
  },
  {
    code: 'GEN-003',
    name: 'Resina / Calza (2+ caras)',
    category: 'GENERAL',
    basePrice: 75,
  },
  {
    code: 'END-001',
    name: 'Endodoncia unirradicular',
    category: 'ENDODONCIA',
    basePrice: 180,
  },
  {
    code: 'END-002',
    name: 'Endodoncia multirradicular',
    category: 'ENDODONCIA',
    basePrice: 280,
  },
  {
    code: 'CIR-001',
    name: 'Exodoncia simple',
    category: 'CIRUGIA',
    basePrice: 60,
  },
  {
    code: 'CIR-002',
    name: 'Exodoncia de cordal (tercer molar)',
    category: 'CIRUGIA',
    basePrice: 150,
  },
  {
    code: 'ORT-001',
    name: 'Consulta ortodoncia',
    category: 'ORTODONCIA',
    basePrice: 35,
  },
  {
    code: 'ORT-002',
    name: 'Instalación brackets (arco)',
    category: 'ORTODONCIA',
    basePrice: 450,
  },
  {
    code: 'PRO-001',
    name: 'Corona unitaria',
    category: 'PROTESIS',
    basePrice: 320,
  },
];
