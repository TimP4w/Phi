import { useEffect, useState } from "react";
import "./tab-panel.scss";
import { TabPanel } from "./TabPanel";

export type TabsMap = Record<string, JSX.Element>;

export type TabsProps = {
  tabs: TabsMap;
};

export const Tabs = ({ tabs }: TabsProps) => {
  const [activeTab, setActiveTab] = useState(0);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const tabWidth = windowWidth < 768 ? 7 : 10;

  return (
    <div className="tabs">
      <div className="tabs__header">
        <div className="tabs__menu">
          {Object.keys(tabs).map((key, index) => (
            <div
              key={key}
              className={
                activeTab === index
                  ? "tabs__tab tabs__tab--active"
                  : "tabs__tab"
              }
              onClick={() => setActiveTab(index)}
            >
              {key}
            </div>
          ))}
          <div
            className="tabs__indicator"
            style={{
              left: `${activeTab * tabWidth + 0.25}rem`, //
            }}
          ></div>
        </div>
      </div>
      <div className="tabs__content">
        {Object.keys(tabs).map((key, index) => (
          <TabPanel key={key} isActive={activeTab === index}>
            {tabs[key]}
          </TabPanel>
        ))}
      </div>
    </div>
  );
};
