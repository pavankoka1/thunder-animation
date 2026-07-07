import App from "./App.jsx";
import AnalysePage from "./pages/AnalysePage.jsx";
import BetspotActivationPage from "./pages/BetspotActivationPage.jsx";
import ExtractPathPage from "./pages/ExtractPathPage.jsx";
import InnerEnergyLabPage from "./pages/InnerEnergyLabPage.jsx";
import PathsPage from "./pages/PathsPage.jsx";
import WebGLPage from "./pages/WebGLPage.jsx";

function currentPath() {
  return window.location.pathname.replace(/\/$/, "") || "/";
}

export default function Root() {
  const path = currentPath();
  if (path === "/webgl") return <WebGLPage />;
  if (path === "/analyse") return <AnalysePage />;
  if (path === "/paths") return <PathsPage />;
  if (path === "/betspot-activation") return <BetspotActivationPage />;
  if (path === "/inner-energy-lab") return <InnerEnergyLabPage />;
  if (path === "/extract-path") return <ExtractPathPage />;
  return <App />;
}
