import type { NutritionInfo } from '@/lib/shopify';
import { Flame, Dumbbell, Wheat, Droplets, Leaf, Candy, CircleDot } from 'lucide-react';

interface NutritionLabelProps {
  nutrition: NutritionInfo;
}

const NUTRIENTS: Array<{ key: keyof NutritionInfo; label: string; unit: string; icon: typeof Flame; accent?: boolean }> = [
  { key: 'calories', label: 'Calories', unit: '', icon: Flame, accent: true },
  { key: 'protein', label: 'Protein', unit: 'g', icon: Dumbbell },
  { key: 'carbs', label: 'Carbs', unit: 'g', icon: Wheat },
  { key: 'fat', label: 'Fat', unit: 'g', icon: Droplets },
  { key: 'fiber', label: 'Fiber', unit: 'g', icon: Leaf },
  { key: 'sugar', label: 'Sugar', unit: 'g', icon: Candy },
  { key: 'sodium', label: 'Sodium', unit: 'mg', icon: CircleDot },
];

export function NutritionLabel({ nutrition }: NutritionLabelProps) {
  const available = NUTRIENTS.filter(n => nutrition[n.key] !== undefined);
  if (available.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-5">
      <h2 className="font-serif text-lg font-bold text-foreground mb-4">Nutrition Facts</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {available.map(({ key, label, unit, icon: Icon, accent }) => (
          <div
            key={key}
            className={`flex items-center gap-3 rounded-lg p-3 ${
              accent ? 'bg-accent/10 border border-accent/20' : 'bg-card border border-border'
            }`}
          >
            <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${accent ? 'text-accent' : 'text-muted-foreground'}`} />
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-bold text-foreground">
                {nutrition[key]}{unit}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
