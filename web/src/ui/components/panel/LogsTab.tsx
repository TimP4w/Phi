import { observer } from "mobx-react-lite";
import "./panel.scss";
import AnsiToHtml from "ansi-to-html";
import { useInjection } from "inversify-react";
import { FluxTreeStore } from "../../../core/fluxTree/stores/fluxTree.store";
import { format } from "date-fns";

const ansiToHtml = new AnsiToHtml();

export const LogsTab = observer(() => {
  const fluxTreeStore = useInjection(FluxTreeStore);

  return (
    <div className="logs-tab">
      {fluxTreeStore.selectedNode ? (
        <div className="logs-tab__logs">
          {fluxTreeStore.selectedNode?.logs.map((log, index) => (
            <div key={index} className="logs-tab__log-row">
              <span className="logs-tab__log-container">{log.container} </span>
              <span className="logs-tab__log-timestamp">
                {format(log.timestamp, "yyyy-MM-dd HH:mm:ss:SSSS")}
              </span>
              <span
                dangerouslySetInnerHTML={{ __html: ansiToHtml.toHtml(log.log) }} // TODO: this is a security risk... looks nice but do we want to have it? Or at least sanitize it
                className="logs-tab__log-log"
              ></span>
              <br />
            </div>
          ))}
        </div>
      ) : (
        <div>No Node</div>
      )}
    </div>
  );
});
