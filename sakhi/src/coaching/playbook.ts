// Coaching playbook: APPROVED coaching content per topic and level, written for field coordinators.
// This is the only source of coaching wording. Rules pick the entry; the UI fills in the learner's
// fictional name, her business words and amounts from the item bank (deterministic, never AI).
//
// Scope rules (PRD non-goals, checked by tests):
//   · no loans, borrowing, interest, investment, insurance, gold, schemes or named banks/products
//   · no bookkeeping (no "write down who owes you"), no real amounts from the learner's own business
//
// Status: English written by the product team; Hindi and Telugu are DRAFTS pending native-speaker review
// (like all other learner and coach copy). Not yet reviewed by NGO coordinators.
import type { Lang } from '../i18n/strings'
import type { Business } from '../lib/calc'
import type { Concept } from '../assessment/types'
import { ITEMS_BY_ID } from '../assessment/bank'
import type { CoachLevel } from '../progress/types'

export const PLAYBOOK_STATUS = { en: 'product-team draft', hi: 'draft · native review pending', te: 'draft · native review pending' } as const

/** Placeholders: {name} learner alias · {goods} what she buys · {stall} her business · {sales} {cost} {left} amounts. */
export interface PlayEntry {
  action: string
  activity: string
  question: string
}
export interface PlayTopic {
  /** What she needs to learn (one line, also used learner-facing in the Review step). */
  learn: string
  foundational: PlayEntry
  intermediate: PlayEntry
  /** How the coach checks a weekly activity marked "done" (done ≠ understood). */
  verify: string
}

/** Same amounts as the first diagnostic question (rvp_a), so the picture matches what she saw. */
export function exampleAmounts(business: Business): { sales: number; cost: number; left: number } {
  const p = ITEMS_BY_ID['rvp_a_is_sales_profit']?.params[business] ?? { sales: 500, cost: 300 }
  return { sales: p.sales, cost: p.cost, left: p.sales - p.cost }
}

export const BUSINESS_WORDS: Record<Lang, Record<Business, { goods: string; stall: string; emoji: string }>> = {
  en: {
    vegetable: { goods: 'vegetables', stall: 'vegetable stall', emoji: '🥬' },
    tea: { goods: 'milk, tea leaves and sugar', stall: 'tea stall', emoji: '☕' },
    grocery: { goods: 'stock', stall: 'grocery shop', emoji: '🏪' },
  },
  hi: {
    vegetable: { goods: 'सब्ज़ियों', stall: 'सब्ज़ी की दुकान', emoji: '🥬' },
    tea: { goods: 'दूध, चाय पत्ती और चीनी', stall: 'चाय की दुकान', emoji: '☕' },
    grocery: { goods: 'माल', stall: 'किराना दुकान', emoji: '🏪' },
  },
  te: {
    vegetable: { goods: 'కూరగాయల', stall: 'కూరగాయల దుకాణం', emoji: '🥬' },
    tea: { goods: 'పాలు, టీ పొడి, చక్కెర', stall: 'టీ దుకాణం', emoji: '☕' },
    grocery: { goods: 'సరుకు', stall: 'కిరాణా దుకాణం', emoji: '🏪' },
  },
}

type Book = Record<Concept, PlayTopic> & { start: PlayEntry & { learn: string } }

