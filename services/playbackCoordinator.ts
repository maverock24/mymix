
type PauseCallback = () => void;

class PlaybackCoordinator {
  private listeners: Map<string, { callback: PauseCallback; groupId: string }> = new Map();

  /**
   * Register a listener to be paused when other groups start playing.
   * @param id Unique identifier for the player instance
   * @param groupId Group identifier (players in the same group won't pause each other)
   * @param callback Function to call to pause playback
   * @returns Function to unregister
   */
  register(id: string, groupId: string, callback: PauseCallback) {
    this.listeners.set(id, { callback, groupId });
    return () => {
      this.listeners.delete(id);
    };
  }

  /**
   * Notify that a player has started playing.
   * Pauses all registered players belonging to DIFFERENT groups.
   * @param activeGroupId The group ID of the player starting playback
   */
  notifyPlay(activeGroupId: string) {
    this.listeners.forEach((listener, id) => {
      if (listener.groupId !== activeGroupId) {
        console.log(`[PlaybackCoordinator] Pausing player ${id} (group: ${listener.groupId}) because group ${activeGroupId} started.`);
        listener.callback();
      }
    });
  }
}

export const playbackCoordinator = new PlaybackCoordinator();
