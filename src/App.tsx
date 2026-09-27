import { Route, Routes } from "react-router-dom";
import { TabBar } from "./components/layout/TabBar";
import { TripListPage } from "./components/trip/TripListPage";
import { TripDetailPage } from "./components/trip/TripDetailPage";

export default function App() {
  return (
    <div className="app-shell">
      <TabBar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<TripListPage />} />
          <Route path="/trips/:tripId" element={<TripDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