const EN: Book = {
  start: {
    learn: 'Everyone starts with sales and profit. The first check shows where she is.',
    action: 'Do the 5-question first check with {name} on this phone (about 5 minutes).',
    activity: 'Let her listen to each question and answer by tapping or speaking. Do not give hints.',
    question: 'What would she most like to understand about her money?',
  },
  revenue_vs_profit: {
    learn: 'Sales are not the same as profit. The cost of the goods must come out first.',
    foundational: {
      action: 'Help {name} see that selling {sales} of {goods} does not mean she earned {sales} in profit.',
      activity: 'Show the picture: {sales} in sales and {cost} for the {goods}. Ask how much is left after paying for the {goods} sold.',
      question: 'What other costs might reduce the money she keeps?',
    },
    intermediate: {
      action: 'Help {name} take away every cost, not only the {goods}, before calling it profit.',
      activity: 'Use one day: {sales} in sales, {cost} for the {goods}, and one small cost like the auto fare. Ask her what is really left.',
      question: 'Which cost did she almost forget?',
    },
    verify: 'Ask {name} to explain, using one evening at her {stall}, how she found what was left after paying for the {goods}.',
  },
  business_expenses: {
    learn: 'Every cost of running the business counts: spoiled goods, transport, gas, bags. Home spending is not a business cost.',
    foundational: {
      action: 'Help {name} name the costs of running her {stall}, besides the {goods}.',
      activity: 'Together, name three costs of one day at her {stall}: the {goods}, transport, and one small cost she often forgets.',
      question: 'Is a school uniform a business cost or a home cost?',
    },
    intermediate: {
      action: 'Help {name} add the small costs to the cost of the {goods} when she works out what is left.',
      activity: 'Use one market day: {cost} for the {goods}, plus transport. Ask what the total cost was before she counts what is left.',
      question: 'Which small cost does she pay on most days?',
    },
    verify: 'Ask {name} to name the costs she found and explain how they change what is left after sales.',
  },
  business_household_separation: {
    learn: 'Keep shop money and home money apart, so she can see what the shop really earns.',
    foundational: {
      action: 'Help {name} see why money taken from the cash box for home should be counted.',
      activity: 'Use two tins or two pouches: one for shop money, one for home money. Ask which tin tomorrow’s stock money belongs in.',
      question: 'What happens to tomorrow’s stock money if home spending comes from the cash box?',
    },
    intermediate: {
      action: 'Help {name} plan a fixed amount for home each day, instead of taking money whenever it is needed.',
      activity: 'Agree one fixed amount she takes home each evening. Ask how she will keep tomorrow’s stock money aside.',
      question: 'On which days is it hardest to keep to the fixed amount?',
    },
    verify: 'Ask {name} where she kept the shop money and the home money, and what she noticed.',
  },
  customer_credit: {
    learn: 'Goods given on udhaar are not money in the box until the customer pays.',
    foundational: {
      action: 'Help {name} see that udhaar sales are not money in her cash box yet.',
      activity: 'Make two piles with paper slips: cash sales and udhaar sales. Ask which pile she can use to buy stock tomorrow.',
      question: 'When does udhaar money become money she can use?',
    },
    intermediate: {
      action: 'Help {name} count only the money actually received when she checks the day.',
      activity: 'Use a day with some udhaar sales. Ask her to count only the money that came into the box.',
      question: 'How does udhaar change the money she has for tomorrow’s stock?',
    },
    verify: 'Ask {name} to explain the difference between money received and udhaar, using one day as the example.',
  },
  savings_cash_management: {
    learn: 'Keep tomorrow’s stock money aside before spending, and keep a little aside regularly.',
    foundational: {
      action: 'Help {name} see why tomorrow’s stock money should not be spent today.',
      activity: 'Ask her to keep tomorrow’s stock money in a separate pouch for one evening.',
      question: 'What does she need to buy first thing tomorrow?',
    },
    intermediate: {
      action: 'Help {name} build a small habit of keeping some money aside after counting the day.',
      activity: 'Agree a small amount she keeps aside in a separate tin after counting the day’s money.',
      question: 'What makes it hard to keep money aside?',
    },
    verify: 'Ask {name} what she kept aside and what made it easy or hard.',
  },
}

