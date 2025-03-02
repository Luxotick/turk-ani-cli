/**
 * Cache Utilities
 * Handles background caching of next episodes
 */

import { getAlucard } from '../services/getAlucard.js';

// Track active cache operations
const activeCacheOperations: Map<number, boolean> = new Map();

/**
 * Cache the next episode in the background
 * @param episodes Array of all episodes
 * @param currentEpisodeIndex Current episode index
 * @param selectedFansubName Selected fansub name
 * @returns True if caching was started, false if not needed or already in progress
 */
export async function cacheNextEpisode(
  episodes: { title: string; link: string }[], 
  currentEpisodeIndex: number,
  selectedFansubName: string
): Promise<boolean> {
  // Check if there is a next episode
  if (!episodes || currentEpisodeIndex >= episodes.length - 1) {
    return false;
  }

  const nextEpisodeIndex = currentEpisodeIndex + 1;
  
  // Check if this episode is already being cached
  if (activeCacheOperations.get(nextEpisodeIndex)) {
    return false;
  }
  
  // Mark this episode as being cached
  activeCacheOperations.set(nextEpisodeIndex, true);
  
  try {
    console.log(`Caching the next episode: ${episodes[nextEpisodeIndex].title}`);
    
    // Start caching in the background
    setTimeout(async () => {
      try {
        const nextEpisode = episodes[nextEpisodeIndex];
        
        // Use getAlucard with special cache mode
        await getAlucard(
          `https:${nextEpisode.link}`,
          selectedFansubName, // Pass fansub name as parameter
          nextEpisode.title,
          nextEpisodeIndex,
          episodes,
          selectedFansubName,
          true // Cache mode - new parameter
        );
        
        console.log('Caching is done');
      } catch (error) {
        console.error('Error during caching:', error);
      } finally {
        // Mark this episode as no longer being cached
        activeCacheOperations.set(nextEpisodeIndex, false);
      }
    }, 1000);
    
    return true;
  } catch (error) {
    console.error('Error starting cache process:', error);
    activeCacheOperations.set(nextEpisodeIndex, false);
    return false;
  }
} 