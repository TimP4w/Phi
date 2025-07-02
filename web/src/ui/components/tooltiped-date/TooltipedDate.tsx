import { Tooltip } from "@heroui/react";
import { formatDistance } from "date-fns";

type TooltipedDateProps = {
  date?: Date;
};

const TooltipedDate: React.FC<TooltipedDateProps> = ({ date }) => {
  if (!date) return <>-</>;

  const parsedDate = typeof date === "string" ? new Date(date) : date;

  if (isNaN(parsedDate.getTime())) return <>Invalid date</>;

  return (
    <Tooltip content={parsedDate.toISOString()}>
      {formatDistance(parsedDate, new Date(), {
        includeSeconds: true,
        addSuffix: true,
      })}
    </Tooltip>
  );
};

export default TooltipedDate;
