import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ProfileTextAreaFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  rows?: number;
}

/** Public Coach Profileカード内の自由記述項目（Education / Qualifications等）用の共通入力欄 */
export function ProfileTextAreaField({ label, value, onChange, placeholder, rows = 2 }: ProfileTextAreaFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea
        rows={rows}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder}
      />
    </div>
  );
}
