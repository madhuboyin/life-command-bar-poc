const TRACKED_ANCHOR_TODAY_PREFIX = "tracked-anchor:";

export function toTrackedAnchorTodayItemId(anchorId: string) {
  return `${TRACKED_ANCHOR_TODAY_PREFIX}${anchorId}`;
}

export function fromTrackedAnchorTodayItemId(itemId: string) {
  if (!itemId.startsWith(TRACKED_ANCHOR_TODAY_PREFIX)) {
    return null;
  }

  const anchorId = itemId.slice(TRACKED_ANCHOR_TODAY_PREFIX.length).trim();
  return anchorId.length > 0 ? anchorId : null;
}
