/**
 * A dependency-free hook point for "the person just interacted with Paire".
 * UI code calls noteActivity() (touches, typing); the presence session listens.
 * Only the moment is passed on, never what was touched or typed.
 */
let listener: (() => void) | null = null;

export function setActivityListener(next: (() => void) | null) {
  listener = next;
}

export function noteActivity() {
  listener?.();
}
