import { Dropdown } from "@heroui/react";
import { ChevronDown } from "lucide-react";

export type FilterOption = { key: string; label: string };

type Props = {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
};

/** Multi-select filter as a compact dropdown; used in place of chip rows on mobile. */
const FilterDropdown: React.FC<Props> = ({ label, options, selected, onChange }) => (
  <Dropdown>
    <Dropdown.Trigger className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border bg-surface text-xs text-muted hover:text-foreground hover:bg-surface-secondary transition-colors aria-expanded:text-foreground">
      <span className="text-foreground">{label}</span>
      {selected.length > 0 && (
        <span className="flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-accent text-[10px] font-semibold text-accent-foreground tabular-nums">
          {selected.length}
        </span>
      )}
      <ChevronDown className="w-3.5 h-3.5" />
    </Dropdown.Trigger>
    <Dropdown.Popover className="rounded-lg! min-w-40">
      <Dropdown.Menu
        selectionMode="multiple"
        selectedKeys={new Set(selected)}
        onSelectionChange={(keys) =>
          onChange(
            keys === "all"
              ? options.map((o) => o.key)
              : Array.from(keys, (k) => String(k)),
          )
        }
      >
        {options.map((o) => (
          <Dropdown.Item key={o.key} id={o.key}>
            <Dropdown.ItemIndicator />
            {o.label}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown.Popover>
  </Dropdown>
);

export default FilterDropdown;
