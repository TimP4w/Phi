import { observer } from "mobx-react-lite";

import { Card, CardBody, CardHeader } from "@heroui/react";
import { ReactNode } from "react";

type WidgetCardProps = {
  span: 1 | 2 | 3 | 4;
  children: ReactNode;
  title: string;
  subtitle: string;
};

const WidgetCard: React.FC<WidgetCardProps> = observer(
  ({ span, title, subtitle, children }: WidgetCardProps) => {
    return (
      <Card className={`lg:col-span-${span} p-3`}>
        <CardHeader className="flex gap-3">
          <div className="flex flex-col">
            <p className="text-md font-bold">{title}</p>
            <p className="text-sm text-default-400">{subtitle}</p>
          </div>
        </CardHeader>
        <CardBody>{children}</CardBody>
      </Card>
    );
  }
);

export default WidgetCard;
