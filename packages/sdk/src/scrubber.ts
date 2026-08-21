const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JWT_REGEX =
  /eyJhbGciOi[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g;
const CREDIT_CARD_REGEX =
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9]{12})|3[47][0-9]{13})\b/g;
const DB_URI_REGEX =
  /(mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^:]+:([^@]+)@/gi;
const AUTH_HEADER_REGEX = /(Bearer|Basic|Token)\s+[A-Za-z0-9-_=.]{8,}/gi;

// Sensitive keys in metadata to be redacted fully
const SENSITIVE_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "client_secret",
  "token",
  "api_key",
  "apikey",
  "authorization",
  "card",
  "cc",
  "cvv",
  "ssn",
]);

export function scrubText(text: string): string {
  if (typeof text !== "string") return text;
  let scrubbed = text;
  scrubbed = scrubbed.replace(DB_URI_REGEX, (match, _scheme, password) => {
    return match.replace(`:${password}@`, ":[PASSWORD_REDACTED]@");
  });
  scrubbed = scrubbed.replace(JWT_REGEX, "[JWT_REDACTED]");
  scrubbed = scrubbed.replace(EMAIL_REGEX, "[EMAIL_REDACTED]");
  scrubbed = scrubbed.replace(CREDIT_CARD_REGEX, "[CARD_REDACTED]");
  scrubbed = scrubbed.replace(AUTH_HEADER_REGEX, "$1 [TOKEN_REDACTED]");
  return scrubbed;
}

export function scrubObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return (obj as unknown[]).map((item) => scrubObject(item));
  }

  if (typeof obj === "object") {
    const rawObj = obj as Record<string, unknown>;
    const scrubbedObj: Record<string, unknown> = {};
    for (const key of Object.keys(rawObj)) {
      const lowerKey = key.toLowerCase();
      const val = rawObj[key];

      if (SENSITIVE_KEYS.has(lowerKey)) {
        scrubbedObj[key] = "[REDACTED]";
      } else if (typeof val === "string") {
        scrubbedObj[key] = scrubText(val);
      } else if (typeof val === "object") {
        scrubbedObj[key] = scrubObject(val);
      } else {
        scrubbedObj[key] = val;
      }
    }
    return scrubbedObj;
  }

  if (typeof obj === "string") {
    return scrubText(obj);
  }

  return obj;
}
