import { Outlet } from "react-router";
import { AppShell } from "../components/layout/AppShell";
import { PlayerProvider } from "../components/player/PlayerProvider";
import { GlobalMiniPlayer } from "../components/player/GlobalMiniPlayer";
import { DownloadDialog } from "../components/player/DownloadDialog";

/**
 * The player, mini-player and download dialog are siblings of AppShell, not
 * children: they position themselves against the viewport, and nesting them
 * inside the shell's layout container puts them in the wrong stacking context.
 */
export function RootLayout() {
  return (
    <>
      <AppShell>
        <Outlet />
      </AppShell>
      <PlayerProvider />
      <GlobalMiniPlayer />
      <DownloadDialog />
    </>
  );
}
