/**
 * Makes the one pair of keys notifications need (Phase 11).
 *
 * WHAT THESE ARE
 * A push service - Google's for an Android phone, Apple's for an iPhone -
 * will not carry a notification from just anybody. VAPID is how the shop
 * signs each one: the PUBLIC key is handed to the browser when it subscribes,
 * and the PRIVATE key signs every message sent afterwards. The pair proves the
 * notifications come from this shop and not from somebody who found the
 * subscription URL.
 *
 * Generate them ONCE and keep them. Changing them later invalidates every
 * subscription that already exists, and every phone has to be turned on again.
 *
 * Run with: npm run push:keys
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Two keys, generated just now. Nothing else in the system has seen them.

Add BOTH to .env.local so they work on this computer:

  NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}
  VAPID_PRIVATE_KEY=${privateKey}

Then add the SAME two to Vercel, under
Settings -> Environment Variables, for Production. The app has to be
redeployed afterwards before the keys take effect.

Three things worth knowing:

  * The public one is called NEXT_PUBLIC_ on purpose. It is sent to every
    browser that subscribes, which is what it is for. It is not a secret.

  * The private one IS a secret. Anyone holding it can send notifications
    that look like they came from your shop. Do not commit it, do not paste
    it into a message, and if it ever leaks, run this again and turn the
    phones back on.

  * Generate them once. Running this again gives a different pair, and every
    phone that was already receiving notifications stops until somebody
    switches it on again.

Until both are set, Settings says notifications are not set up yet and offers
no button - the same as every other figure the system will not invent.
`);
