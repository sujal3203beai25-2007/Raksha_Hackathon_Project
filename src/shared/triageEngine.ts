import { TriageResult } from './types.ts';

export const TRIAGE_RULE_VERSION = 'triage-v2.1-mh';

export interface TriageInput {
  redFlags: string[];
  symptoms: string[];
  ageYears?: number;
  pregnant?: boolean;
  symptomHours?: number;
  uncertainOrSeverePain?: boolean;
}

export const RED_FLAG_OPTIONS = [
  { id: 'chest_pain', en: 'Chest pain or pressure', hi: 'सीने में दर्द या दबाव', mr: 'छातीत दुखणे किंवा दडपण' },
  { id: 'breathing_difficulty', en: 'Severe difficulty breathing', hi: 'सांस लेने में गंभीर कठिनाई', mr: 'श्वास घेण्यास तीव्र त्रास' },
  { id: 'unconscious', en: 'Unconscious / unresponsive / seizure', hi: 'बेहोशी / दौरा पड़ना', mr: 'बेशुद्ध होणे / झटके येणे' },
  { id: 'stroke_signs', en: 'Sudden face droop, arm weakness, or slurred speech', hi: 'चेहरे का टेढ़ापन, हाथ में कमजोरी या बोलने में दिक्कत', mr: 'चेहरा वाकडा होणे, हात लुळा पडणे किंवा बोलण्यात अडचण' },
  { id: 'heavy_bleeding', en: 'Uncontrolled bleeding or major trauma', hi: 'अत्यधिक रक्तस्राव या गंभीर चोट', mr: 'तीव्र रक्तस्त्राव किंवा मोठी दुखापत' },
  { id: 'obstetric_danger', en: 'Pregnancy bleeding, severe headache, or reduced fetal movement', hi: 'गर्भावस्था में रक्तस्राव या गंभीर सिरदर्द', mr: 'गर्भावस्थेत रक्तस्त्राव किंवा तीव्र डोकेदुखी' },
  { id: 'snake_bite', en: 'Snakebite / poisoning / anaphylaxis', hi: 'सांप काटना / विषाक्तता / गंभीर एलर्जी', mr: 'सर्पदंश / विषबाधा / तीव्र ॲलर्जी' },
] as const;

export const GENERAL_SYMPTOM_OPTIONS = [
  { id: 'high_fever', en: 'High fever (> 3 days or > 102°F)', hi: 'तेज बुखार (3 दिन से अधिक)', mr: 'तीव्र ताप (३ दिवसांपेक्षा जास्त)' },
  { id: 'dehydration', en: 'Persistent vomiting / dehydration', hi: 'लगातार उल्टी / पानी की कमी', mr: 'सतत उलट्या / शरीरात पाण्याची कमतरता' },
  { id: 'abdominal_pain', en: 'Moderate to severe abdominal pain', hi: 'पेट में मध्यम से तेज दर्द', mr: 'पोटात मध्यम ते तीव्र दुखणे' },
  { id: 'wound_infection', en: 'Infected wound or burn', hi: 'संक्रमित घाव या जलना', mr: 'जखमेचा संसर्ग किंवा भाजणे' },
  { id: 'chronic_followup', en: 'BP / Diabetes medication review', hi: 'बीपी / शुगर की नियमित जांच', mr: 'रक्तदाब / मधुमेह नियमित तपासणी' },
  { id: 'mild_respiratory', en: 'Mild cough, cold, or sore throat', hi: 'हल्की खांसी, जुकाम या गले में खराश', mr: 'सौम्य खोकला, सर्दी किंवा घसा खवखवणे' },
] as const;

/**
 * Conservative, transparent, non-diagnostic screening rules.
 * Never declares a patient "medically safe" or advises delaying emergency care.
 */
export function evaluateTriageRules(input: TriageInput): TriageResult {
  const redFlags = input.redFlags.filter(Boolean);
  const symptoms = input.symptoms.filter(Boolean);

  const nonDiagnosticNotice =
    'Automated navigation guidance only — not a medical diagnosis. If symptoms worsen or feel life-threatening, call 108 / 112 immediately.';

  if (redFlags.length > 0) {
    return {
      ruleVersion: TRIAGE_RULE_VERSION,
      urgency: 'emergency',
      redFlags,
      symptoms,
      recommendedCareLevel: 'SDH',
      rationale: `Escalated immediately under ${TRIAGE_RULE_VERSION} because red-flag sign(s) were reported (${redFlags.join(', ')}). Immediate emergency evaluation is recommended.`,
      humanReviewRequired: true,
      nonDiagnosticNotice,
    };
  }

  if (input.uncertainOrSeverePain) {
    return {
      ruleVersion: TRIAGE_RULE_VERSION,
      urgency: 'human_review',
      redFlags: [],
      symptoms,
      recommendedCareLevel: 'RH',
      rationale: `Routed to clinician/ASHA human review under ${TRIAGE_RULE_VERSION} because the caller reported severe pain or uncertainty.`,
      humanReviewRequired: true,
      nonDiagnosticNotice,
    };
  }

  const isVulnerable =
    (typeof input.ageYears === 'number' && (input.ageYears < 5 || input.ageYears >= 65)) ||
    Boolean(input.pregnant);

  const hasUrgentSymptom = symptoms.some((s) =>
    ['high_fever', 'dehydration', 'abdominal_pain', 'wound_infection'].includes(s)
  );

  if (hasUrgentSymptom || (isVulnerable && symptoms.length > 0)) {
    return {
      ruleVersion: TRIAGE_RULE_VERSION,
      urgency: 'urgent',
      redFlags: [],
      symptoms,
      recommendedCareLevel: 'RH',
      rationale: `Same-day clinical evaluation recommended under ${TRIAGE_RULE_VERSION}${isVulnerable ? ' (age/pregnancy vulnerability modifier applied)' : ''}.`,
      humanReviewRequired: isVulnerable,
      nonDiagnosticNotice,
    };
  }

  return {
    ruleVersion: TRIAGE_RULE_VERSION,
    urgency: symptoms.length === 0 ? 'human_review' : 'routine',
    redFlags: [],
    symptoms,
    recommendedCareLevel: 'PHC',
    rationale:
      symptoms.length === 0
        ? `No symptoms selected under ${TRIAGE_RULE_VERSION}; routed to PHC nurse/clinician check.`
        : `Routine PHC consultation suggested under ${TRIAGE_RULE_VERSION}. Seek immediate care if any red-flag symptom develops.`,
    humanReviewRequired: symptoms.length === 0,
    nonDiagnosticNotice,
  };
}