const HI: Book = {
  start: {
    learn: 'सब बिक्री और मुनाफ़े से शुरू करते हैं। पहली जाँच बताती है कि वे कहाँ हैं।',
    action: '{name} के साथ इसी फ़ोन पर 5 सवालों की पहली जाँच करें (लगभग 5 मिनट)।',
    activity: 'हर सवाल उन्हें सुनने दें और टैप करके या बोलकर जवाब देने दें। संकेत न दें।',
    question: 'वे अपने पैसे के बारे में सबसे ज़्यादा क्या समझना चाहती हैं?',
  },
  revenue_vs_profit: {
    learn: 'बिक्री और मुनाफ़ा एक नहीं हैं। पहले माल की कीमत निकालनी होती है।',
    foundational: {
      action: '{name} को समझने में मदद करें कि {sales} की {goods} बेचने का मतलब {sales} मुनाफ़ा नहीं है।',
      activity: 'तस्वीर दिखाएँ: {sales} की बिक्री और {goods} पर {cost}। पूछें कि बेची गई {goods} के पैसे देने के बाद कितना बचा।',
      question: 'और कौन-से खर्च उनके हाथ में बचने वाले पैसे को कम कर सकते हैं?',
    },
    intermediate: {
      action: '{name} की मदद करें कि मुनाफ़ा कहने से पहले वे हर खर्च घटाएँ, सिर्फ़ {goods} का नहीं।',
      activity: 'एक दिन लें: {sales} की बिक्री, {goods} पर {cost}, और एक छोटा खर्च जैसे ऑटो किराया। पूछें कि असल में कितना बचा।',
      question: 'कौन-सा खर्च वे लगभग भूल गईं?',
    },
    verify: '{name} से कहें कि अपनी {stall} की एक शाम लेकर बताएँ कि {goods} के पैसे देने के बाद बचा पैसा उन्होंने कैसे निकाला।',
  },
  business_expenses: {
    learn: 'व्यापार चलाने का हर खर्च गिना जाता है: खराब माल, ढुलाई, गैस, थैलियाँ। घर का खर्च व्यापार का खर्च नहीं है।',
    foundational: {
      action: '{name} की मदद करें कि वे {goods} के अलावा अपनी {stall} चलाने के खर्च बता सकें।',
      activity: 'साथ मिलकर {stall} के एक दिन के तीन खर्च बताएँ: {goods}, ढुलाई, और एक छोटा खर्च जो वे अक्सर भूल जाती हैं।',
      question: 'स्कूल की वर्दी व्यापार का खर्च है या घर का?',
    },
    intermediate: {
      action: '{name} की मदद करें कि बचा पैसा निकालते समय वे {goods} की कीमत में छोटे खर्च भी जोड़ें।',
      activity: 'एक बाज़ार का दिन लें: {goods} पर {cost}, और ढुलाई। पूछें कि बचा पैसा गिनने से पहले कुल खर्च कितना था।',
      question: 'कौन-सा छोटा खर्च वे लगभग रोज़ करती हैं?',
    },
    verify: '{name} से कहें कि जो खर्च उन्होंने ढूँढे वे बताएँ, और समझाएँ कि उनसे बिक्री के बाद बचा पैसा कैसे बदलता है।',
  },
  business_household_separation: {
    learn: 'दुकान का पैसा और घर का पैसा अलग रखें, ताकि पता चले कि दुकान असल में कितना कमाती है।',
    foundational: {
      action: '{name} को समझाएँ कि गल्ले से घर के लिए लिया गया पैसा क्यों गिनना चाहिए।',
      activity: 'दो डिब्बे या दो थैलियाँ लें: एक दुकान के पैसे के लिए, एक घर के पैसे के लिए। पूछें कि कल के माल का पैसा किस डिब्बे में जाएगा।',
      question: 'अगर घर का खर्च गल्ले से हो, तो कल के माल के पैसे का क्या होगा?',
    },
    intermediate: {
      action: '{name} की मदद करें कि ज़रूरत पड़ने पर पैसा लेने के बजाय वे घर के लिए रोज़ एक तय रकम रखें।',
      activity: 'एक तय रकम पर सहमति बनाएँ जो वे हर शाम घर ले जाएँ। पूछें कि वे कल के माल का पैसा अलग कैसे रखेंगी।',
      question: 'किन दिनों तय रकम पर टिकना सबसे मुश्किल है?',
    },
    verify: '{name} से पूछें कि दुकान का पैसा और घर का पैसा कहाँ रखा, और उन्होंने क्या देखा।',
  },
  customer_credit: {
    learn: 'उधार पर दिया माल तब तक गल्ले का पैसा नहीं है जब तक ग्राहक पैसे न दे।',
    foundational: {
      action: '{name} को समझाएँ कि उधार की बिक्री अभी उनके गल्ले में पैसा नहीं है।',
      activity: 'कागज़ की पर्चियों से दो ढेर बनाएँ: नकद बिक्री और उधार बिक्री। पूछें कि कल माल खरीदने के लिए वे कौन-सा ढेर इस्तेमाल कर सकती हैं।',
      question: 'उधार का पैसा कब इस्तेमाल करने लायक पैसा बनता है?',
    },
    intermediate: {
      action: '{name} की मदद करें कि दिन का हिसाब देखते समय वे सिर्फ़ असल में मिला पैसा गिनें।',
      activity: 'कुछ उधार बिक्री वाला एक दिन लें। उनसे सिर्फ़ गल्ले में आया पैसा गिनने को कहें।',
      question: 'उधार कल के माल के पैसे को कैसे बदलता है?',
    },
    verify: '{name} से कहें कि एक दिन का उदाहरण लेकर मिले हुए पैसे और उधार का फ़र्क समझाएँ।',
  },
  savings_cash_management: {
    learn: 'खर्च करने से पहले कल के माल का पैसा अलग रखें, और नियमित रूप से थोड़ा पैसा अलग रखें।',
    foundational: {
      action: '{name} को समझाएँ कि कल के माल का पैसा आज क्यों खर्च नहीं करना चाहिए।',
      activity: 'उनसे एक शाम के लिए कल के माल का पैसा अलग थैली में रखने को कहें।',
      question: 'कल सुबह सबसे पहले उन्हें क्या खरीदना है?',
    },
    intermediate: {
      action: '{name} की मदद करें कि दिन का पैसा गिनने के बाद थोड़ा पैसा अलग रखने की छोटी आदत बने।',
      activity: 'एक छोटी रकम तय करें जो वे दिन का पैसा गिनने के बाद अलग डिब्बे में रखें।',
      question: 'पैसा अलग रखना किस वजह से मुश्किल होता है?',
    },
    verify: '{name} से पूछें कि उन्होंने क्या अलग रखा और क्या आसान या मुश्किल लगा।',
  },
}

