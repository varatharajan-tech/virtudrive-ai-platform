import { useFrame } from "@react-three/fiber";
import { usePlayback } from "./store";

/** Single frame-loop that advances playback progress. Placed inside <Canvas>. */
export function SceneAdvancer() {
  useFrame((_, dt) => {
    usePlayback.getState().advance(Math.min(0.1, dt));
  });
  return null;
}
