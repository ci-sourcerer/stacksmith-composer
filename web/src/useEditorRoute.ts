import { useEffect, useState } from "react";
import {
  editorHash,
  initialEditorRoute,
  parseEditorRoute,
  sameStack,
  type EditorRoute,
} from "./navigation";

export function useEditorRoute(confirmStackChange: () => boolean) {
  const [route, setRoute] = useState(initialEditorRoute);

  function navigate(next: EditorRoute, replace = false): boolean {
    if (!sameStack(route.stack, next.stack) && !confirmStackChange())
      return false;
    if (
      editorHash(route) !== editorHash(next) ||
      window.location.hash !== editorHash(next)
    ) {
      window.history[replace ? "replaceState" : "pushState"](
        window.history.state,
        "",
        editorHash(next),
      );
      setRoute(next);
    }
    return true;
  }

  useEffect(() => {
    function followLocation() {
      const next = parseEditorRoute(window.location.hash);
      if (!sameStack(route.stack, next.stack) && !confirmStackChange()) {
        window.history.pushState(window.history.state, "", editorHash(route));
        return;
      }
      // Keep the stack identity stable when only the view or mode changes.
      setRoute(
        sameStack(route.stack, next.stack)
          ? { ...next, stack: route.stack }
          : next,
      );
    }
    window.addEventListener("hashchange", followLocation);
    return () => window.removeEventListener("hashchange", followLocation);
  }, [route, confirmStackChange]);

  return { route, navigate };
}