const TE: Book = {
  start: {
    learn: 'అందరూ అమ్మకాలు, లాభంతో మొదలుపెడతారు. మొదటి పరీక్ష ఆమె ఎక్కడ ఉన్నారో చూపిస్తుంది.',
    action: '{name}తో ఈ ఫోన్‌లో 5 ప్రశ్నల మొదటి పరీక్ష చేయండి (సుమారు 5 నిమిషాలు).',
    activity: 'ప్రతి ప్రశ్నను ఆమె విని, నొక్కి లేదా మాట్లాడి జవాబు ఇవ్వనివ్వండి. సూచనలు ఇవ్వకండి.',
    question: 'తన డబ్బు గురించి ఆమె ఎక్కువగా ఏమి అర్థం చేసుకోవాలనుకుంటున్నారు?',
  },
  revenue_vs_profit: {
    learn: 'అమ్మకాలు, లాభం ఒకటి కాదు. ముందు సరుకు ఖర్చు తీసేయాలి.',
    foundational: {
      action: '{sales} విలువైన {goods} అమ్మితే {sales} లాభం వచ్చినట్టు కాదని {name}కు అర్థమయ్యేలా సహాయం చేయండి.',
      activity: 'బొమ్మ చూపించండి: {sales} అమ్మకాలు, {goods} కోసం {cost}. అమ్మిన {goods} డబ్బు చెల్లించాక ఎంత మిగిలిందో అడగండి.',
      question: 'ఆమె చేతిలో మిగిలే డబ్బును ఇంకా ఏ ఖర్చులు తగ్గించవచ్చు?',
    },
    intermediate: {
      action: 'లాభం అనే ముందు {goods} ఒక్కటే కాకుండా ప్రతి ఖర్చును తీసేయడంలో {name}కు సహాయం చేయండి.',
      activity: 'ఒక రోజు తీసుకోండి: {sales} అమ్మకాలు, {goods} కోసం {cost}, ఆటో ఛార్జీ వంటి ఒక చిన్న ఖర్చు. నిజంగా ఎంత మిగిలిందో అడగండి.',
      question: 'ఆమె దాదాపు ఏ ఖర్చు మర్చిపోయారు?',
    },
    verify: 'తన {stall}లో ఒక సాయంత్రం ఉదాహరణగా, {goods} డబ్బు చెల్లించాక మిగిలింది ఎలా లెక్కించారో వివరించమని {name}ను అడగండి.',
  },
  business_expenses: {
    learn: 'వ్యాపారం నడపడానికి అయ్యే ప్రతి ఖర్చూ లెక్కే: పాడైన సరుకు, రవాణా, గ్యాస్, సంచులు. ఇంటి ఖర్చు వ్యాపార ఖర్చు కాదు.',
    foundational: {
      action: '{goods} కాకుండా తన {stall} నడపడానికి అయ్యే ఖర్చులు చెప్పడంలో {name}కు సహాయం చేయండి.',
      activity: 'కలిసి {stall}లో ఒక రోజు మూడు ఖర్చులు చెప్పండి: {goods}, రవాణా, ఆమె తరచూ మర్చిపోయే ఒక చిన్న ఖర్చు.',
      question: 'స్కూల్ యూనిఫాం వ్యాపార ఖర్చా లేక ఇంటి ఖర్చా?',
    },
    intermediate: {
      action: 'మిగిలింది లెక్కించేటప్పుడు {goods} ఖర్చుకు చిన్న ఖర్చులు కూడా కలపడంలో {name}కు సహాయం చేయండి.',
      activity: 'ఒక సంత రోజు తీసుకోండి: {goods} కోసం {cost}, రవాణా. మిగిలింది లెక్కించే ముందు మొత్తం ఖర్చు ఎంతో అడగండి.',
      question: 'దాదాపు ప్రతి రోజు ఆమె ఏ చిన్న ఖర్చు చేస్తారు?',
    },
    verify: 'తాను కనుగొన్న ఖర్చులు చెప్పి, అవి అమ్మకాల తర్వాత మిగిలేదాన్ని ఎలా మారుస్తాయో వివరించమని {name}ను అడగండి.',
  },
  business_household_separation: {
    learn: 'దుకాణం డబ్బు, ఇంటి డబ్బు వేరుగా ఉంచండి, అప్పుడే దుకాణం నిజంగా ఎంత సంపాదిస్తుందో తెలుస్తుంది.',
    foundational: {
      action: 'ఇంటి కోసం గల్లా పెట్టె నుంచి తీసిన డబ్బును ఎందుకు లెక్కించాలో {name}కు అర్థమయ్యేలా సహాయం చేయండి.',
      activity: 'రెండు డబ్బాలు లేదా రెండు సంచులు వాడండి: ఒకటి దుకాణం డబ్బుకు, ఒకటి ఇంటి డబ్బుకు. రేపటి సరుకు డబ్బు ఏ డబ్బాలోకి వెళ్లాలో అడగండి.',
      question: 'ఇంటి ఖర్చు గల్లా పెట్టె నుంచి వస్తే రేపటి సరుకు డబ్బు ఏమవుతుంది?',
    },
    intermediate: {
      action: 'అవసరమైనప్పుడల్లా తీసుకోకుండా, ఇంటికి రోజూ ఒక నిర్ణీత మొత్తం పెట్టుకోవడంలో {name}కు సహాయం చేయండి.',
      activity: 'ప్రతి సాయంత్రం ఇంటికి తీసుకెళ్లే ఒక నిర్ణీత మొత్తం మీద ఒప్పుకోండి. రేపటి సరుకు డబ్బును ఎలా పక్కన పెడతారో అడగండి.',
      question: 'ఏ రోజుల్లో నిర్ణీత మొత్తానికి కట్టుబడటం కష్టం?',
    },
    verify: 'దుకాణం డబ్బు, ఇంటి డబ్బు ఎక్కడ ఉంచారో, ఏమి గమనించారో {name}ను అడగండి.',
  },
  customer_credit: {
    learn: 'ఉద్దెరకు ఇచ్చిన సరుకు, కస్టమర్ డబ్బు ఇచ్చే వరకు పెట్టెలో డబ్బు కాదు.',
    foundational: {
      action: 'ఉద్దెర అమ్మకాలు ఇంకా గల్లా పెట్టెలో డబ్బు కాదని {name}కు అర్థమయ్యేలా సహాయం చేయండి.',
      activity: 'కాగితం చీటీలతో రెండు కుప్పలు చేయండి: నగదు అమ్మకాలు, ఉద్దెర అమ్మకాలు. రేపు సరుకు కొనడానికి ఏ కుప్ప వాడగలరో అడగండి.',
      question: 'ఉద్దెర డబ్బు ఎప్పుడు వాడుకోగలిగే డబ్బు అవుతుంది?',
    },
    intermediate: {
      action: 'రోజు లెక్క చూసేటప్పుడు నిజంగా వచ్చిన డబ్బు మాత్రమే లెక్కించడంలో {name}కు సహాయం చేయండి.',
      activity: 'కొన్ని ఉద్దెర అమ్మకాలు ఉన్న ఒక రోజు తీసుకోండి. పెట్టెలోకి వచ్చిన డబ్బు మాత్రమే లెక్కించమని అడగండి.',
      question: 'ఉద్దెర రేపటి సరుకు డబ్బును ఎలా మారుస్తుంది?',
    },
    verify: 'ఒక రోజు ఉదాహరణగా, వచ్చిన డబ్బుకు, ఉద్దెరకు తేడా వివరించమని {name}ను అడగండి.',
  },
  savings_cash_management: {
    learn: 'ఖర్చు పెట్టే ముందు రేపటి సరుకు డబ్బు పక్కన పెట్టండి, క్రమంగా కొంచెం డబ్బు పక్కన పెట్టండి.',
    foundational: {
      action: 'రేపటి సరుకు డబ్బును ఈ రోజు ఎందుకు ఖర్చు చేయకూడదో {name}కు అర్థమయ్యేలా సహాయం చేయండి.',
      activity: 'ఒక సాయంత్రం రేపటి సరుకు డబ్బును వేరే సంచిలో ఉంచమని అడగండి.',
      question: 'రేపు ఉదయం ముందుగా ఆమె ఏమి కొనాలి?',
    },
    intermediate: {
      action: 'రోజు డబ్బు లెక్కించాక కొంచెం పక్కన పెట్టే చిన్న అలవాటు చేసుకోవడంలో {name}కు సహాయం చేయండి.',
      activity: 'రోజు డబ్బు లెక్కించాక వేరే డబ్బాలో ఉంచే ఒక చిన్న మొత్తం మీద ఒప్పుకోండి.',
      question: 'డబ్బు పక్కన పెట్టడం ఎందుకు కష్టంగా ఉంటుంది?',
    },
    verify: 'ఏమి పక్కన పెట్టారో, ఏది సులభంగా లేదా కష్టంగా అనిపించిందో {name}ను అడగండి.',
  },
}

