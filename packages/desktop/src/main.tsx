import React from "react";
import ReactDOM from "react-dom/client";
import App from "@framecut/shared/App";
import "@framecut/shared/style.css";
import { setPlatform } from "@framecut/shared/lib/platform";
import { tauriPlatform } from "./platform";

// Inject Tauri platform BEFORE any React render (platform() is called during rendering)
setPlatform(tauriPlatform);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e: unknown) {
    return { error: String(e) };
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: "monospace",
            background: "#fff",
            color: "#c00",
            whiteSpace: "pre-wrap",
          }}
        >
          <b>React Error:</b>
          {"\n"}
          {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
