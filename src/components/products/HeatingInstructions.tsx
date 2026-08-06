import { Microwave } from 'lucide-react';

interface HeatingInstructionsProps {
  instructions: string;
}

export function HeatingInstructions({ instructions }: HeatingInstructionsProps) {
  // Split by newlines or numbered steps
  const steps = instructions
    .split(/\n|(?=\d+\.\s)/)
    .map(s => s.trim())
    .filter(Boolean);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Microwave aria-hidden="true" className="h-5 w-5 text-primary" />
        <h2 className="font-serif text-lg font-bold text-foreground">Heating Instructions</h2>
      </div>
      {steps.length > 1 ? (
        <ol className="space-y-2 list-decimal list-inside text-sm text-muted-foreground leading-relaxed">
          {steps.map((step) => (
            <li key={step}>{step.replace(/^\d+\.\s*/, '')}</li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground leading-relaxed">{instructions}</p>
      )}
    </div>
  );
}
