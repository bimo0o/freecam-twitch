export {};
declare global {
  interface Window {
    Twitch?: { ext: {
      onAuthorized(cb: (auth: { token: string; channelId: string; userId: string }) => void): void;
      onContext(cb: (context: { hlsLatencyBroadcaster?: number; isPaused?: boolean }, changed: string[]) => void): void;
      onVisibilityChanged(cb: (visible: boolean) => void): void;
    } };
  }
}
