import { formatDistance } from "date-fns";
import "./panel.scss";

type InfoRowProps = {
  name: string;
  value?: string | boolean | Date;
};

export const InfoRow = ({ name, value }: InfoRowProps) => {
  return (
    <tr className="info-tab__row">
      <td>
        <span>{name}</span>
      </td>
      <td>
        <span>{typeof value === "boolean" && value.toString()}</span>
        <span>{typeof value === "string" && value}</span>
        <span>
          {typeof value === "object" &&
            formatDistance(value, new Date(), {
              addSuffix: true,
              includeSeconds: true,
            })}
        </span>
      </td>
    </tr>
  );
};
