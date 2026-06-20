import { useState } from "react";
import { Breadcrumbs } from "@heroui/react";
import { useMediaQuery } from "../../../core/utils/useMediaQuery";

export type Crumb = { key: string; label: string; onPress?: () => void };

type Props = { items: Crumb[] };

// On mobile the parent chain collapses behind a tappable "…" so a deep
// breadcrumb never runs off-screen; tapping it expands the hidden segments.
const ResourceBreadcrumbs: React.FC<Props> = ({ items }) => {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const first = items[0];
  const last = items.length > 1 ? items[items.length - 1] : undefined;
  const middle = items.slice(1, items.length > 1 ? -1 : undefined);
  const collapsed = isMobile && !expanded && middle.length > 0;

  return (
    <Breadcrumbs className="min-w-0">
      <Breadcrumbs.Item onPress={first.onPress}>{first.label}</Breadcrumbs.Item>

      {collapsed ? (
        <Breadcrumbs.Item onPress={() => setExpanded(true)}>…</Breadcrumbs.Item>
      ) : (
        middle.map((c) => (
          <Breadcrumbs.Item
            key={c.key}
            onPress={c.onPress}
            className={isMobile && expanded ? "animate-crumb-in" : undefined}
          >
            {c.label}
          </Breadcrumbs.Item>
        ))
      )}

      {last && <Breadcrumbs.Item>{last.label}</Breadcrumbs.Item>}
    </Breadcrumbs>
  );
};

export default ResourceBreadcrumbs;
