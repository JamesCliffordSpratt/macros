# 🌍 Localization Guide for Macros Plugin

Welcome to the Macros plugin localization project! This guide will help you contribute translations to make the plugin accessible to users worldwide.

## Quick Start

1. **Check existing translations** in `/src/lang/translations/` to see what's already available
2. **Fork the repository** at https://github.com/JamesCliffordSpratt/macros
3. **Follow the step-by-step guide** below to add your language
4. **Test your translation** (if possible) and create a pull request

### Native Speaker Verification Needed

The Spanish translation is AI-generated and **requires verification by a native Spanish speaker** before being considered complete. If you're a native Spanish speaker and would like to review/improve the existing translation, please:

1. Review the file `/src/lang/translations/es.ts`
2. Check for cultural appropriateness and natural phrasing
3. Verify nutrition/fitness terminology accuracy
4. Submit corrections via pull request or issue

All Obsidian-supported languages are prioritized to ensure maximum user compatibility. When you change Obsidian's interface language, the plugin will automatically use your translation if available, or fall back to English.

## Translation Status

### Completed Translations
- 🇺🇸 **English** (`en`) - Base language ✅
- 🇪🇸 **Spanish** (`es`) - AI-generated, needs native speaker verification ⚠️

### High Priority Languages (Obsidian Supported)
Based on Obsidian's official language support, these translations would have the most impact:

**European Languages:**
- 🇫🇷 **French** (`fr`) - Contributors needed 🔍
- 🇩🇪 **German** (`de`) - Contributors needed 🔍
- 🇮🇹 **Italian** (`it`) - Contributors needed 🔍
- 🇵🇹 **Portuguese** (`pt`) - Contributors needed 🔍
- 🇧🇷 **Brazilian Portuguese** (`pt-BR`) - Contributors needed 🔍
- 🇳🇱 **Dutch** (`nl`) - Contributors needed 🔍
- 🇵🇱 **Polish** (`pl`) - Contributors needed 🔍
- 🇨🇿 **Czech** (`cs`) - Contributors needed 🔍
- 🇩🇰 **Danish** (`da`) - Contributors needed 🔍
- 🇳🇴 **Norwegian** (`no`) - Contributors needed 🔍
- 🇭🇺 **Hungarian** (`hu`) - Contributors needed 🔍
- 🇷🇴 **Romanian** (`ro`) - Contributors needed 🔍
- 🇦🇱 **Albanian** (`sq`) - Contributors needed 🔍
- 🇱🇻 **Latvian** (`lv`) - Contributors needed 🔍
- 🇺🇦 **Ukrainian** (`uk`) - Contributors needed 🔍
- 🇧🇾 **Belarusian** (`be`) - Contributors needed 🔍
- 🇪🇸 **Catalan** (`ca`) - Contributors needed 🔍
- 🇹🇷 **Turkish** (`tr`) - Contributors needed 🔍

**Asian Languages:**
- 🇯🇵 **Japanese** (`ja`) - Contributors needed 🔍
- 🇰🇷 **Korean** (`ko`) - Contributors needed 🔍
- 🇨🇳 **Chinese Simplified** (`zh-CN`) - Contributors needed 🔍
- 🇹🇼 **Chinese Traditional** (`zh-TW`) - Contributors needed 🔍
- 🇹🇭 **Thai** (`th`) - Contributors needed 🔍
- 🇻🇳 **Vietnamese** (`vi`) - Contributors needed 🔍
- 🇮🇩 **Indonesian** (`id`) - Contributors needed 🔍
- 🇲🇾 **Malay** (`ms`) - Contributors needed 🔍
- 🇳🇵 **Nepali** (`ne`) - Contributors needed 🔍
- 🇰🇭 **Khmer** (`km`) - Contributors needed 🔍
- 🇺🇿 **Uzbek** (`uz`) - Contributors needed 🔍

**Middle Eastern & African Languages:**
- 🇸🇦 **Arabic** (`ar`) - Contributors needed 🔍
- 🇮🇷 **Persian/Farsi** (`fa`) - Contributors needed 🔍
- 🇮🇱 **Hebrew** (`he`) - Contributors needed 🔍
- 🇪🇹 **Amharic** (`am`) - Contributors needed 🔍

**Slavic Languages:**
- 🇷🇺 **Russian** (`ru`) - Contributors needed 🔍

> **Note:** All languages listed above are officially supported by Obsidian, ensuring maximum compatibility and user adoption.

## Step-by-Step Translation Process

### 1. Fork and Set Up the Repository

#### Step 1: Fork the Repository
1. Go to https://github.com/JamesCliffordSpratt/macros
2. Click the **"Fork"** button in the top-right corner
3. This creates a copy of the repository in your GitHub account

