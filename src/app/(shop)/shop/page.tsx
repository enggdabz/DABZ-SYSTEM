import { permanentRedirect } from "next/navigation";

/**
 * The shop's catalogue moved to the front page.
 *
 * It lived here, with its own hero and its own header, while the front page
 * described the business and offered a button pointing at it - two websites
 * for one shop. The catalogue is now a section of `/`, and this address keeps
 * working because customers have been given it: it is on receipts, in
 * Messenger threads, and in whatever a search engine has already indexed.
 *
 * PERMANENT, so a search engine moves its record across rather than keeping
 * two entries for one catalogue. The rest of `/shop/*` - a product, the
 * designs, the order, the track page - stays exactly where it was.
 */
export default function ShopIndexRedirect() {
  permanentRedirect("/#order-online");
}
