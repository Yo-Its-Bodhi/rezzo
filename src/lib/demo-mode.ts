type DemoEnvironment = {
  NODE_ENV?: string;
  REZZO_DEMO_MODE?: string;
  REZZO_DEMO_PREVIEW?: string;
};

/** A normal production deployment cannot become a demo through the local flag alone. */
export function demoModeEnabled(environment: DemoEnvironment) {
  return (
    environment.REZZO_DEMO_MODE === "true" &&
    (environment.NODE_ENV !== "production" ||
      environment.REZZO_DEMO_PREVIEW === "true")
  );
}
