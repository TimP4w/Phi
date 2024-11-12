import classNames from "classnames";
import "./tab-panel.scss";

export type TabsProps = {
  children: React.ReactNode;
  isActive: boolean;
};

export const TabPanel = ({ children, isActive }: TabsProps) => (
  <div className={classNames("tab-panel", { "tab-panel--active": isActive })}>
    {children}
  </div>
);
