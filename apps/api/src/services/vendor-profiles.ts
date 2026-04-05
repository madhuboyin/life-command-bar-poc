export type VendorCategory =
  | "SUBSCRIPTION"
  | "BANK"
  | "CREDIT_CARD"
  | "UTILITY"
  | "TELECOM"
  | "SOFTWARE"
  | "RETAIL"
  | "UNKNOWN";

export type VendorLifecycleKeywordSet = {
  welcome: string[];
  renewal: string[];
  receipt: string[];
  cancellation: string[];
  billing: string[];
  statement: string[];
};

export type VendorProfile = {
  key: string;
  canonicalName: string;
  category: VendorCategory;
  senderDomains: string[];
  subjectKeywords: string[];
  bodyKeywords: string[];
  aliases: string[];
  lifecycleKeywords: VendorLifecycleKeywordSet;
  negativeKeywords: string[];
  confidenceWeight: number;
};

const SHARED_SUBSCRIPTION_LIFECYCLE: VendorLifecycleKeywordSet = {
  welcome: ["welcome", "thanks for subscribing", "plan is active", "membership confirmed"],
  renewal: ["renews on", "renewal", "auto-renew", "next billing date"],
  receipt: ["receipt", "payment received", "invoice", "charged"],
  cancellation: ["canceled", "cancelled", "will not renew", "auto-renew off"],
  billing: ["payment due", "amount due", "bill", "invoice"],
  statement: ["statement", "billing statement"]
};

const SHARED_BANK_LIFECYCLE: VendorLifecycleKeywordSet = {
  welcome: ["welcome", "account opened"],
  renewal: ["card expires", "renewal"],
  receipt: ["payment received", "payment posted", "transaction"],
  cancellation: ["account closed", "card closed"],
  billing: ["payment due", "minimum payment", "due date", "autopay"],
  statement: ["statement", "monthly statement", "account summary"]
};

const SHARED_TELECOM_LIFECYCLE: VendorLifecycleKeywordSet = {
  welcome: ["welcome", "service activated", "line activated"],
  renewal: ["plan renews", "service renewal", "auto-renew"],
  receipt: ["payment received", "receipt", "charged"],
  cancellation: ["service canceled", "line canceled", "auto-renew off"],
  billing: ["bill ready", "payment due", "amount due"],
  statement: ["statement", "billing statement"]
};

