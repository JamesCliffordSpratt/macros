# 🌍 Localization Contribution

Thank you for contributing a translation to the Macros plugin! Please fill out this template to help us review your contribution.

## Translation Information

**Language:** [e.g., French, German, Japanese]  
**Language Code:** [e.g., fr, de, ja]  
**Native Name:** [e.g., Français, Deutsch, 日本語]  
**Text Direction:** [LTR or RTL]

## Contributor Information

**Your Name/Username:** [How you'd like to be credited]  
**Native Speaker:** [ ] Yes [ ] No  
**Translation Experience:** [Brief description of your translation background, if any]

## Translation Checklist

Please check all that apply:

### Files Modified/Added
- [ ] Created new translation file: `/src/lang/translations/[language-code].ts`
- [ ] Updated `/src/lang/translations/index.ts` to export new translation
- [ ] Updated `/src/lang/I18nManager.ts` to include new language in supported locales

### Translation Quality
- [ ] All translation keys from `en.ts` have been translated
- [ ] Translations are contextually appropriate (not just literal translations)
- [ ] UI-specific terms (buttons, menus, etc.) follow platform conventions for this language
- [ ] Nutritional/dietary terms are accurate and commonly used
- [ ] Numbers, dates, and measurements follow local formatting conventions
- [ ] Translations fit within typical UI space constraints

### Technical Requirements
- [ ] File follows the exact same structure as `en.ts`
- [ ] All interpolation variables (e.g., `{count}`, `{name}`) are preserved
- [ ] TypeScript syntax is correct
- [ ] File exports as `[languageCode]Translations`

### Testing
- [ ] I have tested the translations in the plugin (if possible)
- [ ] All strings display correctly without layout issues
- [ ] Pluralization works correctly for this language
- [ ] Special characters and diacritics display properly

## Translation Notes

### Context and Choices
Please explain any translation decisions that might not be obvious:

```
Example:
- "Macros" → "Makros" (commonly used term in German fitness communities)
- "Daily targets" → "Tagesziele" (more natural than literal translation)
```

### Pluralization Rules
If your language has complex pluralization rules, please document them:

```
Example for languages with dual forms:
- 1 item: "1 elemento"
- 2-4 items: "2 elementi" 
- 5+ items: "5 elementos"
```

### Cultural Considerations
Note any cultural adaptations made:

```
Example:
- Used metric measurements throughout (grams, kilojoules)
- Adapted meal names to local cuisine context
```

## Screenshots (Optional)

If you've tested the translation, screenshots showing the UI in your language would be helpful:

[Add screenshots here or links to them]

## Additional Information

### Questions or Concerns
Is there anything about the translation you're unsure about or would like feedback on?

### Future Maintenance
Are you willing to help maintain this translation for future updates?
- [ ] Yes, I can help with updates
- [ ] Maybe, depending on availability
- [ ] No, this is a one-time contribution

### Translation Coverage
If you couldn't translate everything, please note what's missing:

```
Example:
- Some technical nutrition terms need verification
- Date formatting needs testing
- Meal template examples need localization
```

---

## For Maintainers

### Review Checklist
- [ ] Translation file structure matches template
- [ ] All required keys are present
- [ ] TypeScript compiles without errors
- [ ] I18nManager includes new language
- [ ] Index file exports new translation
- [ ] Contributor added to credits
- [ ] Translation tested in development environment

### Quality Assurance
- [ ] Native speaker review (if available)
- [ ] UI layout tested with longer text
- [ ] Pluralization tested
- [ ] Special characters render correctly
- [ ] Cultural appropriateness verified

**Estimated Review Time:** [2-5 business days]

---

Thank you for contributing to making the Macros plugin accessible to more users worldwide! 🙏