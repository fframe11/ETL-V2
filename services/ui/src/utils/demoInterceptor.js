/**
 * Data Serve — Demo Mode Interceptor (Disabled)
 * =============================================
 * Enforces 100% live real-time API execution against backend databases and services.
 * Zero static snapshot fallbacks or mocked request interception.
 */

export function isDemoModeActive() {
  return false;
}

export function installDemoInterceptor() {
  // Intentionally no-op to guarantee pure live network communication
}
