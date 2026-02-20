import type { ChipToken } from './slashCommands';

type Props = {
  chips: ChipToken[];
  onRemove: (type: ChipToken['type']) => void;
};

const chipStyles: Record<ChipToken['type'], string> = {
  priority: 'bg-foreground/8 text-foreground/70',
  due: 'bg-foreground/8 text-foreground/70',
  today: 'bg-foreground/10 text-foreground/80',
};

export function ChipRow({ chips, onRemove }: Props) {
  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-3 pb-1.5 flex-wrap">
      {chips.map((chip) => (
        <span
          key={chip.type}
          className={[
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
            chipStyles[chip.type],
          ].join(' ')}
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove(chip.type)}
            className="ml-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
            aria-label={`Remove ${chip.label}`}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3 3l4 4M7 3l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  );
}
