import { useEffect } from "react";
import { usePlayerStore } from "../stores/player.store";

const VOLUME_STEP = 0.05;

const EDITABLE_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || EDITABLE_TAGS.includes(target.tagName);
}

/** Space is how a focused button or link is activated — don't steal it. */
function isActivatable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "BUTTON" || target.tagName === "A";
}

function adjustVolume(delta: number) {
  const { volume, isMuted, setVolume, toggleMute } = usePlayerStore.getState();
  const next = Math.min(1, Math.max(0, Number((volume + delta).toFixed(2))));
  setVolume(next);
  if (isMuted && next > 0) toggleMute();
}

/**
 * Global transport shortcuts. They stay inert until something is loaded, so a
 * guest scrolling the search results still gets normal arrow-key behaviour.
 */
export function useMediaKeys() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditable(event.target)) return;
      // The download dialog is modal; leave its focus trap alone.
      if (document.querySelector("dialog[open]")) return;

      const player = usePlayerStore.getState();
      if (!player.currentTrack) return;

      switch (event.key) {
        case " ":
        case "Spacebar":
          if (isActivatable(event.target)) return;
          event.preventDefault();
          player.setPlaying(!player.isPlaying);
          break;
        case "ArrowRight":
          event.preventDefault();
          player.playNext();
          break;
        case "ArrowLeft":
          event.preventDefault();
          player.playPrevious();
          break;
        case "ArrowUp":
          event.preventDefault();
          adjustVolume(VOLUME_STEP);
          break;
        case "ArrowDown":
          event.preventDefault();
          adjustVolume(-VOLUME_STEP);
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
