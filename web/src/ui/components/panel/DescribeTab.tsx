import { atomOneDark, CodeBlock } from "react-code-blocks";
import * as jsyml from "js-yaml";
import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { COLORS } from "../../shared/colors";

type PanelProps = {
  describe?: string;
};

export const DescribeTab = observer(({ describe }: PanelProps) => {
  const yaml = useMemo(() => {
    if (!describe) {
      return "";
    }
    type YamlObject = {
      object: {
        metadata: {
          managedFields?: unknown[];
        };
      };
    };
    const yamlObject: YamlObject = jsyml.load(describe) as YamlObject;
    if (yamlObject.object && yamlObject.object.metadata) {
      delete yamlObject.object.metadata.managedFields;
    }
    return jsyml.dump(yamlObject);
  }, [describe]);

  if (!describe) {
    return <div className="describe-tab">No Node</div>;
  }

  return (
    <div className="describe-tab">
      <div className="describe-tab__code">
        {!describe ? (
          <div>Loading...</div>
        ) : (
          <CodeBlock
            text={yaml}
            language={"yaml"}
            showLineNumbers={true}
            customStyle={{
              background: COLORS.MAIN,
            }}
            codeContainerStyle={{
              backgroundColor: COLORS.MAIN,
              padding: 0,
              margin: 0,
            }}
            lineNumberContainerStyle={{}}
            theme={atomOneDark}
          />
        )}
      </div>
    </div>
  );
});
