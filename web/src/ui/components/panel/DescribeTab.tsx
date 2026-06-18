import { atomOneDark, CodeBlock } from "react-code-blocks";
import * as jsyml from "js-yaml";
import { useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { COLORS } from "../../shared/colors";
import { Button } from "@heroui/react";
import { Check, Copy, FileText, Loader2 } from "lucide-react";

type DescribeTabProps = {
  describe?: string;
  isLoading?: boolean;
};

export const DescribeTab = observer(({ describe, isLoading }: DescribeTabProps) => {
  const [copied, setCopied] = useState(false);

  const yaml = useMemo(() => {
    if (!describe) return "";
    type YamlObject = {
      object: { metadata: { managedFields?: unknown[] } };
    };
    const yamlObject: YamlObject = jsyml.load(describe) as YamlObject;
    if (yamlObject.object?.metadata) {
      delete yamlObject.object.metadata.managedFields;
    }
    return jsyml.dump(yamlObject);
  }, [describe]);

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-default-400 py-20">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading resource definition…</span>
      </div>
    );
  }

  if (!describe) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-default-400">
        <FileText className="w-8 h-8 opacity-30" />
        <span className="text-sm">No resource definition</span>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <Button
        size="sm"
        variant="flat"
        className="absolute top-3 right-4 z-10"
        onPress={handleCopy}
        startContent={
          copied ? (
            <Check className="w-3.5 h-3.5 text-success" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )
        }
      >
        {copied ? "Copied!" : "Copy"}
      </Button>
      <CodeBlock
        text={yaml}
        language="yaml"
        showLineNumbers
        customStyle={{ background: COLORS.MAIN }}
        codeContainerStyle={{
          backgroundColor: COLORS.MAIN,
          padding: 0,
          margin: 0,
        }}
        lineNumberContainerStyle={{}}
        theme={atomOneDark}
      />
    </div>
  );
});