#### Step 2: Clone Your Fork
```bash
# Replace "YOURUSERNAME" with your actual GitHub username
git clone https://github.com/YOURUSERNAME/macros.git
cd macros
```

#### Step 3: Set Up for Development
```bash
# Add the original repo as upstream for future updates
git remote add upstream https://github.com/JamesCliffordSpratt/macros.git

# Create your translation branch (replace "french" with your language)
git checkout -b add-french-translation

# Install dependencies (optional, for testing)
npm install
```

### 2. Create Your Translation File

Create a new file: `/src/lang/translations/[language-code].ts`

```typescript
import { LocaleData } from '../I18nManager';

/**
 * [Language Name] translations
 */
export const [languageCode]Translations: LocaleData = {
  // Copy the structure from en.ts and translate all values
  general: {
    loading: 'Your translation here...',
    save: 'Your translation here...',
    // ... etc
  },
  // ... rest of the translation object
};
```

### 3. Key Translation Guidelines

#### Text Length Considerations
- **Buttons**: Keep translations concise (UI space is limited)
- **Tooltips**: Can be longer and more descriptive
- **Error messages**: Should be clear and helpful

#### Variable Preservation
Always preserve variables in curly braces:
```typescript
// ✅ Correct
"Welcome {name}!" → "¡Bienvenido {name}!"

// ❌ Wrong - variable removed
"Welcome {name}!" → "¡Bienvenido!"
```

#### Context-Aware Translation
Consider the context where text appears:

```typescript
// Button text (short)
"Add" → "Añadir" (Spanish)

// Menu item (can be longer)
"Add food item" → "Añadir elemento alimentario"

// Tooltip (descriptive)
"Add a new food item to your nutrition database" 
→ "Añadir un nuevo alimento a tu base de datos nutricional"
```

### Language Code Reference

Use these standard language codes when creating translation files:

| Language | Code | Native Name |
|----------|------|-------------|
| English | `en` | English |
| Spanish | `es` | Español |
| French | `fr` | Français |
| German | `de` | Deutsch |
| Italian | `it` | Italiano |
| Portuguese | `pt` | Português |
| Brazilian Portuguese | `pt-BR` | Português do Brasil |
| Dutch | `nl` | Nederlands |
| Polish | `pl` | Polski |
| Czech | `cs` | čeština |
| Danish | `da` | Dansk |
| Norwegian | `no` | Norsk |
| Hungarian | `hu` | Magyar |
| Romanian | `ro` | Română |
| Albanian | `sq` | Shqip |
| Latvian | `lv` | Latviešu |
| Ukrainian | `uk` | Українська |
| Belarusian | `be` | беларуская мова |
| Catalan | `ca` | català |
| Turkish | `tr` | Türkçe |
| Russian | `ru` | Русский |
| Japanese | `ja` | 日本語 |
| Korean | `ko` | 한국어 |
| Chinese Simplified | `zh-CN` | 简体中文 |
| Chinese Traditional | `zh-TW` | 繁體中文 |
| Thai | `th` | ไทย |
| Vietnamese | `vi` | Tiếng Việt |
| Indonesian | `id` | Bahasa Indonesia |
| Malay | `ms` | Bahasa Melayu |
| Nepali | `ne` | नेपाली |
| Khmer | `km` | ខ្មែរ |
| Uzbek | `uz` | o'zbekcha |
| Arabic | `ar` | ٱلْعَرَبِيَّة‎ |
| Persian/Farsi | `fa` | فارسی |
| Hebrew | `he` | עברית |
| Amharic | `am` | አማርኛ |

Pay special attention to these domain-specific terms:

| English | Context | Translation Notes |
|---------|---------|-------------------|
| Macros | Short for macronutrients | Often adopted as-is in many languages |
| Calories/kcal | Energy measurement | Consider local preferences (kcal vs kJ) |
| Protein | Macronutrient | Use standard nutritional term |
| Carbohydrates/Carbs | Macronutrient | Use commonly understood term |
| Serving size | Portion measurement | Consider local measuring conventions |
| Daily targets | Nutrition goals | Use motivational language |

### 6. Update Supporting Files

#### A. Add to Index File
Edit `/src/lang/translations/index.ts`:

```typescript
export { enTranslations } from './en';
export { esTranslations } from './es';
export { [yourLanguageCode]Translations } from './[language-code]'; // Add this line
```

#### B. Update I18nManager
Edit `/src/lang/I18nManager.ts` in the `getTranslationsFromFile` method:

