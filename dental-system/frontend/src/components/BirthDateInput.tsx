import { useEffect, useState } from 'react';
import { Input } from '@/components/Input';
import {
  displayDateToIso,
  isoToDisplayDate,
  maskBirthDateInput,
} from '@/lib/birthDate';

type Props = {
  id?: string;
  label?: string;
  value: string; // ISO yyyy-mm-dd
  onChange: (iso: string) => void;
  required?: boolean;
  error?: string;
};

/** Fecha tipable dd/mm/aaaa (evita el salto del date nativo de Windows). */
export function BirthDateInput({
  id = 'birth-date',
  label = 'Fecha de nacimiento',
  value,
  onChange,
  required,
  error,
}: Props) {
  const [display, setDisplay] = useState(() => isoToDisplayDate(value));
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setDisplay(isoToDisplayDate(value));
  }, [value]);

  return (
    <Input
      id={id}
      label={label}
      inputMode="numeric"
      autoComplete="bday"
      placeholder="dd/mm/aaaa"
      value={display}
      required={required}
      hint="Ejemplo: 27/06/1990"
      error={error || localError || undefined}
      onChange={(e) => {
        const next = maskBirthDateInput(e.target.value);
        setDisplay(next);
        setLocalError('');
        if (next.length < 10) {
          onChange('');
          return;
        }
        const iso = displayDateToIso(next);
        if (iso) {
          onChange(iso);
        } else {
          onChange('');
          setLocalError('Fecha inválida');
        }
      }}
      onBlur={() => {
        if (!display) {
          setLocalError('');
          return;
        }
        if (display.length < 10) {
          setLocalError('Completá dd/mm/aaaa');
          return;
        }
        if (!displayDateToIso(display)) {
          setLocalError('Fecha inválida');
        }
      }}
    />
  );
}
