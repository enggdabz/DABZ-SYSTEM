/**
 * What "move this photo" means.
 *
 * The first photo is the picture on the product card - on the shop, on the
 * admin list, and in the Messenger message. So the order is not decoration,
 * and until now the only way to change it was to delete the photos in front
 * of the one you wanted and upload them again.
 *
 * The move is worked out here, as a plain list operation, for the same reason
 * the tiles and the chips on the orders screen share `list.ts`: the button the
 * owner taps and the array the database is asked to store have to come from
 * one idea of what happened. The screen uses this to draw the buttons, the
 * client uses it to build the new order, and the Server Action re-derives it
 * rather than trusting what the browser sent.
 */

/**
 * `first` is not the same as repeating `up`. Making a photo the main one is a
 * single thing the owner wants, and asking them to tap `up` four times to do
 * it is how the main picture ends up wrong on a shop with eight photos.
 */
export type PhotoMove = "up" | "down" | "first";

export const PHOTO_MOVE_LABELS: Record<PhotoMove, string> = {
  up: "Move left",
  down: "Move right",
  first: "Make it the main photo",
};

/**
 * The ids in their new order.
 *
 * Returns the list UNCHANGED when the move cannot happen - the first photo
 * asked to move up, an id that is not in the list. A caller that gets the same
 * order back has asked for nothing, which is exactly what it should then send.
 */
export function movePhoto(
  ids: readonly string[],
  id: string,
  move: PhotoMove,
): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];

  const to = move === "first" ? 0 : move === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length || to === from) return [...ids];

  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Whether a move would change anything, so a button that cannot act is not drawn. */
export function canMovePhoto(
  ids: readonly string[],
  id: string,
  move: PhotoMove,
): boolean {
  const from = ids.indexOf(id);
  if (from === -1) return false;
  if (move === "down") return from < ids.length - 1;
  // `up` and `first` are both impossible for the photo that is already first.
  return from > 0;
}

/**
 * Whether a proposed order is a rearrangement of the one the shop has.
 *
 * The database checks this too - it is the whole of
 * `reorder_online_product_images`' argument validation - but the Server Action
 * checks it first so the owner gets a sentence rather than a raised exception,
 * and so a browser that sends a shorter list never reaches the database at
 * all. Same list, same members, any order.
 */
export function isSameSet(
  current: readonly string[],
  proposed: readonly string[],
): boolean {
  if (current.length !== proposed.length) return false;
  if (new Set(proposed).size !== proposed.length) return false;
  const have = new Set(current);
  return proposed.every((id) => have.has(id));
}
