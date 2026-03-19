export const BANNED_WORDS = [
  'sex', 'fuck', 'suck', 'kiss', 'bongo', 'boltu', 'hasina', 'chudina', 'chudi',
  'xudi', 'xudina', 'chodna', 'xodna', 'modi', 'bongoboltu'
];

export function containsBanned(text: string) {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some(w => lower.includes(w));
}
