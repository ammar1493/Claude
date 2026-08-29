declare module "plotly.js-dist-min" {
  export interface PlotlyStatic {
    react(
      root: HTMLElement,
      data: Record<string, unknown>[],
      layout?: Record<string, unknown>,
      config?: Record<string, unknown>,
    ): Promise<HTMLElement>;
    newPlot(
      root: HTMLElement,
      data: Record<string, unknown>[],
      layout?: Record<string, unknown>,
      config?: Record<string, unknown>,
    ): Promise<HTMLElement>;
    purge(root: HTMLElement): void;
    Plots: { resize(root: HTMLElement): void };
  }
  const Plotly: PlotlyStatic;
  export default Plotly;
}
