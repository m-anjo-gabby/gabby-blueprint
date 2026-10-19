import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { savePhrase } from '@/actions/adminTTSAction';

export function useSaveAzureSpeech() {
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const save = async (...args: Parameters<typeof savePhrase>) => {
    setIsSaving(true);
    const result = await savePhrase(...args);
    if (result.success) {
      router.refresh();
    }
    setIsSaving(false);
    return result;
  };

  return { save, isSaving };
}
