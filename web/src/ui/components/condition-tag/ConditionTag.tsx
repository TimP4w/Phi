import "./conditionTag.scss";
import { Condition } from "../../../core/fluxTree/models/tree";
import { COLORS } from "../../shared/colors";
import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Tooltip from "../tooltip/Tooltip";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  CONDITION_TYPE,
  ERROR_TYPES,
  INFO_TYPES,
  SUCCESS_TYPES,
} from "../../../core/fluxTree/constants/conditions.const";
import { stringToEnum } from "../../../core/shared/enum.utils";

type ConditionTagProps = {
  condition: Condition;
  key: string;
} & React.HTMLAttributes<HTMLDivElement>;

const ConditionTag: React.FC<ConditionTagProps> = ({
  condition,
  key,
}: ConditionTagProps) => {
  const [icon, setIcon] = useState<string>("circle-info");
  const [color, setColor] = useState<string>(COLORS.FONT_GREY);

  useEffect(() => {
    const conditionType = stringToEnum(CONDITION_TYPE, condition.type);
    if (conditionType && SUCCESS_TYPES.includes(conditionType)) {
      if (condition.status) {
        setIcon("circle-check");
        setColor(COLORS.SUCCESS);
        return;
      }
      setIcon("circle-xmark");
      setColor(COLORS.ERROR);
      return;
    }

    if (conditionType && INFO_TYPES.includes(conditionType)) {
      if (condition.status) {
        setIcon("circle-info");
        setColor(COLORS.INFO);
        return;
      }
      setIcon("circle-xmark");
      setColor(COLORS.ERROR);
      return;
    }

    if (conditionType && ERROR_TYPES.includes(conditionType)) {
      setIcon("circle-xmark");
      setColor(COLORS.ERROR);
      return;
    }
    setIcon("circle-info");
    setColor(COLORS.FONT_GREY);
  }, [condition]);

  return (
    <div key={key} className="condition-tag">
      <Tooltip message={condition.message} />
      {<FontAwesomeIcon icon={icon as IconProp} size={"1x"} color={color} />}
      <span className="condition-tag__type" style={{ color: color }}>
        {condition.type}
      </span>
    </div>
  );
};

export default ConditionTag;
