import { TooltipProps } from "recharts";

interface DataItem {
  name: string;
  value: number;
}

const ChartTooltip = ({
  active,
  payload,
}: TooltipProps<number, string> & {
  payload?: Array<{ payload: DataItem }>;
}) => {
  if (active && payload && payload.length) {
    const item = payload[0].payload as DataItem;
    return (
      <div className="bg-background border border-default-200 rounded px-2 py-1 text-xs shadow">
        {item.name}: {item.value}
      </div>
    );
  }
  return null;
};

export default ChartTooltip;
