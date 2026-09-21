/*
  The service worker that receives notifications (Phase 11).

  This is plain JavaScript served straight from /sw.js, not built by Next.js.
  It has to sit at the root of the site, because a service worker can only
  control pages at or below its own path - one at /_next/sw.js could not
  receive anything for the app.

  It is deliberately tiny. A service worker runs outside every screen, stays
  registered after the tab is closed, and updates on its own schedule, so
  anything clever in here is hard to change later and harder to debug. All it
  does is show what the server already decided to say, and open the screen the
  server named.
*/

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let message;
  try {
    message = event.data.json();
  } catch {
    // Something sent a payload this version does not understand. Showing a
    // half-parsed notification would be worse than showing none.
    return;
  }

  const title = message.title || "Dabz System";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: message.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      /*
        The tag is what stops the phone stacking up a week of unread
        summaries: a new notification with the same tag REPLACES the old one.
        Yesterday's "3 things need you today" is not worth keeping once today's
        has arrived.
      */
      tag: message.tag || "dabz",
      data: { url: message.url || "/overview" },
      // The shop's warnings are not urgent enough to override a silent phone.
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || "/overview";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      /*
        Re-use a tab that is already open rather than opening a second one.
        Somebody who taps the notification while the counter screen is up
        should land on the right screen in the window they were using, not
        find two copies of the app fighting over the same session.
      */
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              // Navigating a client can be refused across origins; focusing it
              // is still better than opening a duplicate window.
            }
          }
          return;
        }
      }

      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
