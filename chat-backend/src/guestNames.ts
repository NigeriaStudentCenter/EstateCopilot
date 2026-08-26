// One friendly, anonymous display name per connection — no login, nothing
// to type. Matches the "automatic filtering only, no required display
// name" moderation decision: this is generated FOR the visitor, not
// collected FROM them.
const ADJECTIVES = [
  'Bold', 'Bright', 'Swift', 'Sunny', 'Lively', 'Jolly', 'Sharp', 'Calm',
  'Proud', 'Eager', 'Loyal', 'Witty', 'Brave', 'Gentle', 'Vivid',
];

const NOUNS = [
  'Naija', 'Lagosian', 'Naijarian', 'Ambassador', 'Diasporan', 'Eagle',
  'Wanderer', 'Voyager', 'Griot', 'Compatriot',
];

export function generateGuestName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const number = Math.floor(100 + Math.random() * 900);
  return `${adjective} ${noun}${number}`;
}
