self.addEventListener("push", (event) => {
  let data;
  try { data = event.data?.json(); } catch { return; }
  if (!data || typeof data.title !== "string" || typeof data.body !== "string") return;
  let url;
  try { url = new URL(data.url, self.location.origin); } catch { return; }
  if (url.origin !== self.location.origin || url.pathname !== "/waitlist") return;
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: "rezzo-waitlist",
    data: { url: url.href },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let url;
  try { url = new URL(event.notification.data.url, self.location.origin); } catch { return; }
  if (url.origin !== self.location.origin || url.pathname !== "/waitlist") return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => new URL(client.url).pathname === "/waitlist");
    if (existing) {
      const navigated = await existing.navigate(url.href);
      if (navigated) return navigated.focus();
    }
    return self.clients.openWindow(url.href);
  })());
});