export const PLAYBOOK: Record<Lang, Book> = { en: EN, hi: HI, te: TE }

export type PlayKey = 'learn' | 'action' | 'activity' | 'question' | 'verify'

/** Fills a playbook template. Amounts come from the item bank via exampleAmounts (never computed by AI). */
export function fill(template: string, vars: { name: string; business: Business; lang: Lang }): string {
  const a = exampleAmounts(vars.business)
  const w = BUSINESS_WORDS[vars.lang][vars.business]
  const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN').format(n)
  return template
    .split('{name}').join(vars.name)
    .split('{goods}').join(w.goods)
    .split('{stall}').join(w.stall)
    .split('{sales}').join(inr(a.sales))
    .split('{cost}').join(inr(a.cost))
    .split('{left}').join(inr(a.left))
}

/** One playbook line for a topic (or 'start' = no first check yet) and level. */
export function playLine(lang: Lang, topic: Concept | 'start', level: CoachLevel, key: PlayKey, vars: { name: string; business: Business }): string {
  const book = PLAYBOOK[lang]
  let tpl: string
  if (topic === 'start') tpl = key === 'verify' ? book.start.question : key === 'learn' ? book.start.learn : book.start[key]
  else tpl = key === 'learn' ? book[topic].learn : key === 'verify' ? book[topic].verify : book[topic][level][key]
  return fill(tpl, { ...vars, lang })
}
