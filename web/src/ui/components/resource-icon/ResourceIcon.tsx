import { observer } from "mobx-react-lite";
import { GroupKind } from "../../../core/fluxTree/models/groupKind";
import { lookupIcon } from "../../../core/fluxTree/registry";

type AppLogoProps = {
  groupKind?: GroupKind;
};

const AppLogo: React.FC<AppLogoProps> = observer(({ groupKind }: AppLogoProps) => {
  return (
    <div className="app-logo text-white">
      {groupKind ? lookupIcon(groupKind) : <></>}
    </div>
  );
});

export default AppLogo;
