// Brand and navigation labels (Sakhi rebrand, 2026-11-01).
import { describe, expect, it } from 'vitest'
import { DICTS, translate } from '../../i18n/strings'

describe('Sakhi branding', () => {
  it('the app is called Sakhi in every supported language', () => {
    expect(translate('en', 'appName')).toBe('Sakhi')
    expect(translate('hi', 'appName')).toBe('सखी')
    expect(translate('te', 'appName')).toBe('సఖి')
  })
  it('the third tab is "Business"; tabs read Today · My Learning · Business', () => {
    expect([translate('en', 'nav.today'), translate('en', 'nav.journey'), translate('en', 'nav.helper')]).toEqual(['Today', 'My Learning', 'Business'])
    expect(translate('hi', 'nav.helper')).toBe('व्यापार')
    expect(translate('te', 'nav.helper')).toBe('వ్యాపారం')
  })
  it('no user-facing string still says the old names', () => {
    for (const d of Object.values(DICTS))
      for (const [k, v] of Object.entries(d)) expect(v, k).not.toMatch(/Hisaab Saathi|हिसाब साथी|హిసాబ్ సాథీ|Business Helper|व्यापार मदद|వ్యాపార సహాయం/)
  })
})
