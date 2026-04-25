import { observer } from "mobx-react-lite";

import { Card, CardBody, CardHeader } from "@heroui/react";
import { ReactNode } from "react";

type WidgetCardProps = {
  span?: 1 | 2 | 3 | 4;
  children: ReactNode;
  title: string;
  subtitle?: string;
  compact?: boolean;
};

const WidgetCard: React.FC<WidgetCardProps> = observer(
  ({ span = 1, title, subtitle, children, compact }: WidgetCardProps) => {
    if (compact) {
      return (
        <Card className="min-w-[210px] max-w-[280px] flex-shrink-0 h-[150px] p-2">
          <CardHeader className="pb-1 pt-1 px-2 flex-shrink-0">
            <p className="text-sm font-semibold leading-tight">{title}</p>
          </CardHeader>
          <CardBody className="px-2 pt-0 overflow-hidden">{children}</CardBody>
        </Card>
      );
    }

    return (
      <Card className={`lg:col-span-${span} p-3`}>
        <CardHeader className="flex gap-3">
          <div className="flex flex-col">
            <p className="text-md font-bold">{title}</p>
            {subtitle && <p className="text-sm text-default-400">{subtitle}</p>}
          </div>
        </CardHeader>
        <CardBody>{children}</CardBody>
      </Card>
    );
  }
);

export default WidgetCard;
