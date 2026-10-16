function safeWebUrl(value: string | undefined, fallback: string) {
  try {
    const url = new URL(value?.trim() || fallback);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return fallback;
    return url.href;
  } catch {
    return fallback;
  }
}

export function resolveRestaurantLinks(restaurant?: string, menu?: string) {
  const restaurantUrl = safeWebUrl(restaurant, "https://lachingada.ca/");
  const base = new URL(restaurantUrl);
  base.search = "";
  base.hash = "";
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  return {
    restaurantUrl,
    menuUrl: safeWebUrl(menu, new URL("menu", base).href),
  };
}

// Next replaces public variables at build time; pass these as Docker build args.
export const restaurantLinks = resolveRestaurantLinks(
  process.env.NEXT_PUBLIC_RESTAURANT_URL,
  process.env.NEXT_PUBLIC_MENU_URL,
);
