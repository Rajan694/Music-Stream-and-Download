import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import { Providers } from "./components/Providers";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Providers>
      <App />
    </Providers>
  </BrowserRouter>
);