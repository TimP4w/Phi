import "./tooltip.scss";
import { useEffect, useRef, useState } from "react";
import classNames from "classnames";

type TooltipProps = {
  //children: JSX.Element;
  message: string;
};

const Tooltip: React.FC<TooltipProps> = ({
  // children,
  message,
}: TooltipProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<
    "left" | "right" | "center"
  >("center");

  useEffect(() => {
    // A bit of a naive approach, however it works fine
    const tooltipElement = tooltipRef.current;
    if (tooltipElement) {
      const rect = tooltipElement?.getBoundingClientRect();

      if (rect.left - rect.width < 0) {
        setTooltipPosition("right");
      }

      if (
        rect.right + rect.width >
        (window.innerWidth || document.documentElement.clientWidth)
      ) {
        setTooltipPosition("left");
      }
    }
  }, [showTooltip]);

  return (
    <div
      className="tooltip"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      ref={tooltipRef}
    >
      <div className="tooltip__content">
        {showTooltip && (
          <div
            className={classNames("tooltip__container", {
              "tooltip__container--left": tooltipPosition === "left",
              "tooltip__container--right": tooltipPosition === "right",
            })}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default Tooltip;
