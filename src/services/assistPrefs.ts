import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * "Ask online when unsure" preference for the chat's LLM assist tier
 * (INTELLIGENCE_UPGRADE.md, Phase C5). Device-local, never synced.
 *
 * Default ON: the assist only ever sends the message TEXT (never amounts,
 * balances, or history) and only fires on the rare low-confidence turn, so
 * the privacy surface is one sentence the user typed. Users who want strictly
 * offline behavior flip it off in Settings and the brain's offline clarify is
 * the final answer.
 */

const KEY = 'fino.assist.enabled.v1';

export async function getAssistEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export async function setAssistEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(enabled));
  } catch {
    // Preference writes are best-effort; the toggle re-reads on next open.
  }
}
