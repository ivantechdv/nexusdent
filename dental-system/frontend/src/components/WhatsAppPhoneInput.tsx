import { Input } from '@/components/Input';
import {
  formatWhatsAppPhoneInput,
  normalizePhoneForStorage,
} from '@/lib/contact';

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

/** Teléfono con máscara WhatsApp VE (0412-1234567). */
export function WhatsAppPhoneInput({
  id = 'phone-wa',
  label = 'WhatsApp',
  value,
  onChange,
  required,
}: Props) {
  return (
    <Input
      id={id}
      label={label}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="0412-1234567"
      hint="Se usa para contactar por WhatsApp"
      value={value}
      required={required}
      onChange={(e) => {
        onChange(formatWhatsAppPhoneInput(e.target.value));
      }}
      onBlur={() => {
        const stored = normalizePhoneForStorage(value);
        if (stored) onChange(formatWhatsAppPhoneInput(stored));
      }}
    />
  );
}
