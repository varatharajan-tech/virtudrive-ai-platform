import { Component, type ReactNode } from "react";

/** Swallows render errors from optional scene parts (e.g. remote HDR env maps). */
export class SoftBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[Sim3D] optional scene part failed, continuing without it:", err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
