import { useFrame } from "@react-three/fiber";
import { usePlayback } from "./store";

/**
 * Single frame-loop that advances playback progress.
 * Priority = -10 so it runs BEFORE Vehicle (0) and Cameras (10).
 * Frame order: advance → vehicle transform → camera follow.
 */
export function SceneAdvancer() {
  useFrame((_, dt) => {
    usePlayback.getState().advance(Math.min(0.1, dt));
  }, -10);
  return null;
}

