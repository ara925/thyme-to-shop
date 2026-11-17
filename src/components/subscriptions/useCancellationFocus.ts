import { useEffect, useRef } from 'react';

export function useCancellationFocus(confirm: boolean, busy: boolean) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const previous = useRef({ confirm: false, busy });

  useEffect(() => {
    const was = previous.current;
    if (confirm && (!was.confirm || (was.busy && !busy))) {
      // Focus the safe choice; a second Enter must never confirm cancellation by default.
      keepRef.current?.focus();
    } else if (!confirm && (was.confirm || (was.busy && !busy))) {
      const trigger = triggerRef.current;
      if (trigger && !trigger.disabled) trigger.focus();
      else resultRef.current?.focus();
    }
    previous.current = { confirm, busy };
  }, [confirm, busy]);

  return { keepRef, triggerRef, resultRef };
}
