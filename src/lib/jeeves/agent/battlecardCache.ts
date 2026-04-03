import { BattlecardCacheEntry, Battlecard } from '../types/index';
import { generateStandardBattlecard } from './battlecardGenerator';

// In-memory cache keyed by competitor name (lowercased)
// Note: resets on server restart in serverless environments

const cache = new Map<string, BattlecardCacheEntry>();

function cacheKey(competitor: string): string {
  return competitor.toLowerCase().trim();
}

export function getCachedBattlecard(competitor: string): Battlecard | null {
  const entry = cache.get(cacheKey(competitor));
  return entry?.data ?? null;
}

export function getCacheEntry(competitor: string): BattlecardCacheEntry | null {
  return cache.get(cacheKey(competitor)) ?? null;
}

export async function refreshBattlecard(competitor: string): Promise<Battlecard> {
  console.log(`[BattlecardCache] Refreshing battlecard for ${competitor}...`);
  const battlecard = await generateStandardBattlecard(competitor);
  cache.set(cacheKey(competitor), {
    data: battlecard,
    generatedAt: Date.now(),
    competitor: battlecard.competitor,
  });
  return battlecard;
}

export function getAllCachedCompetitors(): Array<{ competitor: string; generatedAt: number; lastSynced: string }> {
  const result: Array<{ competitor: string; generatedAt: number; lastSynced: string }> = [];
  for (const entry of cache.values()) {
    result.push({ competitor: entry.competitor, generatedAt: entry.generatedAt, lastSynced: entry.data.lastSynced });
  }
  return result;
}

export async function refreshAllBattlecards(): Promise<void> {
  const competitors = cache.size > 0
    ? Array.from(cache.values()).map((e) => e.competitor)
    : ['Brex', 'Ramp', 'Clara'];

  for (const competitor of competitors) {
    try {
      await refreshBattlecard(competitor);
    } catch (err) {
      console.error(`[BattlecardCache] Failed to refresh ${competitor}:`, err);
    }
  }
}
