import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarPlus,
  Check,
  FileUp,
  Mail,
  Minus,
  Plus,
  Search,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { MiniMonthPicker } from '@/components/MiniMonthPicker';
import { MoneyAmount } from '@/components/MoneyAmount';
import { PaymentFxFields } from '@/components/PaymentFxFields';
import {
  PaymentSplitsFields,
  newSplitLine,
  validatePaymentSplits,
  type PaymentSplitLine,
} from '@/components/PaymentSplitsFields';
import {
  RichTextEditor,
  isRichTextEmpty,
} from '@/components/RichTextEditor';
import { MouthToothPicker } from '@/features/patients/MouthToothPicker';
import { AttentionRedesign } from '@/features/patients/AttentionRedesign';
import { NewPatientModal } from '@/features/patients/NewPatientModal';
import { useFeatureFlag } from '@/lib/features';
import { listDentistsApi } from '@/services/auth.api';
import {
  createPatientApi,
  getPatientApi,
  listPatientsApi,
  type Patient,
} from '@/services/patients.api';
import {
  createTreatmentApi,
  listTreatmentsApi,
  type Treatment,
} from '@/services/treatments.api';
import { listCategoriesApi } from '@/services/categories.api';
import { uploadFilesApi } from '@/services/uploads.api';
import {
  type AttentionFile,
  type AttentionFileKind,
  attentionFileKindLabel,
} from '@/features/patients/attention.types';
import { getEvolutionApi } from '@/services/clinical.api';
import {
  completeVisitApi,
  updateVisitApi,
} from '@/services/visits.api';
import { registerPaymentApi, getPlanApi, createPlanApi, updatePlanApi } from '@/services/billing.api';
import { getTodayExchangeRateApi } from '@/services/exchange-rate.api';
import { listAppointmentsApi } from '@/services/appointments.api';
import { useAuthStore } from '@/stores/auth.store';
import { can } from '@/lib/permissions';
import {
  formatUsd,
  formatUsdWithVes,
  type PaymentCurrency,
  type RateSource,
  usdToVes,
  vesToUsd,
} from '@/lib/exchange';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { toast } from '@/stores/toast.store';
import type { ClinicalEvolution } from './ClinicalTimeline';

type SelectedProc = {
  treatmentId: number;
  quantity: number;
};

function notesToEditorHtml(text: string): string {
  const t = text.trim();
  if (!t) return '';
  if (t.includes('<')) return t;
  return t.replace(/\n/g, '<br/>');
}

/** Extrae nota limpia, piezas y adjuntos del texto guardado en bitácora */
function parseStoredVisit(ev: ClinicalEvolution): {
  notes: string;
  teeth: number[];
  files: AttentionFile[];
  procedures: SelectedProc[];
} {
  const raw = ev.clinicalNotes ?? '';
  const plain = raw.includes('<')
    ? raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
    : raw;

  const teethMatch = plain.match(/\n\s*Piezas(?: trabajadas)?:\s*([^\n]+)/i);
  const attachMatch = plain.match(/\n\s*Adjuntos:\s*([^\n]+)/i);

  const teethFromNotes = (teethMatch?.[1] ?? '')
    .split(/[,;\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 11 && n <= 48);

  const teethFromBilling = (ev.billing?.items ?? [])
    .map((i) => i.toothNumber)
    .filter((n): n is number => n != null && n >= 11 && n <= 48);

  const teeth = [...new Set([...teethFromNotes, ...teethFromBilling])];

  const urlsFromNotes = (attachMatch?.[1] ?? '')
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (ev.attachmentUrl && !urlsFromNotes.includes(ev.attachmentUrl)) {
    urlsFromNotes.unshift(ev.attachmentUrl);
  }
  const files: AttentionFile[] = urlsFromNotes.map((url) => ({
    url,
    originalName: url.split('/').pop() || 'archivo',
    mimeType: 'application/octet-stream',
    size: 0,
    kind: 'ATTACHMENT',
  }));

  const cut = plain.search(/\n\s*Procedimientos(\s+realizados)?\s*:/i);
  let notesPlain = cut >= 0 ? plain.slice(0, cut).trim() : plain.trim();
  notesPlain = notesPlain
    .replace(/\n\s*Piezas(?: trabajadas)?:\s*[^\n]+/gi, '')
    .replace(/\n\s*Adjuntos:\s*[^\n]+/gi, '')
    .trim();
  if (/^atención del d[ií]a\.?$/i.test(notesPlain)) notesPlain = '';

  const procedures: SelectedProc[] = (ev.billing?.items ?? []).map((i) => ({
    treatmentId: i.treatmentId,
    quantity: Math.max(1, i.quantity || 1),
  }));

  return {
    notes: notesToEditorHtml(notesPlain),
    teeth,
    files,
    procedures,
  };
}

function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultNextDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function splitScheduledAt(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const m = iso.match(
      /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})/,
    );
    if (m) return { date: m[1], time: `${m[2]}:${m[3]}` };
    return { date: defaultNextDate(), time: '10:00' };
  }
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

function formatApptLabel(date: string, time: string) {
  const [y, m, day] = date.split('-');
  return `${day}/${m}/${y} ${time}`;
}