export const VENDOR_PROFILES: VendorProfile[] = [
  {
    key: "netflix",
    canonicalName: "Netflix",
    category: "SUBSCRIPTION",
    senderDomains: ["netflix.com"],
    subjectKeywords: ["netflix", "membership", "plan", "renewal"],
    bodyKeywords: ["netflix", "membership", "streaming", "plan"],
    aliases: ["netflix inc"],
    lifecycleKeywords: SHARED_SUBSCRIPTION_LIFECYCLE,
    negativeKeywords: ["seller feedback", "marketplace order"],
    confidenceWeight: 1
  },
  {
    key: "spotify",
    canonicalName: "Spotify",
    category: "SUBSCRIPTION",
    senderDomains: ["spotify.com"],
    subjectKeywords: ["spotify", "premium", "renewal"],
    bodyKeywords: ["spotify", "premium", "monthly plan"],
    aliases: ["spotify usa"],
    lifecycleKeywords: SHARED_SUBSCRIPTION_LIFECYCLE,
    negativeKeywords: ["artist update", "concert alert"],
    confidenceWeight: 1
  },
  {
    key: "hulu",
    canonicalName: "Hulu",
    category: "SUBSCRIPTION",
    senderDomains: ["hulu.com"],
    subjectKeywords: ["hulu", "subscription", "renewal"],
    bodyKeywords: ["hulu", "plan", "streaming"],
    aliases: ["hulu llc"],
    lifecycleKeywords: SHARED_SUBSCRIPTION_LIFECYCLE,
    negativeKeywords: ["watchlist update"],
    confidenceWeight: 0.98
  },
  {
    key: "disney_plus",
    canonicalName: "Disney+",
    category: "SUBSCRIPTION",
    senderDomains: ["disneyplus.com", "disney.com"],
    subjectKeywords: ["disney+", "disney plus", "subscription", "annual plan"],
    bodyKeywords: ["disney+", "plan", "streaming"],
    aliases: ["disney plus"],
    lifecycleKeywords: SHARED_SUBSCRIPTION_LIFECYCLE,
    negativeKeywords: ["park reservation", "merchandise order"],
    confidenceWeight: 0.98
  },
  {
    key: "adobe",
    canonicalName: "Adobe",
    category: "SOFTWARE",
    senderDomains: ["adobe.com"],
    subjectKeywords: ["adobe", "creative cloud", "renewal", "invoice"],
    bodyKeywords: ["creative cloud", "adobe", "plan", "subscription"],
    aliases: ["adobe systems"],
    lifecycleKeywords: SHARED_SUBSCRIPTION_LIFECYCLE,
    negativeKeywords: ["community update", "tutorial"],
    confidenceWeight: 1
  },
  {
    key: "microsoft",
    canonicalName: "Microsoft",
    category: "SOFTWARE",
    senderDomains: ["microsoft.com", "office.com"],
    subjectKeywords: ["microsoft 365", "office 365", "subscription", "renewal"],
    bodyKeywords: ["microsoft", "office", "subscription", "plan"],
    aliases: ["microsoft corp", "office 365"],
    lifecycleKeywords: SHARED_SUBSCRIPTION_LIFECYCLE,
    negativeKeywords: ["security alert", "login code"],
    confidenceWeight: 0.96
  },
  {
    key: "amazon_prime",
    canonicalName: "Amazon Prime",
    category: "SUBSCRIPTION",
    senderDomains: ["amazon.com"],
    subjectKeywords: ["prime membership", "amazon prime", "membership renewal"],
    bodyKeywords: ["prime benefits", "prime membership", "renewal"],
    aliases: ["prime", "amazon prime membership"],
    lifecycleKeywords: SHARED_SUBSCRIPTION_LIFECYCLE,
    negativeKeywords: ["order shipped", "package delivered", "return completed"],
    confidenceWeight: 0.9
  },
  {
    key: "google_one",
    canonicalName: "Google",
    category: "SOFTWARE",
    senderDomains: ["google.com"],
    subjectKeywords: ["google one", "storage plan", "subscription", "renewal"],
    bodyKeywords: ["google one", "storage", "plan"],
    aliases: ["google payments", "google play"],
    lifecycleKeywords: SHARED_SUBSCRIPTION_LIFECYCLE,
    negativeKeywords: ["security alert", "sign-in attempt"],
    confidenceWeight: 0.92
  },
  {
    key: "apple_services",
    canonicalName: "Apple",
    category: "SOFTWARE",
    senderDomains: ["apple.com", "itunes.com"],
    subjectKeywords: ["apple", "subscription", "renewal", "receipt"],
    bodyKeywords: ["apple id", "subscription", "icloud", "apple one"],
    aliases: ["apple services", "itunes"],
    lifecycleKeywords: SHARED_SUBSCRIPTION_LIFECYCLE,
    negativeKeywords: ["find my", "apple support case"],
    confidenceWeight: 0.92
  },
  {
    key: "chase",
    canonicalName: "Chase",
    category: "BANK",
    senderDomains: ["chase.com"],
    subjectKeywords: ["chase statement", "payment due", "account alert"],
    bodyKeywords: ["chase", "minimum payment", "statement", "autopay"],
    aliases: ["jpmorgan chase"],
    lifecycleKeywords: SHARED_BANK_LIFECYCLE,
    negativeKeywords: ["fraud alert", "otp"],
    confidenceWeight: 1
  },
  {
    key: "capital_one",
    canonicalName: "Capital One",
    category: "CREDIT_CARD",
    senderDomains: ["capitalone.com"],
    subjectKeywords: ["capital one", "payment due", "statement"],
    bodyKeywords: ["capital one", "statement", "minimum payment"],
    aliases: ["cap one"],
    lifecycleKeywords: SHARED_BANK_LIFECYCLE,
    negativeKeywords: ["security code", "verification code"],
    confidenceWeight: 1
  },
  {
    key: "amex",
    canonicalName: "American Express",
    category: "CREDIT_CARD",
    senderDomains: ["americanexpress.com", "aexp.com"],
    subjectKeywords: ["american express", "amex", "statement", "payment due"],
    bodyKeywords: ["american express", "membership rewards", "statement"],
    aliases: ["amex"],
    lifecycleKeywords: SHARED_BANK_LIFECYCLE,
    negativeKeywords: ["travel benefit offer"],
    confidenceWeight: 1
  },
  {
    key: "citi",
    canonicalName: "Citi",
    category: "CREDIT_CARD",
    senderDomains: ["citi.com", "citicards.com"],
    subjectKeywords: ["citi", "statement", "payment due"],
    bodyKeywords: ["citibank", "statement", "minimum payment"],
    aliases: ["citibank"],
    lifecycleKeywords: SHARED_BANK_LIFECYCLE,
    negativeKeywords: ["security alert", "verify activity"],
    confidenceWeight: 0.98
  },
  {
    key: "discover",
    canonicalName: "Discover",
    category: "CREDIT_CARD",
    senderDomains: ["discover.com"],
    subjectKeywords: ["discover", "statement", "payment due"],
    bodyKeywords: ["discover", "statement", "payment received"],
    aliases: ["discover card"],
    lifecycleKeywords: SHARED_BANK_LIFECYCLE,
    negativeKeywords: ["cashback bonus offer"],
    confidenceWeight: 0.98
  },
  {
    key: "wells_fargo",
    canonicalName: "Wells Fargo",
    category: "BANK",
    senderDomains: ["wellsfargo.com"],
    subjectKeywords: ["wells fargo", "statement", "payment due"],
    bodyKeywords: ["wells fargo", "autopay", "statement"],
    aliases: ["wells"],
    lifecycleKeywords: SHARED_BANK_LIFECYCLE,
    negativeKeywords: ["security alert", "verification"],
    confidenceWeight: 0.98
  },
  {
    key: "bank_of_america",
    canonicalName: "Bank of America",
    category: "BANK",
    senderDomains: ["bankofamerica.com", "bofa.com"],
    subjectKeywords: ["bank of america", "statement", "payment due"],
    bodyKeywords: ["bank of america", "statement", "minimum payment"],
    aliases: ["boa", "bofa"],
    lifecycleKeywords: SHARED_BANK_LIFECYCLE,
    negativeKeywords: ["security code", "fraud alert"],
    confidenceWeight: 0.98
  },
  {
    key: "verizon",
    canonicalName: "Verizon",
    category: "TELECOM",
    senderDomains: ["verizon.com"],
    subjectKeywords: ["verizon bill", "payment due", "statement ready"],
    bodyKeywords: ["verizon", "wireless", "autopay", "billing"],
    aliases: ["verizon wireless"],
    lifecycleKeywords: SHARED_TELECOM_LIFECYCLE,
    negativeKeywords: ["network outage alert"],
    confidenceWeight: 0.98
  },
  {
    key: "att",
    canonicalName: "AT&T",
    category: "TELECOM",
    senderDomains: ["att.com"],
    subjectKeywords: ["at&t", "bill ready", "payment due"],
    bodyKeywords: ["at&t", "wireless", "internet plan", "billing"],
    aliases: ["att", "at and t"],
    lifecycleKeywords: SHARED_TELECOM_LIFECYCLE,
    negativeKeywords: ["service outage"],
    confidenceWeight: 0.98
  },
  {
    key: "tmobile",
    canonicalName: "T-Mobile",
    category: "TELECOM",
    senderDomains: ["t-mobile.com", "tmobile.com"],
    subjectKeywords: ["t-mobile", "tmobile", "bill", "payment due"],
    bodyKeywords: ["t-mobile", "wireless", "autopay", "statement"],
    aliases: ["tmobile", "t mobile"],
    lifecycleKeywords: SHARED_TELECOM_LIFECYCLE,
    negativeKeywords: ["network maintenance notice"],
    confidenceWeight: 0.98
  },
  {
    key: "xfinity",
    canonicalName: "Xfinity",
    category: "TELECOM",
    senderDomains: ["xfinity.com", "comcast.net"],
    subjectKeywords: ["xfinity bill", "comcast bill", "payment due"],
    bodyKeywords: ["xfinity", "comcast", "internet", "statement"],
    aliases: ["comcast"],
    lifecycleKeywords: SHARED_TELECOM_LIFECYCLE,
    negativeKeywords: ["service interruption"],
    confidenceWeight: 0.96
  }
];

export const VENDOR_PROFILE_BY_KEY = new Map(VENDOR_PROFILES.map((profile) => [profile.key, profile]));