```typescript
private getTranslationsFromFile(locale: string): LocaleData {
  const translationMap: Record<string, LocaleData> = {
    en: enTranslations,
    es: esTranslations,
    [yourLanguageCode]: [yourLanguageCode]Translations, // Add this line
  };

  return translationMap[locale] || {};
}
```

### 7. Testing Your Translation

If you can test your translation:

1. **Build the plugin**: `npm run build`
2. **Install in Obsidian**: Copy to your `.obsidian/plugins/` folder
3. **Change Obsidian's language** to your target language
4. **Check all UI elements** render correctly
5. **Test variable interpolation** works
6. **Verify text fits** in UI elements

### 8. Submit Your Pull Request

#### Step 1: Commit and Push Your Changes
```bash
# Add all your changes
git add .

# Commit with a descriptive message
git commit -m "Add [Language Name] translation ([language-code])"

# Push to your fork (replace "french" with your language)
git push origin add-french-translation
```

#### Step 2: Create the Pull Request
1. Go to your fork on GitHub: `https://github.com/YOURUSERNAME/macros`
2. You'll see a **"Compare & pull request"** button - click it
3. Fill out the pull request template with your translation details
4. Click **"Create pull request"**

#### Step 3: What to Include in Your PR
- Screenshots of the translated UI (if you tested it)
- Notes about any translation decisions you made
- Information about your translation background
- Any questions or areas where you'd like feedback

## Translation Quality Standards

### Accuracy
- ✅ Contextually appropriate translations
- ✅ Proper nutrition/fitness terminology
- ✅ Cultural adaptation where needed
- ❌ Direct word-for-word translations

### Consistency
- ✅ Consistent terminology throughout
- ✅ Consistent tone and style
- ✅ Consistent formatting conventions
- ❌ Mixed formal/informal address

### Technical Correctness
- ✅ All translation keys present
- ✅ Variables preserved correctly
- ✅ TypeScript syntax valid
- ✅ Proper character encoding

## Special Considerations

### Right-to-Left Languages (Arabic, Hebrew)
- Text direction is handled automatically
- Focus on text content, not layout
- Test UI alignment if possible

### Languages with Complex Pluralization
Document your pluralization rules in the PR:

```typescript
// Example for languages with dual forms
{
  "items": "{count} elementos", // Spanish example
  // Document: 1 item = "1 elemento", 2+ items = "X elementos"
}
```

### Languages with Honorifics
Choose appropriate formality level:
- **Fitness apps**: Usually informal/friendly
- **Settings**: Can be more formal
- **Error messages**: Clear and respectful

## Getting Help

### Questions About Context
If you're unsure about the context of a string:

1. Check the English file for comments
2. Look at the file structure for clues
3. Ask in the GitHub issue or discussion
4. Reference the Spanish translation for comparison

### Technical Issues
For help with:
- TypeScript syntax
- File structure
- Build errors
- Testing setup

Please create an issue or discussion in the repository.

### Translation Review
We encourage:
- **Native speaker reviews** before submitting
- **Community feedback** on translations
- **Iterative improvements** over time

## Recognition

Contributors will be:
- 🏆 **Credited** in the plugin documentation
- 🌟 **Listed** in the supported locales info
- 💝 **Thanked** in release notes

## Maintenance

After your initial contribution:
- 📧 We may contact you for updates when new strings are added
- 🔄 You can submit updates anytime
- 🤝 We welcome ongoing collaboration

---

## Example: Complete French Translation Workflow

Here's a complete example of adding French support from start to finish:

### 1. Set Up Repository
```bash
# Fork https://github.com/JamesCliffordSpratt/macros on GitHub first
git clone https://github.com/marie/macros.git  # Using "marie" as example username
cd macros
git remote add upstream https://github.com/JamesCliffordSpratt/macros.git
git checkout -b add-french-translation
```

### 2. Create Translation Files
1. **Create** `/src/lang/translations/fr.ts` and translate all strings
2. **Update** `/src/lang/translations/index.ts`:
   ```typescript
   export { enTranslations } from './en';
   export { esTranslations } from './es';
   export { frTranslations } from './fr';  // Add this line
   ```
3. **Update** `/src/lang/I18nManager.ts` in the `getTranslationsFromFile` method:
   ```typescript
   const translationMap: Record<string, LocaleData> = {
     en: enTranslations,
     es: esTranslations,
     fr: frTranslations,  // Add this line
   };
   ```

### 3. Test and Submit
```bash
# Test your translation (optional)
npm run build

# Commit and push
git add .
git commit -m "Add French translation (fr)"
git push origin add-french-translation

# Create PR on GitHub using the template
```

Thank you for helping make the Macros plugin accessible to users worldwide! 🙏

---

*For questions or support, please open an issue or start a discussion at https://github.com/JamesCliffordSpratt/macros*