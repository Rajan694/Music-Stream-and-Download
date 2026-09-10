import { Routes, Route, Navigate } from "react-router";
import { RootLayout } from "./layouts/RootLayout";
import { ProfileLayout } from "./layouts/ProfileLayout";
import { SearchPage } from "./pages/SearchPage";
import { PlayerPage } from "./pages/PlayerPage";
import { QueuePage } from "./pages/QueuePage";
import { DownloadsPage } from "./pages/DownloadsPage";
import { VideoPage } from "./pages/VideoPage";
import { PlaylistPage } from "./pages/PlaylistPage";
import { ProfilePage } from "./pages/ProfilePage";
import { HistoryPage } from "./pages/HistoryPage";
import { PlaylistsPage } from "./pages/PlaylistsPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<Navigate to="/search" replace />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/player" element={<PlayerPage />} />
        <Route path="/queue" element={<QueuePage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path="/video/:id" element={<VideoPage />} />
        <Route path="/playlist/:id" element={<PlaylistPage />} />
        <Route path="/profile" element={<ProfileLayout />}>
          <Route index element={<ProfilePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="playlists" element={<PlaylistsPage />} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}