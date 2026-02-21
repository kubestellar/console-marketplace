import { useEffect, useState } from 'react';

interface VersionInfo {
  latestVersion: string | null;
  currentVersion: string | null;
  updateAvailable: boolean;
  loading: boolean;
  error: string | null;
}

/** Compare two semver strings. Returns true if `a` is newer than `b`. */
function isNewerVersion(a: string, b: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const [aMajor, aMinor, aPatch] = parse(a);
  const [bMajor, bMinor, bPatch] = parse(b);
  if (aMajor !== bMajor) return aMajor > bMajor;
  if (aMinor !== bMinor) return aMinor > bMinor;
  return aPatch > bPatch;
}

/**
 * Hook to check for marketplace updates via the backend proxy.
 * Uses /api/proxy/ to avoid CORS issues with direct external fetches.
 */
export function useVersionCheck(currentVersion: string | null = null): VersionInfo {
  const [state, setState] = useState<VersionInfo>({
    latestVersion: null,
    currentVersion,
    updateAvailable: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    const checkVersion = async () => {
      try {
        const response = await fetch(
          '/api/proxy/https://api.github.com/repos/kubestellar/console-marketplace/releases/latest',
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          }
        );

        if (!response.ok) {
          throw new Error(`Version check failed: ${response.statusText}`);
        }

        const data = await response.json();
        const latestVersion = data.tag_name ?? null;
        const updateAvailable =
          latestVersion !== null &&
          currentVersion !== null &&
          isNewerVersion(latestVersion, currentVersion);

        setState({
          latestVersion,
          currentVersion,
          updateAvailable,
          loading: false,
          error: null,
        });
      } catch (err) {
        // AbortError is expected on component unmount — do not update state.
        if ((err as Error).name === 'AbortError') return;
        setState(prev => ({
          ...prev,
          loading: false,
          error: (err as Error).message,
        }));
      }
    };

    checkVersion();

    return () => controller.abort();
  }, [currentVersion]);

  return state;
}
