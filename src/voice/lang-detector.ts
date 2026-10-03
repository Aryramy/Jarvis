import type { VoiceLanguage, DetectedPhrase } from './types.js';

// Urdu-specific Unicode letters that do not exist in standard Arabic
const URDU_SPECIFIC_LETTERS_REGEX = /[ٹڈڑںےہھچپژگ]/;

// General Arabic-script Unicode range (covers Arabic, Urdu, Persian, Pashto)
const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;

// Latin characters
const LATIN_REGEX = /[a-zA-Z]/g;

// Urdu distinct script vocabulary tokens
const URDU_SCRIPT_STOPWORDS = new Set([
  'ہے', 'ہیں', 'تھا', 'تھے', 'تھی', 'کریں', 'کرو', 'کا', 'کی', 'کے',
  'کو', 'میں', 'سے', 'پر', 'آپ', 'ہم', 'نہیں', 'اور', 'کیا', 'یہ',
  'وہ', 'کیسے', 'چاہیے', 'شکریہ', 'براؤزر', 'کھولیں', 'بتائیں', 'دکھائیں'
]);

// Arabic distinct script vocabulary tokens
const ARABIC_SCRIPT_STOPWORDS = new Set([
  'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تم',
  'شكراً', 'مرحباً', 'كيف', 'نعم', 'لا', 'ماذا', 'أين', 'متى', 'التي',
  'الذي', 'أن', 'قم', 'افتح', 'تنزيل', 'بحث', 'تقرير', 'المتصفح'
]);

// Romanized Urdu common keywords
const ROMAN_URDU_WORDS = new Set([
  'karo', 'karein', 'hoga', 'hogi', 'hai', 'hain', 'kaise', 'kaisay',
  'shukriya', 'mujhe', 'batao', 'chahiye', 'theek', 'acha', 'aap', 'hum',
  'nahi', 'nahin', 'kya', 'yeh', 'woh', 'mera', 'meri', 'khol', 'kholo',
  'dekho', 'dikhao', 'dijiye', 'par', 'mein', 'se', 'ko'
]);

// Romanized Arabic common keywords
const ROMAN_ARABIC_WORDS = new Set([
  'marhaba', 'ahlan', 'shukran', 'kayfa', 'halik', 'halak', 'min',
  'fadlak', 'afwan', 'aywa', 'laa', 'naam', 'mumkin', 'mumtaz', 'yalla',
  'iftah', 'sawwi', 'bahth', 'tanzil'
]);

export interface LanguageDetectionResult {
  language: VoiceLanguage;
  confidence: number;
  isCodeSwitched: boolean;
  detectedPhrases: DetectedPhrase[];
  details: {
    hasUrduScript: boolean;
    hasArabicScript: boolean;
    hasLatin: boolean;
    urduScore: number;
    arabicScore: number;
    englishScore: number;
  };
}

/**
 * Detects language and code-switching across English, Urdu, Arabic, and mixed technical speech.
 */
export function detectLanguage(text: string, providerHint?: string): LanguageDetectionResult {
  if (!text || text.trim().length === 0) {
    return {
      language: 'en',
      confidence: 1.0,
      isCodeSwitched: false,
      detectedPhrases: [],
      details: {
        hasUrduScript: false,
        hasArabicScript: false,
        hasLatin: false,
        urduScore: 0,
        arabicScore: 0,
        englishScore: 0,
      },
    };
  }

  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).map((w) => w.replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, ''));
  const detectedPhrases: DetectedPhrase[] = [];

  const arabicScriptMatches = trimmed.match(ARABIC_SCRIPT_REGEX) || [];
  const latinMatches = trimmed.match(LATIN_REGEX) || [];

  const hasArabicScript = arabicScriptMatches.length > 0;
  const hasLatin = latinMatches.length > 0;
  const hasUrduSpecificChars = URDU_SPECIFIC_LETTERS_REGEX.test(trimmed);

  let urduScore = 0;
  let arabicScore = 0;
  let englishScore = 0;

  for (const rawWord of words) {
    const word = rawWord.toLowerCase();
    if (!word) continue;

    // Check script stop words
    if (URDU_SCRIPT_STOPWORDS.has(rawWord)) {
      urduScore += 3;
      detectedPhrases.push({ text: rawWord, language: 'ur' });
    } else if (ARABIC_SCRIPT_STOPWORDS.has(rawWord)) {
      arabicScore += 3;
      detectedPhrases.push({ text: rawWord, language: 'ar' });
    } else if (ROMAN_URDU_WORDS.has(word)) {
      urduScore += 2;
      detectedPhrases.push({ text: rawWord, language: 'ur' });
    } else if (ROMAN_ARABIC_WORDS.has(word)) {
      arabicScore += 2;
      detectedPhrases.push({ text: rawWord, language: 'ar' });
    } else if (/^[a-zA-Z]+$/.test(word)) {
      englishScore += 1;
      detectedPhrases.push({ text: rawWord, language: 'en' });
    }
  }

  if (hasUrduSpecificChars) {
    urduScore += 5;
  }

  // Determine code-switching (e.g. Roman Urdu + English technical terms or Arabic script + English words)
  const isBilingualScript = hasArabicScript && hasLatin;
  const isRomanCodeSwitched = (urduScore > 0 || arabicScore > 0) && englishScore > 0;
  const isCodeSwitched = isBilingualScript || (isRomanCodeSwitched && Math.min(englishScore, urduScore + arabicScore) >= 1);

  let finalLanguage: VoiceLanguage = 'en';
  let confidence = 0.85;

  if (isCodeSwitched) {
    finalLanguage = 'mixed';
    confidence = 0.92;
  } else if (hasUrduSpecificChars || urduScore > arabicScore && urduScore > englishScore) {
    finalLanguage = 'ur';
    confidence = Math.min(0.98, 0.7 + (urduScore * 0.05));
  } else if (arabicScore > urduScore && arabicScore > englishScore) {
    finalLanguage = 'ar';
    confidence = Math.min(0.98, 0.7 + (arabicScore * 0.05));
  } else if (hasArabicScript && !hasLatin) {
    // If only Arabic script and no Urdu-specific letters/words found, default to Arabic
    finalLanguage = urduScore > arabicScore ? 'ur' : 'ar';
    confidence = 0.88;
  } else if (englishScore > 0 || hasLatin) {
    finalLanguage = 'en';
    confidence = Math.min(0.98, 0.75 + (englishScore * 0.03));
  } else if (providerHint && ['en', 'ur', 'ar'].includes(providerHint)) {
    finalLanguage = providerHint as VoiceLanguage;
  }

  return {
    language: finalLanguage,
    confidence: Number(confidence.toFixed(2)),
    isCodeSwitched,
    detectedPhrases,
    details: {
      hasUrduScript: hasUrduSpecificChars || urduScore > 0,
      hasArabicScript,
      hasLatin,
      urduScore,
      arabicScore,
      englishScore,
    },
  };
}
