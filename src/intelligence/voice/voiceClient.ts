/**
 * Client wrapper for on-device speech recognition (`expo-speech-recognition`).
 * Transcription runs entirely on the phone via the OS speech recognizer — no
 * server round trip — matching the app's offline-first design. The resulting
 * transcript is handed to `parseChatTransaction`, the same parser ChatScreen
 * uses for typed text.
 */

import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type {
  ExpoSpeechRecognitionResultEvent,
  ExpoSpeechRecognitionErrorEvent,
} from 'expo-speech-recognition';

export type VoiceRecognitionCallbacks = {
  onInterimResult?: (transcript: string) => void;
  onFinalResult: (transcript: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

/** Presents the OS permission dialog(s) for microphone + speech recognition. */
export async function requestVoicePermission(): Promise<boolean> {
  const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return result.granted;
}

/**
 * Starts a single listening session. Returns a `cancel` function that tears
 * down the native listeners immediately — call it on unmount so a dismissed
 * screen doesn't keep delivering events.
 */
export function startListening({
  onInterimResult,
  onFinalResult,
  onError,
  onEnd,
}: VoiceRecognitionCallbacks): () => void {
  let ended = false;

  const cleanup = () => {
    if (ended) return;
    ended = true;
    resultSub.remove();
    errorSub.remove();
    endSub.remove();
  };

  const resultSub = ExpoSpeechRecognitionModule.addListener(
    'result',
    (event: ExpoSpeechRecognitionResultEvent) => {
      const transcript = event.results[0]?.transcript ?? '';
      if (event.isFinal) onFinalResult(transcript);
      else onInterimResult?.(transcript);
    }
  );
  const errorSub = ExpoSpeechRecognitionModule.addListener(
    'error',
    (event: ExpoSpeechRecognitionErrorEvent) => {
      onError?.(event.message || event.error);
    }
  );
  const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
    cleanup();
    onEnd?.();
  });

  ExpoSpeechRecognitionModule.start({
    lang: 'en-PH',
    interimResults: true,
    continuous: false,
    addsPunctuation: true,
  });

  return () => {
    cleanup();
    ExpoSpeechRecognitionModule.abort();
  };
}

/** Stops listening and lets the recognizer emit a final result. */
export function stopListening(): void {
  ExpoSpeechRecognitionModule.stop();
}
