import { useFrame } from "@react-three/fiber";
import { usePlayback } from "./store";

/**
 * Single frame-loop that advances playback progress.
 * Priority -2 guarantees this runs BEFORE Vehicle (-1) and Cameras (+1),
 * so every consumer this frame reads the same progress value.
 */
export function SceneAdvancer() {
  useFrame((_, dt) => {
    usePlayback.getState().advance(Math.min(0.05, dt));
  }, -2);
  return null;
}
