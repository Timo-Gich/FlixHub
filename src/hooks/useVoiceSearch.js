import { useEffect, useRef, useState } from 'react';

const VOICE_SEARCH_ERRORS = {
  'not-allowed': 'Microphone access was denied. Check your browser permissions.',
  'audio-capture': 'No microphone was found.',
  'no-speech': 'No speech detected. Try again.',
  network: 'Voice search could not connect. Check your connection.',
};

export default function useVoiceSearch(onResult) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const SpeechRecognition =
    typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const toggle = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setError('');
      setListening(true);
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (transcript) onResultRef.current?.(transcript);
    };
    recognition.onerror = (event) => {
      setError(VOICE_SEARCH_ERRORS[event.error] || 'Voice search could not start. Try again.');
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (startError) {
      recognitionRef.current = null;
      setListening(false);
      setError(startError.message || 'Voice search could not start. Try again.');
    }
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return {
    supported: Boolean(SpeechRecognition),
    listening,
    error,
    toggle,
  };
}
