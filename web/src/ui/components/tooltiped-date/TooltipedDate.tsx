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
    <Tooltip>
      <Tooltip.Trigger>
        <span>
          {formatDistance(parsedDate, new Date(), {
            includeSeconds: true,
            addSuffix: true,
          })}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content>{parsedDate.toISOString()}</Tooltip.Content>
    </Tooltip>
  );
};

export default TooltipedDate;
