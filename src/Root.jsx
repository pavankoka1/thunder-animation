import App from "./App.jsx";
import WebGLPage from "./pages/WebGLPage.jsx";

function isWebGLRoute() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  return path === "/webgl";
}

export default function Root() {
  return isWebGLRoute() ? <WebGLPage /> : <App />;
}
