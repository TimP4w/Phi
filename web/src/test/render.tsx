import { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HeroUIProvider } from "@heroui/react";
import { ReactFlowProvider } from "@xyflow/react";
import { Provider } from "inversify-react";
import { Container } from "inversify";
import { FluxTreeStore } from "../core/fluxTree/stores/fluxTree.store";
import { EventsStore } from "../core/fluxTree/stores/events.store";
import { MetricsStore } from "../core/metrics/stores/metrics.store";
import { TYPES } from "../core/shared/types";

// The use-case / service symbols a component might reach through useInjection; bound to inert stubs by default, a test that asserts on one rebinds it with its own spy before rendering (container.rebind(...)).
const USECASE_SYMBOLS = [
  TYPES.ReconcileUseCase,
  TYPES.SuspendUseCase,
  TYPES.ResumeUseCase,
  TYPES.WatchLogsUseCase,
  TYPES.DescribeNodeUseCase,
  TYPES.FetchEventsUseCase,
  TYPES.LayoutTreeUseCase,
  TYPES.NetworkTopologyUseCase,
  TYPES.HandleWsMessageUseCase,
  TYPES.WatchMetricsUseCase,
  TYPES.StopWatchMetricsUseCase,
  TYPES.GetTrivyFindingsUseCase,
];

const SERVICE_SYMBOLS = [
  TYPES.TreeService,
  TYPES.ResourceService,
  TYPES.TrivyService,
  TYPES.WebSocket,
  TYPES.Http,
];

/** A DI container wired with real stores and inert use-case/service stubs. */
export function makeTestContainer(): Container {
  const c = new Container();
  c.bind(FluxTreeStore).toSelf().inSingletonScope();
  c.bind(EventsStore).toSelf().inSingletonScope();
  c.bind(MetricsStore).toSelf().inSingletonScope();
  for (const sym of USECASE_SYMBOLS) {
    // execute resolves to an empty graph so the layout/topology use cases (which destructure { nodes, edges }) are safe; void use cases ignore the value.
    c.bind(sym).toConstantValue({
      execute: () => Promise.resolve({ nodes: [], edges: [] }),
      relayout: () => Promise.resolve({ nodes: [], edges: [] }),
    });
  }
  // DescribeNodeUseCase yields a YAML string, not a graph; override the generic stub.
  c.rebind(TYPES.DescribeNodeUseCase).toConstantValue({ execute: () => Promise.resolve("") });
  for (const sym of SERVICE_SYMBOLS) {
    c.bind(sym).toConstantValue({});
  }
  return c;
}

type Options = Omit<RenderOptions, "wrapper"> & {
  container?: Container;
  route?: string;
};

export function renderWithProviders(ui: ReactElement, opts: Options = {}) {
  const { container = makeTestContainer(), route = "/", ...rest } = opts;
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider container={container}>
      <MemoryRouter initialEntries={[route]}>
        <HeroUIProvider>
          <ReactFlowProvider>{children}</ReactFlowProvider>
        </HeroUIProvider>
      </MemoryRouter>
    </Provider>
  );
  return { container, ...render(ui, { wrapper: Wrapper, ...rest }) };
}
