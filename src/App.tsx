import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/Auth";
import { WorkshopProvider } from "./context/Workshop";
import { DraftProvider } from "./context/Drafts";
import { Shell } from "./components/Shell";
import { Analytics } from "./pages/Analytics";
import { Board } from "./pages/Board";
import { Dashboard } from "./pages/Dashboard";
import { Filaments } from "./pages/Filaments";
import { Milestones } from "./pages/Milestones";
import { Products } from "./pages/Products";
import { WorkspacePage } from "./pages/WorkspacePage";

function WorkshopApp() {
  const { ready, user } = useAuth();
  if (!ready) {
    return (
      <div className="stage">
        <div className="frame loading-frame">
          <div className="orb" />
          <p>Loading the workshop…</p>
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="stage">
        <div className="frame loading-frame">
          <p>Couldn't open the workshop.</p>
        </div>
      </div>
    );
  }
  return (
    <WorkshopProvider>
      <DraftProvider>
        <Shell />
      </DraftProvider>
    </WorkshopProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/app" element={<WorkshopApp />}>
          <Route index element={<Dashboard />} />
          <Route path="filaments" element={<Filaments />} />
          <Route path="products" element={<Products />} />
          <Route path="milestones" element={<Milestones />} />
          <Route path="board" element={<Board />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="workspace" element={<WorkspacePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  );
}
