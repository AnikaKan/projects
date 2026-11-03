// Multilingual phrase patterns for learner turns: English, Hindi (Devanagari + romanised + Hindi-English),
// Telugu (script + romanised + Telugu-English). Deterministic regexes, no AI.
//
// Every Hindi/Telugu phrase here was written by the developer (not a native speaker) and is PENDING
// NATIVE-SPEAKER REVIEW — see docs/MULTILINGUAL_REVIEW.md. Patterns are deliberately written as REQUESTS
// ("say it again", "explain simply") so that an answer that happens to contain such a word is still an answer.
//
// Input to every function here is already normalised by `norm()` (lower case, NFC, punctuation → spaces,
// padded with one space on each side).

export const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[‌‍]/g, '') // ZWNJ/ZWJ: "సింపుల్‌గా" = "సింపుల్గా"
    .replace(/[.,!?।'"“”‘’…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `

const any = (res: RegExp[], t: string) => res.some((re) => re.test(t))
/** Up to `n` words in between ("दोबारा पढ़कर सुनाइए", "malli chadivi vinipinchandi"). */
const gap = (n: number) => `(?:\\S+\\s+){0,${n}}`

// ── 1. Repeat requests ───────────────────────────────────────────────
const AGAIN_EN = '(?:again|once more|one more time|once again)'
const AGAIN_HI = '(?:फिर से|फिरसे|फिर|दोबारा|दुबारा|एक बार और|एक बार फिर|एक बार फिर से)'
const AGAIN_HI_R = '(?:phir|fir|phirse|firse|dobara|dubara|ek baar aur|ek bar aur|ek baar phir|ek baar fir|one more time|once more|again)'
const AGAIN_TE = '(?:మళ్ళీ|మళ్లీ|ఇంకోసారి|ఇంకొకసారి|ఇంకో సారి|ఇంకొక సారి|మరోసారి|మరొకసారి)'
const AGAIN_TE_R = '(?:malli|malla|inkosari|inkokasari|inko sari|marosari|one more time|once more|again)'
const SAY_HI = '(?:बता|बोल|सुना|समझा|पढ़|पढ|कहि|कहो|कहें|दोहरा)'
const SAY_HI_R = '(?:bata\\w*|bol\\w*|suna\\w*|samjha\\w*|padh\\w*|parh\\w*|kah\\w*|keh\\w*|repeat\\w*|dohra\\w*)'
const SAY_TE = '(?:చెప్ప|వినిపించ|చదువ|చదివ|వివరించ|చెప్పు|అడగ)'
const SAY_TE_R = '(?:chepp\\w*|vinipinch\\w*|chadav\\w*|chadiv\\w*|vivarinch\\w*|adag\\w*|repeat\\w*)'

/** Requests to hear the question again. Strong forms: a request verb is present. */
const REPEAT: RegExp[] = [
  new RegExp(`\\b(say|tell|explain|repeat|read|play|ask)\\b\\s+${gap(3)}${AGAIN_EN}\\b`),
  /\b(can|could|would|will) you (please )?(repeat|say that again|read (it|that|the question) again)\b/,
  /\brepeat\b/,
  /\b(again|once more|one more time) please\b|\bplease (say|explain|read) (it |that )?again\b|\bsay that again\b/,
  /\b(did ?n[o']?t|do not|don ?t|didn ?t|can ?not|cannot|can ?t|could ?n ?t) (understand|get it|follow|hear)\b/,
  /\bnot clear\b|\bpardon\b|\bwhat do you mean\b|\bcome again\b|\bsorry what\b/,
  // "What did you say?" in each language (round 2)
  /\bwhat (did|was) (you|that|it) (say|said)\b|\bwhat was that\b|\bwhat did you just say\b/,
  /(आपने|तुमने)?\s*क्या\s*(कहा|बोला|बोले|बोलीं|कहें)(?!\s*(जाता|जाएगा))|\b(aapne|tumne)?\s*kya\s*(kaha|bola|bole|boli)\b/,
  /ఏం\s*అన్నారు|ఏమి\s*అన్నారు|ఏం\s*చెప్పారు|ఏమన్నావు|\b(em|emi)\s*annaru\b/,
  new RegExp(`${AGAIN_HI}\\s*${gap(2)}${SAY_HI}`),
  /समझ\s*(में)?\s*नहीं\s*(आया|आई|आ रहा|आ रही|आता)|(समझा|समझी|समझ पाई|समझ पाया)\s*नहीं|सुनाई\s*नहीं\s*(दिया|दी)/,
  new RegExp(`\\b${AGAIN_HI_R}\\s*(?:se\\s+)?${gap(2)}${SAY_HI_R}\\b`),
  /\bsamajh\s*(mein|me|mai)?\s*(nahi|nahin|na)\s*(aaya|aya|aayi|aaya hai|aa raha)\b|\b(samjha|samjhi)\s*(nahi|nahin)\b|\bsunai\s*nahi\s*(diya|di)\b/,
  new RegExp(`${AGAIN_TE}\\s*${gap(2)}${SAY_TE}`),
  /(అర్థం|అర్ధం)\s*(కాలేదు|కావడం లేదు|కావట్లేదు|అవ్వలేదు)|వినిపించలేదు|వినబడలేదు/,
  new RegExp(`\\b${AGAIN_TE_R}\\s*${gap(2)}${SAY_TE_R}\\b`),
  /\b(artham|ardham|ardam|artam)\s*(kaledu|kaaledu|kavadam ledu|kavatledu|avvaledu)\b|\b(vinipinchaledu|vinabadaledu)\b/,
  /ఏమన్నారు|ఏమంటున్నారు|\b(emannaru|emantunnaru)\b/,
  /\brepeat\s*(cheyyandi|cheyi|cheyandi|chey|karo|kariye|kijiye|karna)\b/,
  // English loanword as STT writes it in native script: "रिपीट कीजिए", "రిపీట్ చేయండి"
  /रिपीट|రిపీట్/,
]
/** Weak forms ("one more time please", "मळ्ळీ?") count only when the utterance has no amount in it. */
const REPEAT_WEAK: RegExp[] = [
  new RegExp(`^\\s*(please\\s+)?${AGAIN_EN}(\\s+please)?\\s*$`),
  new RegExp(`^\\s*${AGAIN_HI}(\\s*(बताइए|प्लीज़|please))?\\s*$`),
  new RegExp(`^\\s*${AGAIN_TE}(\\s*(please|ప్లీజ్))?\\s*$`),
  new RegExp(`^\\s*${AGAIN_TE_R}(\\s*please)?\\s*$`),
]

// ── 2. Requests for a simpler explanation (incl. "what does <concept> mean?") ──
const SIMPLE_EN = '(?:simpler|more simply|simply|simple|easier|easy|plain)'
const SIMPLE_HI = '(?:आसान|सरल|सीधी|सीधे|सीधा|साधारण|आसानी|हल्के|सिंपल|ईज़ी|simple|easy)'
const SIMPLE_HI_R = '(?:aasaan|asaan|aasan|asan|saral|seedhi|seedhe|seedha|sidhi|sidhe|sadharan|simple|easy|halke)'
const SIMPLE_TE = '(?:సులభంగా|సులువుగా|సులభమైన|తేలికగా|తేలికైన|సాధారణ|సింపుల్|సింపుల్గా|ఈజీగా|ఈజీ|simple|easy)'
const SIMPLE_TE_R = '(?:sulabhamga|sulabhanga|suluvuga|sulabhamaina|telikaga|telikaina|sadharana|simple|easy|simplega|easyga)'
const EXPLAIN_HI = '(?:बता|समझा|बोल|कहि|कहो|explain)'
const EXPLAIN_TE = '(?:చెప్ప|వివరించ|explain|అర్థమయ్యేలా)'

const SIMPLIFY: RegExp[] = [
  new RegExp(`\\b(explain|say|tell|put|describe)\\b\\s+${gap(4)}${SIMPLE_EN}\\b`),
  new RegExp(`\\b${SIMPLE_EN}\\s+(words|language|terms|way|explanation)\\b`),
  /\b(make it|in) (simpler|easier|plain)\b|\btoo (hard|difficult|complicated)\b|\bexplain (it )?(more )?(slowly|simply)\b/,
  new RegExp(`${SIMPLE_HI}\\s*${gap(3)}${EXPLAIN_HI}`),
  new RegExp(`${SIMPLE_HI}\\s*(भाषा|शब्द|शब्दों|तरीक|करके|कर के|में)`),
  /बहुत\s*(मुश्किल|कठिन)\s*(है|लग)|(मुश्किल|कठिन)\s*लग\s*रहा/,
  new RegExp(`\\b${SIMPLE_HI_R}\\s+${gap(3)}(bata\\w*|samjha\\w*|bol\\w*|kah\\w*|explain\\w*)\\b`),
  new RegExp(`\\b${SIMPLE_HI_R}\\s+(bhasha|bhaasha|shabdon|shabd|words|language|tarike|tareeke|way|karke|kar ke|mein)\\b`),
  /\b(bahut|bohot)\s*(mushkil|kathin|difficult|hard)\b/,
  new RegExp(`${SIMPLE_TE}\\s*${gap(3)}${EXPLAIN_TE}`),
  new RegExp(`${SIMPLE_TE}\\s*(మాటల్లో|పదాల్లో|భాషలో|గా)`),
  /చాలా\s*(కష్టంగా|కష్టం)|(కష్టంగా)\s*ఉంది/,
  new RegExp(`\\b${SIMPLE_TE_R}\\s*(ga\\s+)?${gap(3)}(chepp\\w*|vivarinch\\w*|explain\\w*)\\b`),
  new RegExp(`\\b${SIMPLE_TE_R}\\s+(matallo|maatallo|padallo|bhashalo|words lo|language lo|ga)\\b`),
  /\b(chala|chaala)\s*(kashtam|kashtamga|difficult|hard)\b/,
  // Bare requests to explain / statements of confusion (held-out v2 probes RVP-EN-41, RVP-HI-43, EXP-TE-44)
  /\b(i ?a?m|i am|getting|very|so) confused\b|\bconfusing\b/,
  /(मुश्किल|कठिन)\s*(है|लग)|समझाओ\s*ना|समझाइए\s*ना|समझा\s*(दो|दीजिए|दीजिये)|\b(mushkil|kathin)\s*(hai|lag)|\bsamjhao\s*na\b|\bsamjha\s*(do|dijiye)\b/,
  /అర్థమయ్యేలా\s*(చెప్ప|వివరించ)|\b(arthamayyela|ardhamayyela)\s*(chepp\w*|vivarinch\w*)\b/,
]

/** Words that name a lesson concept — "what does <one of these> mean?" is a request for explanation. */
const CONCEPT =
  /\b(profit|sales?|revenue|expenses?|cost|costs|credit|udhaar|udhar|savings?|cash|stock|business expense|working capital|munafa|munafaa|fayda|faayda|faida|nafa|kamai|aamdani|bikri|kharcha|kharch|bachat|labham|laabham|ammakalu|kharchu|appu|podupu|nagadu|saruku|galla|aadayam)\b|मुनाफ़|मुनाफा|फ़ायद|फायद|नफ़ा|नफा|कमाई|आमदनी|लाभ|बिक्री|खर्च|उधार|बचत|नकद|लागत|माल|గల్లా|లాభ|అమ్మకాల|అమ్మకం|ఖర్చ|అప్పు|పొదుపు|నగదు|సరుకు|ఆదాయ|సంపాదన/
const MEANING: RegExp[] = [
  /\bwhat (is|are|does|do)\b|\bwhat s\b|\bmeaning of\b|\bmeans what\b|\bwhat do you mean by\b/,
  /(मतलब|माने|अर्थ)\s*(क्या)|क्या\s*(मतलब|होता|होती|होते)|किसे\s*कहते/,
  /\b(matlab|maane|mane|arth)\s*(kya)\b|\bkya\s*(matlab|hota|hoti|hote)\b|\bkise\s*kehte\b/,
  /అంటే\s*(ఏమిటి|ఏంటి|ఏమి|ఏమిట)|అర్థం\s*ఏమిటి|దేన్ని\s*అంటారు/,
  /\bante\s*(emiti|enti|emi|yenti)\b|\bartham\s*(emiti|enti)\b/,
]

// ── 3. Uncertainty ───────────────────────────────────────────────────
const UNSURE: RegExp[] = [
  // Hedged forms too: "not too sure", "not really sure" (English "not" is otherwise a synonym of "No"). Round 2.
  /\bnot (too |really |very |quite |that |so |fully |entirely |a hundred percent |100 percent )?(sure|certain)\b|\b(unsure|no idea|no clue|can ?n?o?t say|cannot say|hard to say)\b|\b(do ?n[o']?t|don ?t|dont|didn ?t) know\b/,
  // "पता नहीं" / "मुझे नहीं पता" (but not "नहीं, पता है …" = "No — I know …")
  /(पता|मालूम|मालुम)\s*नहीं|नहीं\s*(पता|मालूम|मालुम)(?!\s*(है|था|हैं))|पक्का\s*नहीं|(श्योर|शुअर|sure|आइडिया|idea)\s*नहीं|कह\s*नहीं\s*सकती|पता\s*ही\s*नहीं/,
  /\b(pata|maloom|malum|maalum|maaloom)\s*(nahi|nahin|nai|na)\b|\b(nahi|nahin|nai)\s*(pata|maloom|malum)\b(?!\s*(hai|tha|hain))|\bpakka\s*(nahi|nahin)\b|\b(sure|idea)\s*(nahi|nahin|nai)\b|\bkeh\s*nahi\s*sakti\b/,
  /తెలియదు|తెలీదు|తెలియట్లేదు|తెలియడం లేదు|తెలియడంలేదు|(^|\s)ఏమో(\s|$)|చెప్పలేను|చెప్పలేను|(ఐడియా|idea)\s*లేదు|ఖచ్చితంగా\s*(తెలియదు|చెప్పలేను)/,
  // Telangana తెల్వదు / spelling variants teliyadhu, telidhu (round 2)
  /తెల్వదు|తెల్వది|తెలవదు/,
  /\b(teliyadu|teliyadhu|theliyadu|teledu|teledhu|teliyatledu|teliyadam ledu|telidu|telidhu|telvadu|telvadhu|emo|cheppalenu|cheppalemu)\b|\bidea\s*ledu\b|\bsure\s*(ga)?\s*(teliyadu|ledu|kaadu|cheppalenu)\b/,
]

// ── 4. Off-topic requests phrased as commands ("tell me a joke", "गाना सुनाओ", "ఒక కథ చెప్పండి") ──
const IMPERATIVE =
  /\b(tell|play|sing|show|give me|let ?s talk|talk about|search|call|open)\b|सुनाओ|सुनाइए|बताओ|बताइए|गाओ|गाइए|चलाओ|लगाओ|दिखाओ|खोलो|\b(sunao|sunaiye|batao|bataiye|gao|gaiye|chalao|lagao|dikhao|kholo|karo|kariye)\b|చెప్పండి|చెప్పు|పాడండి|పాడు|చూపించ|పెట్టండి|\b(cheppandi|cheppu|paadandi|padandi|paadu|chupinchu|chupinchandi|pettandi|cheyyandi|cheyi)\b/

export const isRepeatRequest = (t: string, hasAmount: boolean) => any(REPEAT, t) || (!hasAmount && any(REPEAT_WEAK, t))
/** A question about a concept counts only when it carries no amount ("what is the profit? 300" is an answer). */
export const isSimplifyRequest = (t: string, hasAmount: boolean) => any(SIMPLIFY, t) || (!hasAmount && CONCEPT.test(t) && any(MEANING, t))
export const isUnsure = (t: string) => any(UNSURE, t)
export const isImperativeRequest = (t: string) => IMPERATIVE.test(t)
