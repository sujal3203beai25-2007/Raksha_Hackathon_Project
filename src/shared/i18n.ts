import { LanguageCode } from './types.ts';

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  hi: 'हिन्दी',
  mr: 'मराठी',
};

export interface Translations {
  brandTagline: string;
  navFindCare: string;
  navTriage: string;
  navReferrals: string;
  navPortals: string;
  ctaEmergency: string;
  heroTitle: string;
  heroSubtitle: string;
  heroDisclaimer: string;
  call108Now: string;
  call112Now: string;
  actionEmergency: string;
  actionFindCare: string;
  actionMyReferrals: string;
  actionHealthRecords: string;
  actionFollowUps: string;
  actionFamilyCare: string;
  actionEmergencyDesc: string;
  actionFindCareDesc: string;
  actionMyReferralsDesc: string;
  actionHealthRecordsDesc: string;
  actionFollowUpsDesc: string;
  actionFamilyCareDesc: string;
  bottomHome: string;
  bottomCare: string;
  bottomEmergency: string;
  bottomReferrals: string;
  bottomRecords: string;
  signInGoogle: string;
  signOut: string;
  demoSandboxBanner: string;
  liveModeBanner: string;
  simplifiedMode: string;
  lowDataMode: string;
  offlineBanner: string;
  voiceStart: string;
  voiceListening: string;
  voiceUnsupported: string;
  voiceDenied: string;
  readAloud: string;
  unknownCapacity: string;
  triageNonDiagnostic: string;
  emergencyConfirmTitle: string;
  emergencyConfirmBody: string;
  emergencyConfirmButton: string;
  cancel: string;
  submit: string;
  loading: string;
}

