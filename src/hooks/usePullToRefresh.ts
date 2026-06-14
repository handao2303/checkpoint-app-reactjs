import { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 70;
const MAX_PULL_DISTANCE = 110;
const REFRESH_HOLD_DISTANCE = 52;

interface UsePullToRefreshOptions {
  scrollElement: HTMLElement | null;
  onRefresh: () => Promise<unknown>;
  disabled?: boolean;
}

export function usePullToRefresh({
  scrollElement,
  onRefresh,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  const touchGesture = useRef<{ x: number; y: number; vertical: boolean | null } | null>(null);

  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!scrollElement) return;

    const updatePullDistance = (distance: number) => {
      pullDistanceRef.current = distance;
      setPullDistance(distance);
    };

    const resetPull = () => {
      touchGesture.current = null;
      setIsPulling(false);
      updatePullDistance(0);
    };

    const refresh = async () => {
      setIsRefreshing(true);
      updatePullDistance(REFRESH_HOLD_DISTANCE);
      scrollElement.scrollTo({ top: 0 });
      try {
        await onRefreshRef.current();
      } finally {
        setIsRefreshing(false);
        updatePullDistance(0);
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (isRefreshing || disabled || scrollElement.scrollTop > 0 || event.touches.length !== 1) return;
      const touch = event.touches[0];
      touchGesture.current = { x: touch.clientX, y: touch.clientY, vertical: null };
    };

    const onTouchMove = (event: TouchEvent) => {
      const gesture = touchGesture.current;
      if (!gesture || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;

      if (gesture.vertical == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        gesture.vertical = Math.abs(dy) > Math.abs(dx);
      }
      if (gesture.vertical === false || dy <= 0 || scrollElement.scrollTop > 0) {
        resetPull();
        return;
      }
      if (gesture.vertical !== true) return;

      event.preventDefault();
      setIsPulling(true);
      updatePullDistance(Math.min(MAX_PULL_DISTANCE, dy * 0.5));
    };

    const onTouchEnd = () => {
      if (!touchGesture.current) return;
      touchGesture.current = null;
      setIsPulling(false);
      if (pullDistanceRef.current >= PULL_THRESHOLD) void refresh();
      else updatePullDistance(0);
    };

    scrollElement.addEventListener("touchstart", onTouchStart, { passive: true });
    scrollElement.addEventListener("touchmove", onTouchMove, { passive: false });
    scrollElement.addEventListener("touchend", onTouchEnd);
    scrollElement.addEventListener("touchcancel", resetPull);
    return () => {
      scrollElement.removeEventListener("touchstart", onTouchStart);
      scrollElement.removeEventListener("touchmove", onTouchMove);
      scrollElement.removeEventListener("touchend", onTouchEnd);
      scrollElement.removeEventListener("touchcancel", resetPull);
    };
  }, [disabled, isRefreshing, scrollElement]);

  return {
    pullDistance,
    pullProgress: Math.min(1, pullDistance / PULL_THRESHOLD),
    isPulling,
    isRefreshing,
    isReady: pullDistance >= PULL_THRESHOLD,
  };
}
