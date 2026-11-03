// Languages shown in the selector as PREVIEW ONLY ("coming soon"). The interface, lessons, speech
// recognition and scoring are NOT built for them: choosing one never changes the app language.
// Greetings are short, common forms; still to be checked by native speakers.
export interface PreviewLanguage {
  code: 'bn' | 'as' | 'ta'
  native: string
  englishName: string
  bcp47: string
  greeting: string
}

export const PREVIEW_LANGS: PreviewLanguage[] = [
  { code: 'bn', native: 'বাংলা', englishName: 'Bengali', bcp47: 'bn-IN', greeting: 'নমস্কার' },
  { code: 'as', native: 'অসমীয়া', englishName: 'Assamese', bcp47: 'as-IN', greeting: 'নমস্কাৰ' },
  { code: 'ta', native: 'தமிழ்', englishName: 'Tamil', bcp47: 'ta-IN', greeting: 'வணக்கம்' },
]
