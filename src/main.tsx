import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// biome-ignore lint/style/noNonNullAssertion: index.html に #root が必ず存在する
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
