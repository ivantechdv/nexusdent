import type { VisitGalleryItemDto } from '../patient-gallery/patient-gallery.types';

export interface VisitProcedureDto {
  treatmentId: number;
  toothNumber?: number | null;
  quantity?: number;
  notes?: string | null;
}

export interface VisitNextAppointmentDto {
  scheduledAt: string;
  dentistId?: string;
  durationMin?: number;
  reason?: string | null;
  notes?: string | null;
}

export interface CompleteVisitDto {
  patientId: string;
  /** Cita existente a marcar como COMPLETED */
  appointmentId?: string | null;
  /** Paciente llegó sin cita previa */
  walkIn?: boolean;
  dentistId?: string;
  clinicalNotes: string;
  /** Receta / indicaciones post-operatorias */
  prescription?: string | null;
  procedures: VisitProcedureDto[];
  /** Piezas FDI trabajadas en la sesión (odontograma) */
  toothNumbers?: number[];
  /** URLs de archivos del expediente (PDF, documentos) */
  attachmentUrls?: string[];
  /** Fotos clínicas → galería del paciente */
  galleryAttachments?: VisitGalleryItemDto[];
  /** Radiografías → sección de radiografías vinculada a la atención */
  radiographAttachments?: VisitGalleryItemDto[];
  /** Crear/actualizar cobro de la atención (no es un presupuesto) */
  billProcedures?: boolean;
  /** Presupuesto aceptado que esta atención está ejecutando */
  quoteId?: string | null;
  nextAppointment?: VisitNextAppointmentDto | null;
  /** Enviar resumen de la atención al email del paciente (si tiene) */
  notifyPatient?: boolean;
}

export interface CompleteVisitResult {
  evolutions: Array<{ id: string; treatmentId: number | null; toothNumber: number | null }>;
  planId: string | null;
  walkInAppointmentId: string | null;
  nextAppointmentId: string | null;
}

/** Misma forma que completar, sin patientId (sale del registro) ni walkIn. */
export type UpdateVisitDto = Omit<
  CompleteVisitDto,
  'patientId' | 'appointmentId' | 'walkIn'
>;
