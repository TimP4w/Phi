import { createBrowserRouter } from "react-router-dom";
import AppsView from "../views/apps/Apps.view";
import { ROUTES } from "./routes.enum";
import TreeView from "../views/tree/Tree.view";

export const router = createBrowserRouter([
  {
    id: "Applications",
    path: ROUTES.APPS,
    element: (
      <div className="flex flex-col h-[calc(100vh-64px)]">
        <AppsView />
      </div>
    ),
  },
  {
    id: "Tree",
    path: ROUTES.TREE + "/:nodeUid",
    element: <TreeView />,
  },
]);