function formatDateLong(date: string) {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('es-VE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

function formatTimeLabel(time: string) {
  const [hh, mm] = time.split(':').map(Number);
  if (!Number.isFinite(hh)) return time;
  const d = new Date();
  d.setHours(hh, mm || 0, 0, 0);
  return new Intl.DateTimeFormat('es-VE', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function suggestTreatmentCode(name: string, category: string) {
  const prefix = (category || 'GEN').slice(0, 3).toUpperCase();
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 6)
    .toUpperCase();
  const tail = String(Date.now()).slice(-4);
  return `${prefix}-${slug || 'NEW'}${tail}`.slice(0, 20);
}

export function AttentionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const quoteMode = location.pathname.startsWith('/presupuesto');
  const screenPath = quoteMode ? '/presupuesto' : '/atencion';
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const uiRedesign = useFeatureFlag('uiRedesign');
  const { rate: bcvToday } = useExchangeRate();
  const canAddTreatment = can(
    user?.role,
    'treatments.write',
    (user?.permissions ?? null) as import('@/lib/permissions').Permission[] | null,
  );
  const [params] = useSearchParams();
  const preselectedId = params.get('patientId') ?? '';
  const evolutionId = params.get('evolutionId') ?? '';
  const quoteId = params.get('quoteId') ?? '';
  const isEditing = Boolean(evolutionId);

  const [patientQuery, setPatientQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [editHydrated, setEditHydrated] = useState('');
  const [quoteHydrated, setQuoteHydrated] = useState('');
  const [newTreatmentOpen, setNewTreatmentOpen] = useState(false);
  const [newTreatment, setNewTreatment] = useState({
    name: '',
    code: '',
    category: 'GENERAL',
    basePrice: '',
  });
  const [newTreatmentError, setNewTreatmentError] = useState('');

  const [procSearch, setProcSearch] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [selected, setSelected] = useState<SelectedProc[]>([]);
  const [teeth, setTeeth] = useState<number[]>([]);
  const [files, setFiles] = useState<AttentionFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const [prescription, setPrescription] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduleNext, setScheduleNext] = useState(false);
  const [notifyPatient, setNotifyPatient] = useState(true);
  const [nextDate, setNextDate] = useState(defaultNextDate());
  const [nextTime, setNextTime] = useState('10:00');
  const [nextDentistId, setNextDentistId] = useState('');
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [mailAskOpen, setMailAskOpen] = useState(false);
  const [draftNextDate, setDraftNextDate] = useState(defaultNextDate());
  const [draftNextTime, setDraftNextTime] = useState('10:00');
  const [draftNextDentistId, setDraftNextDentistId] = useState('');
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [payKind, setPayKind] = useState<'full' | 'partial' | 'pending'>(
    'pending',
  );
  const [payPartial, setPayPartial] = useState('');
  const [paySplits, setPaySplits] = useState<PaymentSplitLine[]>([
    newSplitLine('CASH'),
  ]);
  const [payCurrency, setPayCurrency] = useState<PaymentCurrency>('USD');
  const [payRate, setPayRate] = useState('');
  const [payRateSource, setPayRateSource] = useState<RateSource>('BCV');
  const [bcvRate, setBcvRate] = useState<number | null>(null);
  const [bcvDate, setBcvDate] = useState<string | null>(null);
  const [loadingRate, setLoadingRate] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(patientQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [patientQuery]);

  const patientsQ = useQuery({
    queryKey: ['patients', 'attention-live', debouncedQ],
    queryFn: () => listPatientsApi(debouncedQ),
    enabled: debouncedQ.length >= 1,
  });

  const preselectQ = useQuery({
    queryKey: ['patient', 'attention', preselectedId],
    queryFn: () => getPatientApi(preselectedId),
    enabled: Boolean(preselectedId),
  });

  const activePatient = useMemo(() => {
    if (preselectedId && preselectQ.data?.id === preselectedId) {
      return preselectQ.data;
    }
    if (patient?.id && (!preselectedId || patient.id === preselectedId)) {
      return patient;
    }
    return null;
  }, [patient, preselectedId, preselectQ.data]);

  const patientLoading =
    Boolean(preselectedId) &&
    !activePatient &&
    preselectQ.isLoading;

  useEffect(() => {
    if (preselectQ.data?.id === preselectedId) {
      setPatient(preselectQ.data);
    }
  }, [preselectQ.data, preselectedId]);

  useEffect(() => {
    if (!preselectedId) return;
    if (quoteMode && quoteId) return;
    setSelected([]);
    setTeeth([]);
    setFiles([]);
    setError('');
  }, [preselectedId, quoteMode, quoteId]);

  const evolutionQ = useQuery({
    queryKey: ['evolution', evolutionId],
    queryFn: () => getEvolutionApi(evolutionId),
    enabled: Boolean(evolutionId),
  });

  const quoteQ = useQuery({
    queryKey: ['plan', quoteId],
    queryFn: () => getPlanApi(quoteId),
    enabled: Boolean(quoteId) && !isEditing,
  });

  useEffect(() => {
    if (!quoteId || isEditing || !quoteQ.data || quoteHydrated === quoteId) return;
    const items = quoteQ.data.items ?? [];
    setSelected(
      items.map((item) => ({
        treatmentId: item.treatmentId,
        quantity: item.quantity || 1,
      })),
    );
    setTeeth(
      items
        .map((item) => item.toothNumber)
        .filter((n): n is number => n != null),
    );
    setQuoteHydrated(quoteId);
    if (quoteMode) {
      toast('Presupuesto cargado para editar', 'info');
    } else {
      toast('Presupuesto aceptado cargado en la atención', 'info');
    }
  }, [quoteId, isEditing, quoteQ.data, quoteHydrated]);

  useEffect(() => {
    if (!evolutionId) {
      if (editHydrated) {
        // Salir de edición: no reutilizar procedimientos de la atención anterior
        setSelected([]);
        setTeeth([]);
        setFiles([]);
        setPrescription('');
        setNotes('');
        setScheduleNext(false);
        setEditHydrated('');
      }
      return;
    }
    const ev = evolutionQ.data;
    if (!ev || editHydrated === evolutionId) return;

    const parsed = parseStoredVisit(ev);
    setSelected(parsed.procedures);
    setTeeth(parsed.teeth);
    setFiles(parsed.files);
    setNotes(parsed.notes);
    setPrescription(notesToEditorHtml(ev.prescription ?? ''));
    setScheduleNext(false);
    setEditHydrated(evolutionId);

    if (!preselectedId && ev.patientId) {
      navigate(
        `/atencion?patientId=${ev.patientId}&evolutionId=${evolutionId}`,
        { replace: true },
      );
    }

    const patientForAppt = ev.patientId || preselectedId;
    if (patientForAppt) {
      void listAppointmentsApi({
        patientId: patientForAppt,
        from: `${todayLocalDate()}T00:00:00`,
      }).then((appts) => {
        const next = appts.find(
          (a) =>
            (a.status === 'PENDING' || a.status === 'CONFIRMED') &&
            /continuaci[oó]n/i.test(
              `${a.reason ?? ''} ${a.notes ?? ''}`,
            ),
        );
        if (!next) return;
        const { date, time } = splitScheduledAt(next.scheduledAt);
        setScheduleNext(true);
        setNextDate(date);
        setNextTime(time);
        setNextDentistId(next.dentistId);
      });
    }
  }, [
    evolutionId,
    evolutionQ.data,
    editHydrated,
    preselectedId,
    navigate,
  ]);

  const editPatientId =
    preselectedId || evolutionQ.data?.patientId || patient?.id || '';

  const editPatientQ = useQuery({
    queryKey: ['patient', editPatientId],
    queryFn: () => getPatientApi(editPatientId),
    enabled: isEditing && Boolean(editPatientId) && !patient,
  });

  useEffect(() => {
    if (editPatientQ.data) setPatient(editPatientQ.data);
  }, [editPatientQ.data]);

  const treatmentsQ = useQuery({
    queryKey: ['treatments'],
    queryFn: () => listTreatmentsApi(),
  });

  const categoriesQ = useQuery({
    queryKey: ['categories'],
    queryFn: () => listCategoriesApi(false),
  });

  const dentistsQ = useQuery({
    queryKey: ['dentists'],
    queryFn: listDentistsApi,
  });

  useEffect(() => {
    if (nextDentistId) return;
    if (user?.role === 'DENTIST') {
      setNextDentistId(user.id);
      return;
    }
    const first = dentistsQ.data?.[0]?.id;
    if (first) setNextDentistId(first);
  }, [dentistsQ.data, nextDentistId, user]);

  const byId = useMemo(() => {
    const map = new Map<number, Treatment>();
    for (const t of treatmentsQ.data ?? []) map.set(t.id, t);
    return map;
  }, [treatmentsQ.data]);

  const filteredTreatments = useMemo(() => {
    const q = procSearch.trim().toLowerCase();
    return (treatmentsQ.data ?? []).filter((t) => {
      if (category !== 'ALL' && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [treatmentsQ.data, procSearch, category]);

  const columns = useMemo(() => {
    const labelByCode = new Map(
      (categoriesQ.data ?? []).map((c) => [c.code, c.name] as const),
    );
    const order = (categoriesQ.data ?? []).map((c) => c.code);

    const groups = new Map<string, Treatment[]>();
    for (const t of filteredTreatments) {
      const cat = t.category || 'GENERAL';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(t);
    }
    const ordered: Array<{ key: string; label: string; items: Treatment[] }> =
      [];
    for (const c of order) {
      if (groups.has(c)) {
        ordered.push({
          key: c,
          label: labelByCode.get(c) ?? c,
          items: groups.get(c)!,
        });
      }
    }
    for (const [cat, items] of groups) {
      if (!order.includes(cat)) {
        ordered.push({
          key: cat,
          label: labelByCode.get(cat) ?? cat,
          items,
        });
      }
    }
    return ordered;
  }, [filteredTreatments, categoriesQ.data]);

  const selectedMap = useMemo(() => {
    const map = new Map<number, SelectedProc>();
    for (const s of selected) map.set(s.treatmentId, s);
    return map;
  }, [selected]);

  const totalUnits = selected.reduce((n, s) => n + s.quantity, 0);

  const lineItems = useMemo(
    () =>
      selected.map((s) => {
        const t = byId.get(s.treatmentId);
        const unitPrice = t?.basePrice ?? 0;
        const subtotal = Math.round(unitPrice * s.quantity * 100) / 100;
        return {
          ...s,
          name: t?.name ?? `Tratamiento #${s.treatmentId}`,
          code: t?.code ?? '',
          unitPrice,
          subtotal,
        };
      }),
    [selected, byId],
  );

  const grandTotal = useMemo(
    () =>
      Math.round(lineItems.reduce((sum, l) => sum + l.subtotal, 0) * 100) / 100,
    [lineItems],
  );

  const createPatientMut = useMutation({
    mutationFn: createPatientApi,
    onSuccess: (p) => {
      setPatient(p);
      setNewPatientOpen(false);
      setPatientQuery('');
      navigate(`${screenPath}?patientId=${p.id}`, { replace: true });
      qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });

  const createTreatmentMut = useMutation({
    mutationFn: createTreatmentApi,
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: ['treatments'] });
      setSelected((prev) =>
        prev.some((x) => x.treatmentId === t.id)
          ? prev
          : [...prev, { treatmentId: t.id, quantity: 1 }],
      );
      setProcSearch('');
      setCategory('ALL');
      setNewTreatmentOpen(false);
      setNewTreatmentError('');
      toast(`Procedimiento «${t.name}» agregado y marcado`, 'success');
    },
    onError: () => {
      setNewTreatmentError(
        'No se pudo crear. Probá otro código (¿duplicado?).',
      );
    },
  });

  function openNewTreatment() {
    const cat =
      category !== 'ALL'
        ? category
        : categoriesQ.data?.[0]?.code || 'GENERAL';
    const name = procSearch.trim() || '';
    setNewTreatment({
      name,
      code: suggestTreatmentCode(name || 'nuevo', cat),
      category: cat,
      basePrice: '',
    });
    setNewTreatmentError('');
    setNewTreatmentOpen(true);
  }

  const visitMut = useMutation({
    mutationFn: async (payload: Parameters<typeof completeVisitApi>[0]) => {
      if (isEditing && evolutionId) {
        const { patientId: _p, appointmentId: _a, walkIn: _w, ...rest } =
          payload;
        return updateVisitApi(evolutionId, rest);
      }
      return completeVisitApi(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evolutions'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['open-plan'] });
      qc.invalidateQueries({ queryKey: ['appointments'] });
      qc.invalidateQueries({ queryKey: ['odontogram'] });
      if (evolutionId) {
        qc.invalidateQueries({ queryKey: ['evolution', evolutionId] });
      }
    },
  });

  function pickPatient(p: Patient) {
    setPatient(p);
    setShowPicker(false);
    setPatientQuery('');
    setError('');
    navigate(`${screenPath}?patientId=${p.id}`, { replace: true });
  }

  function resetAfterSave(msg: string, nextAppt?: string | null) {
    setFlash(msg);
    toast(msg, 'success');
    if (nextAppt) {
      const { date, time } = splitScheduledAt(nextAppt);
      toast(
        `Próxima cita: ${formatApptLabel(date, time)} · mirala en Agenda`,
        'success',
      );
    }
    setSelected([]);
    setTeeth([]);
    setFiles([]);
    setPrescription('');
    setNotes('');
    setScheduleNext(false);
    setEditHydrated('');
    setPayOpen(false);
    setPayKind('pending');
    setPayPartial('');
    setPaySplits([newSplitLine('CASH')]);
    const returnPatientId = patient?.id;
    setPatient(null);
    setPatientQuery('');
    if (isEditing && returnPatientId) {
      navigate(`/patients/${returnPatientId}`, { replace: true });
    } else {
      navigate(screenPath, { replace: true });
    }
    setTimeout(() => setFlash(''), 4000);
  }

  function toggleProcedure(treatmentId: number) {
    setSelected((prev) => {
      if (prev.some((x) => x.treatmentId === treatmentId)) {
        return prev.filter((x) => x.treatmentId !== treatmentId);
      }
      return [...prev, { treatmentId, quantity: 1 }];
    });
  }

  function setQty(treatmentId: number, quantity: number) {
    const q = Math.max(1, Math.min(99, quantity));
    setSelected((prev) =>
      prev.map((x) => (x.treatmentId === treatmentId ? { ...x, quantity: q } : x)),
    );
  }

  async function onFilesChosen(
    list: FileList | null,
    kind: AttentionFileKind = 'ATTACHMENT',
  ) {
    if (!list?.length) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = await uploadFilesApi(list);
      setFiles((prev) => [
        ...prev,
        ...uploaded.map((file) => ({ ...file, kind })),
      ]);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        'No se pudieron subir los archivos';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setUploading(false);
    }
  }

  function validateBeforeSave() {
    if (!activePatient) {
      const msg = 'Seleccioná o creá un paciente antes de guardar';
      setError(msg);
      toast(msg, 'error');
      return false;
    }
    if (!selected.length) {
      const msg = quoteMode
        ? 'Seleccioná al menos un procedimiento para el presupuesto'
        : 'Seleccioná al menos un procedimiento para guardar la atención';
      setError(msg);
      toast(msg, 'error');
      return false;
    }
    if (scheduleNext && (!nextDate || !nextTime || !nextDentistId)) {
      const msg = quoteMode
        ? 'Completá la cita o desmarcá “Agendar cita”'
        : 'Completá la próxima cita o desmarcá “Agendar continuación”';
      setError(msg);
      toast(msg, 'error');
      return false;
    }
    return true;
  }

  async function saveQuote(sendMail: boolean) {
    if (!activePatient) return;
    setSavingAll(true);
    setMailAskOpen(false);
    setError('');
    const names = lineItems.map((l) => l.name).slice(0, 3).join(', ');
    const items = selected.map((s, index) => ({
      treatmentId: s.treatmentId,
      quantity: s.quantity,
      toothNumber: teeth[index] ?? teeth[0] ?? null,
    }));
    const editingQuoteId = quoteMode ? quoteId : '';
    try {
      if (editingQuoteId) {
        await updatePlanApi(editingQuoteId, {
          title: names || 'Presupuesto',
          notes: null,
          notifyPatient: sendMail,
          items,
        });
      } else {
        await createPlanApi({
          patientId: activePatient.id,
          title: names || 'Presupuesto',
          status: 'DRAFT',
          notifyPatient: sendMail,
          notes: null,
          items,
          nextAppointment: scheduleNext
            ? {
                scheduledAt: `${nextDate}T${nextTime}:00`,
                dentistId: nextDentistId,
                durationMin: 30,
                reason: 'Cita del presupuesto',
              }
            : null,
        });
      }
      if (sendMail && activePatient.email) {
        toast('Presupuesto guardado y enviado al correo del paciente', 'success');
      } else if (sendMail && !activePatient.email) {
        toast('Presupuesto guardado. El paciente no tiene correo cargado.', 'info');
      } else {
        toast('Presupuesto guardado', 'success');
      }
      if (scheduleNext && !editingQuoteId) {
        toast('Cita agendada con el presupuesto', 'success');
      }
      navigate(`/patients/${activePatient.id}`, { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        'No se pudo guardar el presupuesto';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setSavingAll(false);
    }
  }

  function requestSave() {
    setError('');
    if (!validateBeforeSave()) return;
    if (quoteMode) {
      setMailAskOpen(true);
      return;
    }

    if (grandTotal > 0.009) {
      setPayKind('pending');
      setPayCurrency('USD');
      setPayPartial(String(grandTotal));
      setPaySplits([newSplitLine('CASH', String(grandTotal))]);
      setPayRateSource('BCV');
      setPayOpen(true);
      void loadExchangeRate();
      return;
    }
    void commitSave({ kind: 'pending' });
  }

  function clearPatientSelection() {
    setPatient(null);
    setShowPicker(true);
    navigate(screenPath, { replace: true });
  }

  async function loadExchangeRate(refresh = false) {
    setLoadingRate(true);
    try {
      const data = await getTodayExchangeRateApi(refresh);
      setBcvRate(data.rate);
      setBcvDate(data.rateDate);
      setPayRate(String(data.rate));
      setPayRateSource('BCV');
    } catch {
      toast('No se pudo cargar la tasa BCV. Ingresala a mano.', 'error');
    } finally {
      setLoadingRate(false);
    }
  }

  async function commitSave(pay: {
    kind: 'full' | 'partial' | 'pending';
    amount?: number;
    currencyPaid?: PaymentCurrency;
    exchangeRate?: number;
    rateSource?: RateSource;
    splits?: PaymentSplitLine[];
  }) {
    if (!activePatient) return;
    setSavingAll(true);
    setError('');
    setPayOpen(false);

    const clinicalNotes = !isRichTextEmpty(notes)
      ? notes
      : 'Atención del día.';

    const nextScheduled = scheduleNext
      ? `${nextDate}T${nextTime}:00`
      : null;

    try {
      const result = await visitMut.mutateAsync({
        patientId: activePatient.id,
        walkIn: false,
        dentistId: user?.role === 'DENTIST' ? user.id : nextDentistId || undefined,
        clinicalNotes,
        prescription: isRichTextEmpty(prescription) ? null : prescription,
        billProcedures: true,
        quoteId: quoteId || null,
        notifyPatient,
        toothNumbers: teeth,
        attachmentUrls: files
          .filter((f) => f.kind === 'ATTACHMENT')
          .map((f) => f.url),
        galleryAttachments: files
          .filter((f) => f.kind === 'GALLERY')
          .map((f) => ({
            fileUrl: f.url,
            originalName: f.originalName,
            mimeType: f.mimeType,
            fileSize: f.size,
          })),
        radiographAttachments: files
          .filter((f) => f.kind === 'RADIOGRAPH')
          .map((f) => ({
            fileUrl: f.url,
            originalName: f.originalName,
            mimeType: f.mimeType,
            fileSize: f.size,
          })),
        procedures: selected.map((s) => ({
          treatmentId: s.treatmentId,
          quantity: s.quantity,
        })),
        nextAppointment: scheduleNext
          ? {
              scheduledAt: `${nextDate}T${nextTime}:00`,
              dentistId: nextDentistId,
              durationMin: 30,
              reason: 'Continuación de tratamiento',
            }
          : null,
      });

      if (
        pay.kind !== 'pending' &&
        result.planId &&
        pay.splits?.length &&
        (pay.amount ?? 0) > 0.009
      ) {
        try {
          const currency = pay.currencyPaid ?? 'USD';
          const rate = pay.exchangeRate ?? 0;
          const amountInCurrency = pay.amount!;
          const amountUsd =
            currency === 'VES'
              ? vesToUsd(amountInCurrency, rate)
              : amountInCurrency;
          await registerPaymentApi({
            patientId: activePatient.id,
            treatmentPlanId: result.planId,
            currencyPaid: currency,
            exchangeRate: rate,
            rateSource: pay.rateSource ?? 'BCV',
            notes:
              pay.kind === 'full'
                ? 'Pago total al cerrar atención'
                : 'Abono al cerrar atención',
            splits: pay.splits.map((s) => ({
              paymentMethod: s.method,
              amountPaid: Number(s.amount),
              reference:
                s.method === 'CASH' ? null : s.reference.trim() || null,
            })),
          });
          toast(
            pay.kind === 'full'
              ? `Pagó todo · ${formatUsdWithVes(amountUsd, rate || bcvToday)}`
              : `Abono · ${formatUsdWithVes(amountUsd, rate || bcvToday)}`,
            'success',
          );
        } catch {
          toast(
            'Atención guardada, pero no se pudo registrar el pago. Cargalo desde la ficha.',
            'error',
          );
        }
      }

      const pname = activePatient.fullName ?? 'paciente';
      const msg = isEditing
        ? `Atención de ${pname} actualizada`
        : `Atención de ${pname} guardada`;
      resetAfterSave(msg, nextScheduled);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'No se pudo guardar. Verifique permisos o conexión.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setSavingAll(false);
    }
  }

  const redesignProps = {
    patient: activePatient,
    patientLoading,
    preselectError:
      Boolean(preselectedId) && preselectQ.isError && !activePatient,
    isEditing,
    patientQuery,
    debouncedQ,
    showPicker,
    patientsLoading: patientsQ.isFetching,
    patientResults: patientsQ.data ?? [],
    procSearch,
    category,
    categories: categoriesQ.data ?? [],
    filteredTreatments,
    selectedMap,
    lineItems,
    grandTotal,
    savingAll,
    visitPending: visitMut.isPending,
    canAddTreatment,
    flash,
    error,
    onPatientQueryChange: setPatientQuery,
    onShowPicker: setShowPicker,
    onPickPatient: pickPatient,
    onClearPatient: clearPatientSelection,
    onNewPatient: () => setNewPatientOpen(true),
    onProcSearchChange: setProcSearch,
    onCategoryChange: (code: string) =>
      setCategory((prev) => (prev === code ? 'ALL' : code)),
    onToggleProcedure: toggleProcedure,
    onOpenNewTreatment: openNewTreatment,
    onSaveAttention: requestSave,
    quoteMode,
    files,
    uploading,
    onFilesChosen,
    onRemoveFile: (url: string) =>
      setFiles((prev) => prev.filter((x) => x.url !== url)),
    scheduleNext,
    scheduleLabel: scheduleNext
      ? `${formatDateLong(nextDate)} · ${formatTimeLabel(nextTime)}`
      : null,
    onToggleSchedule: () => {
      if (scheduleNext) {
        setScheduleNext(false);
        return;
      }
      setDraftNextDate(nextDate || defaultNextDate());
      setDraftNextTime(nextTime || '10:00');
      setDraftNextDentistId(
        nextDentistId ||
          (user?.role === 'DENTIST' ? user.id : '') ||
          dentistsQ.data?.[0]?.id ||
          '',
      );
      setScheduleModalOpen(true);
    },
  };

  return (
    <>
      {uiRedesign ? (
        <AttentionRedesign key={preselectedId || 'attention'} {...redesignProps} />
      ) : (
    <div className="mx-auto max-w-6xl space-y-4 p-3 pb-[calc(10.5rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(10.5rem+env(safe-area-inset-bottom))] md:px-6 md:pt-6 md:pb-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-semibold text-clinic-ink">
            {quoteMode && quoteId
              ? 'Editar presupuesto'
              : isEditing
                ? 'Editar atención'
                : quoteMode
                  ? 'Presupuesto'
                  : 'Atención'}
          </h1>
          <p className="text-sm text-clinic-slate">
            {quoteMode
              ? 'Misma pantalla que la atención. Al guardar te pregunta si querés enviarlo al correo del paciente.'
              : isEditing
              ? 'Corregí procedimientos, notas o archivos y guardá.'
              : 'Paciente → procedimientos → piezas → guardar.'}
          </p>
        </div>
        {isEditing && patient && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(`/patients/${patient.id}`)}
          >
            Volver a la ficha
          </Button>
        )}
        {flash && (
          <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            <Check className="h-4 w-4" />
            {flash}
          </div>
        )}
      </div>

      {isEditing && evolutionQ.isLoading && (
        <p className="text-sm text-clinic-slate">Cargando atención…</p>
      )}
      {isEditing && evolutionQ.isError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar la atención para editar.
        </p>
      )}

      {/* Paciente */}
      <section className="panel relative z-20 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="relative min-w-[240px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-clinic-slate">
              Paciente
            </label>
            {patient ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-clinic-deep/20 bg-clinic-deep/5 px-3 py-2.5">
                <UserRound className="h-4 w-4 text-clinic-deep" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-clinic-ink">
                    {patient.fullName}
                  </p>
                  <p className="text-xs text-clinic-slate">
                    Doc. {patient.documentId}
                    {patient.phone ? ` · ${patient.phone}` : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isEditing}
                  onClick={() => {
                    setPatient(null);
                    setShowPicker(true);
                    navigate(screenPath, { replace: true });
                  }}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-clinic-slate">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm focus:border-clinic-deep focus:outline-none focus:ring-2 focus:ring-clinic-deep/20"
                  placeholder="Buscar nombre o documento…"
                  value={patientQuery}
                  onChange={(e) => {
                    setPatientQuery(e.target.value);
                    setShowPicker(true);
                  }}
                  onFocus={() => setShowPicker(true)}
                  autoFocus
                />
                {patientQuery && (
                  <button
                    type="button"
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-clinic-slate hover:bg-slate-100 hover:text-clinic-ink"
                    onClick={() => {
                      setPatientQuery('');
                      setDebouncedQ('');
                      setShowPicker(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {showPicker && debouncedQ.length >= 1 && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {patientsQ.isFetching ? (
                      <p className="px-3 py-3 text-sm text-clinic-slate">
                        Buscando…
                      </p>
                    ) : (
                      <>
                        {(patientsQ.data ?? []).slice(0, 8).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="flex w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickPatient(p)}
                          >
                            <span className="font-medium">{p.fullName}</span>
                            <span className="ml-2 text-xs text-clinic-slate">
                              {p.documentId}
                            </span>
                          </button>
                        ))}
                        {(patientsQ.data?.length ?? 0) === 0 && (
                          <p className="px-3 py-3 text-sm text-clinic-slate">
                            Sin resultados. Cree el paciente nuevo.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-5">
            <Button
              type="button"
              onClick={() => setNewPatientOpen(true)}
              disabled={isEditing}
            >
              <UserPlus className="h-4 w-4" />
              Nuevo paciente
            </Button>
          </div>
        </div>
      </section>

      {/* Procedimientos */}
      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-clinic-ink">
              Procedimientos
            </h2>
            <p className="mt-0.5 text-sm font-medium text-clinic-deep">
              Seleccioná lo que se realizó hoy
            </p>
          </div>
          {totalUnits > 0 && (
            <span className="rounded-md bg-accent-soft px-2 py-1 text-xs font-semibold text-orange-800">
              {selected.length} elegido
              {selected.length === 1 ? '' : 's'} · {totalUnits} und.
            </span>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-clinic-slate">
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white" />
            Tocá para elegir
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-accent bg-accent text-white">
              <Check className="h-2.5 w-2.5" />
            </span>
            Elegido
          </span>
        </div>

        <div className="mb-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-clinic-slate" />
            <input
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-9 text-sm focus:border-clinic-deep focus:outline-none focus:ring-2 focus:ring-clinic-deep/20"
              placeholder="Buscar por nombre o código…"
              value={procSearch}
              onChange={(e) => setProcSearch(e.target.value)}
            />
            {procSearch && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-clinic-slate hover:bg-slate-100 hover:text-clinic-ink"
                onClick={() => setProcSearch('')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setCategory('ALL')}
              className={clsx(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                category === 'ALL'
                  ? 'bg-clinic-deep text-white'
                  : 'bg-slate-100 text-clinic-slate active:bg-slate-200',
              )}
            >
              Todas
            </button>
            {(categoriesQ.data ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  setCategory((prev) => (prev === c.code ? 'ALL' : c.code))
                }
                className={clsx(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                  category === c.code
                    ? 'bg-clinic-deep text-white'
                    : 'bg-slate-100 text-clinic-slate active:bg-slate-200',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {treatmentsQ.isLoading ? (
          <p className="text-sm text-clinic-slate">Cargando catálogo…</p>
        ) : columns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center">
            <p className="text-sm text-clinic-slate">
              No hay procedimientos con ese filtro.
            </p>
            {canAddTreatment && (
              <Button
                type="button"
                className="mt-3"
                onClick={openNewTreatment}
              >
                <Plus className="h-4 w-4" />
                Agregar procedimiento
                {procSearch.trim() ? ` «${procSearch.trim()}»` : ''}
              </Button>
            )}
            {!canAddTreatment && (
              <p className="mt-2 text-xs text-clinic-slate">
                Pedile a un admin o odontólogo que lo cargue en el catálogo.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {columns.map((col) => (
              <div key={col.key}>
                <div className="mb-2 flex items-center gap-2 px-0.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-clinic-slate">
                    {col.label}
                  </p>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    {col.items.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {col.items.map((t) => {
                    const sel = selectedMap.get(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleProcedure(t.id)}
                        aria-pressed={Boolean(sel)}
                        className={clsx(
                          'w-full overflow-hidden rounded-xl border p-3 text-left transition active:scale-[0.99]',
                          sel
                            ? 'border-accent bg-orange-50/90 shadow-sm ring-2 ring-accent/20'
                            : 'border-slate-200 bg-white hover:border-clinic-deep/35 hover:bg-slate-50/50',
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={clsx(
                              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                              sel
                                ? 'border-accent bg-accent text-white'
                                : 'border-slate-300 bg-white text-transparent',
                            )}
                            aria-hidden
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm font-semibold leading-snug text-clinic-ink">
                              {t.name}
                            </span>
                            <span className="mt-0.5 block font-mono text-[10px] text-clinic-slate">
                              {t.code}
                            </span>
                          </span>
                        </div>

                        <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                          <MoneyAmount
                            usd={t.basePrice}
                            layout="inline"
                            usdClassName="text-sm font-bold text-clinic-ink"
                            vesClassName="text-[10px] font-bold"
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {selected.length > 0 && (
          <div className="mt-4 rounded-xl border border-orange-200/80 bg-gradient-to-br from-orange-50/90 to-amber-50/40 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
              Seleccionados · ajustá cantidad
            </p>
            <ul className="space-y-2">
              {lineItems.map((s) => (
                <li
                  key={s.treatmentId}
                  className="rounded-xl border border-white/90 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold leading-snug text-clinic-ink">
                        {s.name}
                      </p>
                      {s.code && (
                        <p className="mt-0.5 font-mono text-[10px] text-clinic-slate">
                          {s.code}
                          {s.quantity > 1 && (
                            <span className="ml-1.5 font-sans text-clinic-slate">
                              · {formatUsd(s.unitPrice)} c/u
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-clinic-slate hover:bg-red-50 hover:text-red-600"
                      onClick={() => toggleProcedure(s.treatmentId)}
                      aria-label="Quitar procedimiento"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center text-clinic-slate active:bg-slate-100"
                        onClick={() => setQty(s.treatmentId, s.quantity - 1)}
                        aria-label="Menos"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        className="h-9 w-10 border-x border-slate-200 bg-white text-center text-sm font-semibold tabular-nums"
                        type="number"
                        min={1}
                        max={99}
                        value={s.quantity}
                        onChange={(e) =>
                          setQty(s.treatmentId, Number(e.target.value) || 1)
                        }
                        aria-label="Cantidad"
                      />
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center text-clinic-slate active:bg-slate-100"
                        onClick={() => setQty(s.treatmentId, s.quantity + 1)}
                        aria-label="Más"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <MoneyAmount
                      usd={s.subtotal}
                      layout="inline"
                      usdClassName="text-sm font-bold text-clinic-ink"
                      vesClassName="text-[10px] font-bold"
                      className="justify-end"
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-clinic-ink px-3 py-2.5 text-white">
              <span className="text-sm font-medium">Total atención</span>
              <MoneyAmount
                usd={grandTotal}
                layout="inline"
                className="justify-end"
                usdClassName="font-display text-base font-semibold text-white"
                vesClassName="bg-white/15 text-[10px] font-bold text-white"
              />
            </div>
          </div>
        )}
      </section>

      {/* Boca / piezas */}
      <section className="panel p-4">
        <MouthToothPicker selected={teeth} onChange={setTeeth} />
      </section>

      {/* Extra */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel space-y-3 p-4">
          <RichTextEditor
            id="rx"
            label="Receta / indicaciones"
            value={prescription}
            onChange={setPrescription}
            placeholder="Opcional — dosis, frecuencia…"
            minHeight="88px"
          />
          <RichTextEditor
            id="notes"
            label="Nota extra"
            value={notes}
            onChange={setNotes}
            placeholder="Si queda vacío, se arma sola"
            minHeight="72px"
          />

          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
              Archivos del expediente
            </p>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100">
                <FileUp className="h-4 w-4 text-clinic-deep" />
                {uploading ? 'Subiendo…' : 'Foto → Galería'}
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,.heic,.heif"
                  onChange={(e) => {
                    void onFilesChosen(e.target.files, 'GALLERY');
                    e.target.value = '';
                  }}
                />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 hover:bg-violet-100">
                <FileUp className="h-4 w-4" />
                {uploading ? 'Subiendo…' : 'Radiografía'}
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,.heic,.heif"
                  onChange={(e) => {
                    void onFilesChosen(e.target.files, 'RADIOGRAPH');
                    e.target.value = '';
                  }}
                />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100">
                <FileUp className="h-4 w-4 text-clinic-deep" />
                PDF / documento
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,application/pdf,.doc,.docx,.txt"
                  onChange={(e) => {
                    void onFilesChosen(e.target.files, 'ATTACHMENT');
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {files.length > 0 && (
              <ul className="space-y-1 text-sm">
                {files.map((f) => (
                  <li
                    key={f.url}
                    className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                        {attentionFileKindLabel(f.kind)}
                      </span>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-clinic-deep hover:underline"
                      >
                        {f.originalName}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setFiles((prev) => prev.filter((x) => x.url !== f.url))
                      }
                    >
                      <X className="h-3.5 w-3.5 text-clinic-slate" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="panel space-y-3 p-4">
          {!scheduleNext ? (
            <button
              type="button"
              onClick={() => {
                setDraftNextDate(nextDate || defaultNextDate());
                setDraftNextTime(nextTime || '10:00');
                setDraftNextDentistId(
                  nextDentistId ||
                    (user?.role === 'DENTIST' ? user.id : '') ||
                    dentistsQ.data?.[0]?.id ||
                    '',
                );
                setScheduleModalOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-clinic-deep/40 bg-clinic-deep/5 px-4 py-3.5 text-left transition hover:bg-clinic-deep/10"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clinic-deep/15 text-clinic-deep">
                <CalendarPlus className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-clinic-ink">
                  Agendar cita
                </span>
                <span className="mt-0.5 block text-xs text-clinic-slate">
                  {quoteMode
                    ? 'Opcional: cita asociada a este presupuesto'
                    : 'Elegí fecha en calendario, hora y odontólogo'}
                </span>
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                  <CalendarPlus className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-violet-950">
                    Continuación agendada
                  </p>
                  <p className="mt-1 text-sm text-clinic-ink">
                    {formatDateLong(nextDate)} · {formatTimeLabel(nextTime)}
                  </p>
                  <p className="mt-0.5 text-xs text-clinic-slate">
                    {(dentistsQ.data ?? []).find((d) => d.id === nextDentistId)
                      ?.fullName ?? 'Odontólogo'}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setDraftNextDate(nextDate);
                    setDraftNextTime(nextTime);
                    setDraftNextDentistId(nextDentistId);
                    setScheduleModalOpen(true);
                  }}
                >
                  Cambiar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setScheduleNext(false)}
                >
                  Quitar
                </Button>
              </div>
            </div>
          )}

          {!quoteMode && (
          <label
            className={clsx(
              'flex items-start gap-3 rounded-xl border px-3 py-3 transition',
              patient?.email
                ? 'border-slate-200 bg-slate-50/80'
                : 'border-amber-200/80 bg-amber-50/50',
            )}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={notifyPatient}
              disabled={!patient?.email}
              onChange={(e) => setNotifyPatient(e.target.checked)}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-clinic-ink">
                <Mail className="h-4 w-4 shrink-0 text-clinic-deep" />
                Enviar resumen al paciente
              </span>
              <span className="mt-0.5 block text-xs text-clinic-slate">
                {patient?.email
                  ? `Se enviará a ${patient.email} (procedimientos, receta y próxima cita si hay).`
                  : 'El paciente no tiene email en la ficha; agregalo para poder notificar.'}
              </span>
            </span>
          </label>
          )}
        </div>
      </section>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[45] border-t border-slate-200 bg-white/95 backdrop-blur md:inset-x-auto md:bottom-0 md:left-60 md:right-0 md:z-30">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-3">
          <div className="min-w-0 flex-1">
            {error ? (
              <p className="text-sm font-medium text-red-600">{error}</p>
            ) : (
              <p className="truncate text-xs text-clinic-slate sm:text-sm">
                {patient ? (
                  <>
                    <span className="font-semibold text-clinic-ink">
                      {patient.fullName}
                    </span>
                    {' · '}
                    {totalUnits} proc. · {teeth.length} pieza
                    {teeth.length === 1 ? '' : 's'}
                    {files.length ? ` · ${files.length} archivo(s)` : ''}
                    {grandTotal > 0 ? (
                      <>
                        {' · '}
                        <MoneyAmount
                          usd={grandTotal}
                          layout="inline"
                          usdClassName="font-semibold text-accent"
                          vesClassName="text-accent/80"
                        />
                      </>
                    ) : null}
                  </>
                ) : (
                  'Elija paciente y marque procedimientos'
                )}
              </p>
            )}
          </div>
          <Button
            onClick={requestSave}
            disabled={
              savingAll ||
              visitMut.isPending ||
              (isEditing && evolutionQ.isLoading)
            }
            className="w-full min-w-[160px] sm:w-auto"
          >
            {savingAll || visitMut.isPending
              ? 'Guardando…'
              : isEditing
                ? 'Guardar cambios'
                : quoteMode
                  ? 'Guardar presupuesto'
                  : 'Guardar atención'}
          </Button>
        </div>
      </div>
    </div>
      )}

      <NewPatientModal
        open={newPatientOpen}
        initialDocument={patientQuery}
        submitting={createPatientMut.isPending}
        onClose={() => setNewPatientOpen(false)}
        onCreate={async (payload) => {
          try {
            await createPatientMut.mutateAsync(payload);
          } catch {
            setError('No se pudo crear el paciente (¿documento duplicado?)');
          }
        }}
      />

      <Modal
        open={newTreatmentOpen}
        onClose={() => setNewTreatmentOpen(false)}
        title="Nuevo procedimiento"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setNewTreatmentOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={createTreatmentMut.isPending}
              onClick={() => {
                setNewTreatmentError('');
                const name = newTreatment.name.trim();
                const code = newTreatment.code.trim();
                const price = Number(newTreatment.basePrice);
                if (!name || !code) {
                  setNewTreatmentError('Nombre y código son obligatorios');
                  return;
                }
                if (!Number.isFinite(price) || price < 0) {
                  setNewTreatmentError('Indicá un precio válido');
                  return;
                }
                createTreatmentMut.mutate({
                  name,
                  code,
                  category: newTreatment.category || 'GENERAL',
                  basePrice: price,
                  isActive: true,
                });
              }}
            >
              {createTreatmentMut.isPending ? 'Guardando…' : 'Crear y marcar'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            id="nt-name"
            label="Nombre"
            value={newTreatment.name}
            onChange={(e) =>
              setNewTreatment((f) => ({ ...f, name: e.target.value }))
            }
            placeholder="Ej.: Tratamiento de conducto"
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="nt-code"
              label="Código"
              value={newTreatment.code}
              onChange={(e) =>
                setNewTreatment((f) => ({ ...f, code: e.target.value }))
              }
              required
            />
            <Input
              id="nt-price"
              label="Precio"
              type="number"
              min="0"
              step="0.01"
              value={newTreatment.basePrice}
              onChange={(e) =>
                setNewTreatment((f) => ({ ...f, basePrice: e.target.value }))
              }
              placeholder="0.00"
              required
            />
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
              Categoría
            </span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
              value={newTreatment.category}
              onChange={(e) =>
                setNewTreatment((f) => ({ ...f, category: e.target.value }))
              }
            >
              {(categoriesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.code}>
                  {c.name}
                </option>
              ))}
              {(categoriesQ.data?.length ?? 0) === 0 && (
                <option value="GENERAL">General</option>
              )}
            </select>
          </label>
          {newTreatmentError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {newTreatmentError}
            </p>
          )}
        </div>
      </Modal>
      <Modal
        open={mailAskOpen}
        onClose={() => !savingAll && setMailAskOpen(false)}
        title="Enviar presupuesto"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={savingAll}
              onClick={() => void saveQuote(false)}
            >
              Solo guardar
            </Button>
            <Button
              type="button"
              disabled={savingAll}
              className="border-0 bg-[#2b7a78] hover:bg-[#236663]"
              onClick={() => void saveQuote(true)}
            >
              {savingAll ? 'Guardando…' : 'Enviar correo'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          ¿Desea enviar este presupuesto al correo del paciente?
        </p>
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
          {activePatient?.email || 'Este paciente no tiene correo en la ficha.'}
        </p>
      </Modal>

      <Modal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        title="Agendar continuación"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setScheduleModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!draftNextDate || !draftNextTime || !draftNextDentistId) {
                  toast('Completá fecha, hora y odontólogo', 'error');
                  return;
                }
                if (draftNextDate < todayLocalDate()) {
                  toast('La fecha no puede ser anterior a hoy', 'error');
                  return;
                }
                setNextDate(draftNextDate);
                setNextTime(draftNextTime);
                setNextDentistId(draftNextDentistId);
                setScheduleNext(true);
                setScheduleModalOpen(false);
              }}
            >
              Confirmar cita
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-clinic-slate">
            Se crea como <strong>continuación</strong> en la Agenda. Tocá el día
            en el calendario.
          </p>
          <MiniMonthPicker
            value={draftNextDate}
            onChange={setDraftNextDate}
            min={todayLocalDate()}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="n-time-modal"
              label="Hora"
              type="time"
              value={draftNextTime}
              onChange={(e) => setDraftNextTime(e.target.value)}
            />
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-clinic-slate">
                Odontólogo
              </span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"
                value={draftNextDentistId}
                onChange={(e) => setDraftNextDentistId(e.target.value)}
              >
                {(dentistsQ.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {draftNextDate && (
            <p className="rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-950 ring-1 ring-violet-200">
              <span className="font-semibold">Resumen: </span>
              {formatDateLong(draftNextDate)} · {formatTimeLabel(draftNextTime)}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={payOpen}
        onClose={() => !savingAll && setPayOpen(false)}
        title="¿Cómo quedó el cobro?"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={savingAll}
              onClick={() => setPayOpen(false)}
            >
              Volver
            </Button>
            <Button
              type="button"
              disabled={savingAll}
              onClick={() => {
                if (payKind === 'pending') {
                  void commitSave({ kind: 'pending' });
                  return;
                }
                const rateN = Number(payRate);
                if (!(rateN > 0)) {
                  toast('Indicá la tasa de cambio del día', 'error');
                  return;
                }
                const amount =
                  payKind === 'full'
                    ? payCurrency === 'VES'
                      ? usdToVes(grandTotal, rateN)
                      : grandTotal
                    : Number(payPartial);
                if (!amount || amount <= 0) {
                  toast('Indicá un monto válido', 'error');
                  return;
                }
                const amountUsd =
                  payCurrency === 'VES'
                    ? vesToUsd(amount, rateN)
                    : amount;
                if (amountUsd > grandTotal + 0.009) {
                  toast('El abono no puede superar el total', 'error');
                  return;
                }
                const splitErr = validatePaymentSplits(paySplits, amount);
                if (splitErr) {
                  toast(splitErr, 'error');
                  return;
                }
                void commitSave({
                  kind: payKind,
                  amount,
                  currencyPaid: payCurrency,
                  exchangeRate: rateN,
                  rateSource: payRateSource,
                  splits: paySplits,
                });
              }}
            >
              {savingAll
                ? 'Guardando…'
                : payKind === 'pending'
                  ? 'Guardar sin pago'
                  : 'Confirmar y guardar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-clinic-ink px-4 py-3 text-center text-white">
            <span className="block text-xs uppercase tracking-wide text-white/70">
              Total de esta atención
            </span>
            <MoneyAmount
              usd={grandTotal}
              className="mt-1 items-center"
              usdClassName="font-display text-2xl font-semibold text-white"
              vesClassName="text-sm text-white/75"
            />
          </p>

          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => {
                setPayKind('full');
                const rateN = Number(payRate);
                const total =
                  payCurrency === 'VES' && rateN > 0
                    ? usdToVes(grandTotal, rateN)
                    : grandTotal;
                setPayPartial(String(total));
                setPaySplits([newSplitLine('CASH', String(total))]);
              }}
              className={clsx(
                'rounded-xl border px-4 py-3 text-left transition',
                payKind === 'full'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <p className="font-semibold text-clinic-ink">Pagó todo</p>
              <p className="text-xs text-clinic-slate">
                Un toque · registrá el método abajo
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setPayKind('partial');
                if (!payPartial) {
                  setPayPartial(String(grandTotal));
                  setPaySplits([newSplitLine('CASH', String(grandTotal))]);
                }
              }}
              className={clsx(
                'rounded-xl border px-4 py-3 text-left transition',
                payKind === 'partial'
                  ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <p className="font-semibold text-clinic-ink">Abono parcial</p>
              <p className="text-xs text-clinic-slate">
                Pagó algo hoy · el resto queda pendiente
              </p>
            </button>
            <button
              type="button"
              onClick={() => setPayKind('pending')}
              className={clsx(
                'rounded-xl border px-4 py-3 text-left transition',
                payKind === 'pending'
                  ? 'border-clinic-deep bg-clinic-deep/5 ring-2 ring-clinic-deep/20'
                  : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <p className="font-semibold text-clinic-ink">Dejar pendiente</p>
              <p className="text-xs text-clinic-slate">
                Sin pago ahora · se abona después desde la ficha
              </p>
            </button>
          </div>

          {payKind !== 'pending' && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              {payKind === 'partial' && (
                <Input
                  id="pay-partial"
                  label={
                    payCurrency === 'VES'
                      ? 'Monto del abono (Bs)'
                      : 'Monto del abono (USD)'
                  }
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payPartial}
                  onChange={(e) => {
                    setPayPartial(e.target.value);
                    const n = Number(e.target.value);
                    if (paySplits.length === 1) {
                      setPaySplits([
                        { ...paySplits[0], amount: e.target.value },
                      ]);
                    } else if (n > 0) {
                      setPaySplits([newSplitLine('CASH', e.target.value)]);
                    }
                  }}
                />
              )}
              <PaymentFxFields
                currency={payCurrency}
                onCurrencyChange={(c) => {
                  const rateN = Number(payRate);
                  const convert = (v: number) => {
                    if (!(rateN > 0) || !(v > 0)) return v;
                    if (c === 'VES') {
                      return usdToVes(
                        payCurrency === 'USD' ? v : vesToUsd(v, rateN),
                        rateN,
                      );
                    }
                    return payCurrency === 'VES' ? vesToUsd(v, rateN) : v;
                  };
                  if (payKind === 'partial') {
                    const next = convert(Number(payPartial) || 0);
                    setPayPartial(next > 0 ? String(next) : '');
                  }
                  setPaySplits((prev) =>
                    prev.map((l) => ({
                      ...l,
                      amount: (() => {
                        const n = Number(l.amount);
                        if (!(n > 0)) return l.amount;
                        return String(convert(n));
                      })(),
                    })),
                  );
                  setPayCurrency(c);
                }}
                rate={payRate}
                onRateChange={setPayRate}
                rateSource={payRateSource}
                onRateSourceChange={setPayRateSource}
                bcvRate={bcvRate}
                rateDate={bcvDate}
                loadingRate={loadingRate}
                onRefreshRate={() => void loadExchangeRate(true)}
                amountInCurrency={
                  payKind === 'full'
                    ? payCurrency === 'VES' && Number(payRate) > 0
                      ? usdToVes(grandTotal, Number(payRate))
                      : grandTotal
                    : Number(payPartial) || 0
                }
              />
              <PaymentSplitsFields
                currency={payCurrency}
                expectedTotal={
                  payKind === 'full'
                    ? payCurrency === 'VES' && Number(payRate) > 0
                      ? usdToVes(grandTotal, Number(payRate))
                      : grandTotal
                    : Number(payPartial) || 0
                }
                lines={paySplits}
                onChange={setPaySplits}
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
