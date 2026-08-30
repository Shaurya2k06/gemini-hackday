const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 2000;

const NONSENSE_PATTERNS = [
  /^[^a-zA-Z0-9]+$/,
  /^(asdf|qwerty|test|hello|hi|ok|lol|abc)+$/i,
  /^(.)\1{6,}$/,
];

export function validateUserInput(message) {
  if (message == null || typeof message !== "string") {
    return { valid: false, error: "Please enter a text message." };
  }

  const trimmed = message.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return { valid: false, error: "Query is too short. Describe the companies you are looking for." };
  }

  if (trimmed.length > MAX_QUERY_LENGTH) {
    return { valid: false, error: "Query is too long. Please shorten your message." };
  }

  for (const pattern of NONSENSE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        error: "I could not understand that query. Try describing sector, stage, or geography.",
      };
    }
  }

  return { valid: true, message: trimmed };
}