export const TRANSLATIONS: Record<LanguageCode, Translations> = {
  en: {
    brandTagline: 'The Right Care. The Right Facility. At the Right Time.',
    navFindCare: 'Find Care',
    navTriage: 'Triage',
    navReferrals: 'Referrals',
    navPortals: 'Portals',
    ctaEmergency: 'Emergency Help',
    heroTitle: 'Coordinated rural healthcare access across Maharashtra.',
    heroSubtitle:
      'Discover verified PHCs, Rural Hospitals, and trauma centres, screen urgent symptoms safely, and track facility referrals with full transparency.',
    heroDisclaimer:
      'Coordination pilot platform — does not replace doctors, hospitals, or 108 / 112 emergency services. Live ambulance dispatch remains disabled until an authorized ambulance partner is onboarded.',
    call108Now: 'Call 108 Ambulance',
    call112Now: 'Call 112 Emergency',
    actionEmergency: 'Emergency Help',
    actionFindCare: 'Find Care',
    actionMyReferrals: 'My Referrals',
    actionHealthRecords: 'Health Records',
    actionFollowUps: 'Follow-Ups',
    actionFamilyCare: 'Family Assistance',
    actionEmergencyDesc: 'Request urgent coordination or dial 108 / 112 immediately',
    actionFindCareDesc: 'Search PHCs, RHs, SDHs, and District Hospitals with data provenance',
    actionMyReferralsDesc: 'Track hospital acceptance, transfer progress, and QR pass',
    actionHealthRecordsDesc: 'Manage personal summaries, allergies, and DPDP consents',
    actionFollowUpsDesc: 'View ASHA worker and post-discharge follow-up visits',
    actionFamilyCareDesc: 'Authorized dependent care for elderly parents and children',
    bottomHome: 'Home',
    bottomCare: 'Find Care',
    bottomEmergency: 'Emergency',
    bottomReferrals: 'Referrals',
    bottomRecords: 'Records',
    signInGoogle: 'Sign In',
    signOut: 'Sign Out',
    demoSandboxBanner: 'DEMO SANDBOX (demo-maharashtra) — Simulated multi-role dispatch & hospital workflow. Never mixed with live records.',
    liveModeBanner: 'LIVE PILOT ENVIRONMENT (mh-live) — Real ambulance dispatch is disabled until authorized EMS integration is verified. Call 108 / 112 for emergencies.',
    simplifiedMode: 'Easy Read Mode',
    lowDataMode: 'Low-Data Mode',
    offlineBanner: 'Offline Mode — Showing cached directory. Emergency calls must use 108 / 112 directly.',
    voiceStart: 'Voice Input',
    voiceListening: 'Listening...',
    voiceUnsupported: 'Voice input is not supported in this browser.',
    voiceDenied: 'Microphone permission was denied. Please type instead.',
    readAloud: 'Read Aloud',
    unknownCapacity: 'Unknown (Not Reported)',
    triageNonDiagnostic:
      'Automated rules-based navigation only — NOT a medical diagnosis. Never delay emergency care.',
    emergencyConfirmTitle: 'Confirm Emergency Assistance Request',
    emergencyConfirmBody:
      'If this is life-threatening, dial 108 or 112 directly right now. Confirming below logs a coordination request in the active environment.',
    emergencyConfirmButton: 'Send Assistance Request',
    cancel: 'Cancel',
    submit: 'Submit',
    loading: 'Loading...',
  },
  hi: {
    brandTagline: 'सही देखभाल। सही अस्पताल। सही समय पर।',
    navFindCare: 'अस्पताल खोजें',
    navTriage: 'लक्षण जांच',
    navReferrals: 'रेफरल',
    navPortals: 'पोर्टल',
    ctaEmergency: 'आपातकालीन मदद',
    heroTitle: 'महाराष्ट्र के ग्रामीण क्षेत्रों के लिए समन्वित स्वास्थ्य सेवा।',
    heroSubtitle:
      'सत्यापित प्राथमिक स्वास्थ्य केंद्र, ग्रामीण अस्पताल और जिला अस्पताल खोजें, लक्षणों की सुरक्षित जांच करें और रेफरल की स्थिति देखें।',
    heroDisclaimer:
      'यह एक समन्वय पायलट मंच है — यह डॉक्टरों, अस्पतालों या 108 / 112 आपातकालीन सेवा का स्थान नहीं लेता। अधिकृत एम्बुलेंस भागीदार जुड़ने तक लाइव डिस्पैच बंद है।',
    call108Now: '108 एम्बुलेंस कॉल करें',
    call112Now: '112 आपातकाल कॉल करें',
    actionEmergency: 'आपातकालीन मदद',
    actionFindCare: 'अस्पताल खोजें',
    actionMyReferrals: 'मेरे रेफरल',
    actionHealthRecords: 'स्वास्थ्य रिकॉर्ड',
    actionFollowUps: 'फॉलो-अप',
    actionFamilyCare: 'परिवार सहायता',
    actionEmergencyDesc: 'तुरंत सहायता अनुरोध भेजें या 108 / 112 पर कॉल करें',
    actionFindCareDesc: 'सत्यापित डेटा स्रोत के साथ नजदीकी स्वास्थ्य केंद्र खोजें',
    actionMyReferralsDesc: 'अस्पताल स्वीकृति, स्थानांतरण और QR पास देखें',
    actionHealthRecordsDesc: 'स्वास्थ्य सारांश, एलर्जी और सहमति प्रबंधन',
    actionFollowUpsDesc: 'आशा कार्यकर्ता और डिस्चार्ज के बाद की जांच देखें',
    actionFamilyCareDesc: 'बुजुर्ग माता-पिता और बच्चों की अधिकृत देखभाल',
    bottomHome: 'होम',
    bottomCare: 'खोजें',
    bottomEmergency: 'आपातकाल',
    bottomReferrals: 'रेफरल',
    bottomRecords: 'रिकॉर्ड',
    signInGoogle: 'साइन इन',
    signOut: 'साइन आउट',
    demoSandboxBanner: 'डेमो सैंडबॉक्स (demo-maharashtra) — केवल प्रशिक्षण और परीक्षण के लिए। लाइव डेटा से अलग।',
    liveModeBanner: 'लाइव पायलट (mh-live) — अधिकृत एम्बुलेंस एकीकरण तक लाइव डिस्पैच बंद है। आपातकाल में 108 / 112 कॉल करें।',
    simplifiedMode: 'सरल मोड',
    lowDataMode: 'कम डेटा मोड',
    offlineBanner: 'ऑफलाइन मोड — कैश्ड जानकारी दिखाई जा रही है। आपातकाल में सीधे 108 / 112 कॉल करें।',
    voiceStart: 'बोलकर लिखें',
    voiceListening: 'सुन रहे हैं...',
    voiceUnsupported: 'इस ब्राउज़र में वॉइस इनपुट उपलब्ध नहीं है।',
    voiceDenied: 'माइक्रोफोन की अनुमति नहीं मिली। कृपया टाइप करें।',
    readAloud: 'सुनें',
    unknownCapacity: 'अज्ञात (रिपोर्ट नहीं)',
    triageNonDiagnostic:
      'यह केवल मार्गदर्शन है — चिकित्सा निदान नहीं है। आपातकालीन देखभाल में देरी न करें।',
    emergencyConfirmTitle: 'आपातकालीन सहायता अनुरोध की पुष्टि करें',
    emergencyConfirmBody:
      'यदि स्थिति गंभीर है, तो अभी 108 या 112 पर कॉल करें। नीचे पुष्टि करने पर समन्वय अनुरोध दर्ज होगा।',
    emergencyConfirmButton: 'सहायता अनुरोध भेजें',
    cancel: 'रद्द करें',
    submit: 'जमा करें',
    loading: 'लोड हो रहा है...',
  },
  mr: {
    brandTagline: 'योग्य उपचार। योग्य रुग्णालय। योग्य वेळी.',
    navFindCare: 'रुग्णालय शोधा',
    navTriage: 'लक्षण तपासणी',
    navReferrals: 'रेफरल',
    navPortals: 'पोर्टल्स',
    ctaEmergency: 'तातडीची मदत',
    heroTitle: 'महाराष्ट्रातील ग्रामीण भागासाठी समन्वित आरोग्य सेवा.',
    heroSubtitle:
      'सत्यापित प्राथमिक आरोग्य केंद्रे, ग्रामीण रुग्णालये आणि जिल्हा रुग्णालये शोधा, लक्षणांची सुरक्षित तपासणी करा आणि रेफरल स्थिती पहा.',
    heroDisclaimer:
      'हा समन्वय पायलट प्लॅटफॉर्म आहे — डॉक्टरांची, रुग्णालयांची किंवा 108 / 112 तातडीच्या सेवेची जागा घेत नाही. अधिकृत रुग्णवाहिका भागीदार जोडेपर्यंत थेट डिस्पॅच बंद आहे.',
    call108Now: '108 रुग्णवाहिकेला कॉल करा',
    call112Now: '112 आपत्कालीन कॉल करा',
    actionEmergency: 'तातडीची मदत',
    actionFindCare: 'रुग्णालय शोधा',
    actionMyReferrals: 'माझे रेफरल',
    actionHealthRecords: 'आरोग्य नोंदी',
    actionFollowUps: 'फॉलो-अप',
    actionFamilyCare: 'कुटुंब सहाय्य',
    actionEmergencyDesc: 'तातडीची समन्वय विनंती पाठवा किंवा 108 / 112 वर कॉल करा',
    actionFindCareDesc: 'सत्यापित माहितीसह जवळची आरोग्य केंद्रे शोधा',
    actionMyReferralsDesc: 'रुग्णालय स्वीकृती, प्रवास आणि QR पास पहा',
    actionHealthRecordsDesc: 'आरोग्य सारांश, ॲलर्जी आणि संमती व्यवस्थापन',
    actionFollowUpsDesc: 'आशा सेविका आणि डिस्चार्ज नंतरच्या भेटी पहा',
    actionFamilyCareDesc: 'वृद्ध पालक आणि मुलांची अधिकृत काळजी',
    bottomHome: 'मुख्यपृष्ठ',
    bottomCare: 'रुग्णालये',
    bottomEmergency: 'तातडीचे',
    bottomReferrals: 'रेफरल',
    bottomRecords: 'नोंदी',
    signInGoogle: 'साइन इन',
    signOut: 'साइन आउट',
    demoSandboxBanner: 'डेमो सँडबॉक्स (demo-maharashtra) — केवळ चाचणी आणि प्रशिक्षणासाठी. थेट नोंदींपासून स्वतंत्र.',
    liveModeBanner: 'थेट पायलट (mh-live) — अधिकृत रुग्णवाहिका जोडणी होईपर्यंत थेट डिस्पॅच बंद आहे. तातडीसाठी 108 / 112 कॉल करा.',
    simplifiedMode: 'सोपा मोड',
    lowDataMode: 'कमी डेटा मोड',
    offlineBanner: 'ऑफलाइन मोड — जतन केलेली माहिती दाखवली जात आहे. तातडीसाठी थेट 108 / 112 वर कॉल करा.',
    voiceStart: 'बोलून नोंदवा',
    voiceListening: 'ऐकत आहे...',
    voiceUnsupported: 'या ब्राउझरमध्ये आवाज इनपुट उपलब्ध नाही.',
    voiceDenied: 'मायक्रोफोन परवानगी नाकारली आहे. कृपया टाइप करा.',
    readAloud: 'ऐका',
    unknownCapacity: 'अज्ञात (नोंद नाही)',
    triageNonDiagnostic:
      'हे केवळ मार्गदर्शन आहे — वैद्यकीय निदान नाही. तातडीच्या उपचारांना उशीर करू नका.',
    emergencyConfirmTitle: 'तातडीच्या मदतीच्या विनंतीची पुष्टी करा',
    emergencyConfirmBody:
      'परिस्थिती गंभीर असल्यास आत्ताच 108 किंवा 112 वर कॉल करा. खाली पुष्टी केल्यास समन्वय विनंती नोंदवली जाईल.',
    emergencyConfirmButton: 'मदत विनंती पाठवा',
    cancel: 'रद्द करा',
    submit: 'सबमिट करा',
    loading: 'लोड होत आहे...',
  },
};

export function t(lang: LanguageCode): Translations {
  return TRANSLATIONS[lang] ?? TRANSLATIONS.en;
}
