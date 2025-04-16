'use strict';

var obsidian = require('obsidian');

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

/*
 * Utility Functions for Macros Plugin
 * -----------------------------------------------
 * Includes helper functions used across the plugin:
 *  - getVaultFolders: Retrieves all folder paths in the vault.
 *  - mergeMacroLines: Merges duplicate food lines by summing their serving sizes.
 *  - extractServingSize: Extracts a serving size from a food description.
 *  - extractNutritionalData: Parses calories, protein, fat, and carbs from food descriptions.
 *  - parseGrams: Extracts a numeric value (in grams) from a text string.
 *  - findMatchingFoodFile: Find food file based on query.
 *  - processNutritionalData: Process nutritional data for a food item.
 */
function getVaultFolders(app) {
    const folders = [];
    const traverse = (folder) => {
        folders.push(folder.path);
        folder.children.forEach(child => {
            if (child instanceof obsidian.TFolder) {
                traverse(child);
            }
        });
    };
    traverse(app.vault.getRoot());
    return folders.sort();
}
/**
 * Merges multiple macro lines that reference the same food item by summing their serving sizes.
 * Also merges multiple instances of the same meal template with a count.
 * Example: Two entries "Apple: 100g" become "Apple:200g".
 * Example: Two entries "meal:Breakfast" become "meal:Breakfast × 2".
 * @param lines An array of macro line strings.
 * @returns An array of merged macro line strings.
 */
function mergeMacroLines(lines) {
    console.log("mergeMacroLines input:", lines);
    const mergedFood = {};
    const mergedMeals = {};
    lines.forEach((line, index) => {
        if (line.toLowerCase().startsWith("meal:")) {
            // Extract the meal name (ignore any existing count marker)
            const fullMealText = line.substring(5).trim();
            let mealName = fullMealText;
            let existingCount = 1;
            // Check if there's already a count indicator
            const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
            if (countMatch) {
                mealName = countMatch[1];
                existingCount = parseInt(countMatch[2]);
                console.log(`Found existing count for ${mealName}: ${existingCount}`);
            }
            const key = mealName.toLowerCase();
            // Check if we've seen this meal before
            if (!mergedMeals[key]) {
                mergedMeals[key] = { mealName, count: existingCount, firstIndex: index };
                console.log(`First instance of ${mealName}, count: ${existingCount}`);
            }
            else {
                mergedMeals[key].count += existingCount;
                console.log(`Added ${existingCount} to ${mealName}, new count: ${mergedMeals[key].count}`);
            }
        }
        else if (!line.toLowerCase().startsWith("-") && line.includes(':')) {
            const match = line.match(/^([^:]+):\s*([\d\.]+)g$/i);
            if (match) {
                const foodName = match[1].trim();
                const serving = parseFloat(match[2]);
                const key = foodName.toLowerCase();
                if (isNaN(serving))
                    return;
                if (!mergedFood[key]) {
                    mergedFood[key] = { foodName, totalServing: serving, firstIndex: index };
                }
                else {
                    mergedFood[key].totalServing += serving;
                }
            }
        }
    });
    const output = [];
    lines.forEach((line, index) => {
        if (line.toLowerCase().startsWith("meal:")) {
            const fullMealText = line.substring(5).trim();
            let mealName = fullMealText;
            // Check if there's already a count indicator
            const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
            if (countMatch) {
                mealName = countMatch[1];
            }
            const key = mealName.toLowerCase();
            if (mergedMeals[key] && mergedMeals[key].firstIndex === index) {
                // Add the meal with a count indicator if count > 1
                if (mergedMeals[key].count > 1) {
                    output.push(`meal:${mealName} × ${mergedMeals[key].count}`);
                    console.log(`Output: meal:${mealName} × ${mergedMeals[key].count}`);
                }
                else {
                    output.push(`meal:${mealName}`);
                }
            }
            // Skip this meal if it's not the first instance
        }
        else if (!line.toLowerCase().startsWith("-") && line.includes(':')) {
            const match = line.match(/^([^:]+):\s*([\d\.]+)g$/i);
            if (match) {
                const key = match[1].trim().toLowerCase();
                if (mergedFood[key] && mergedFood[key].firstIndex === index) {
                    output.push(`${mergedFood[key].foodName}:${mergedFood[key].totalServing}g`);
                }
                return;
            }
            output.push(line);
        }
        else if (!line.toLowerCase().startsWith("-")) {
            output.push(line);
        }
    });
    console.log("mergeMacroLines output:", output);
    return output;
}
/**
 * extractServingSize
 * ------------------
 * Extracts the serving size from a food description.
 * Returns the concatenated number and unit if found, otherwise "Unknown".
 */
function extractServingSize(description) {
    try {
        const regex = /Per\s*(\d+(\.\d+)?)\s*(g|medium|large|slice|cup|tbsp|oz)/i;
        const match = description.match(regex);
        return match ? `${match[1]}${match[3]}` : 'Unknown';
    }
    catch (error) {
        console.error('Error extracting serving size:', error);
        return 'Unknown';
    }
}
/**
 * extractNutritionalData
 * ----------------------
 * Extracts nutritional information (calories, fat, carbs, and protein) from a food description.
 * Returns the numeric value if found; otherwise "N/A".
 */
function extractNutritionalData(description) {
    try {
        const caloriesMatch = description.match(/Calories:\s*(\d+(\.\d+)?)kcal/i);
        const fatMatch = description.match(/Fat:\s*(\d+(\.\d+)?)g/i);
        const carbsMatch = description.match(/Carbs:\s*(\d+(\.\d+)?)g/i);
        const proteinMatch = description.match(/Protein:\s*(\d+(\.\d+)?)g/i);
        return {
            calories: caloriesMatch ? caloriesMatch[1] : 'N/A',
            fat: fatMatch ? fatMatch[1] : 'N/A',
            carbs: carbsMatch ? carbsMatch[1] : 'N/A',
            protein: proteinMatch ? proteinMatch[1] : 'N/A',
        };
    }
    catch (error) {
        console.error('Error extracting nutritional data:', error);
        return { calories: 'N/A', fat: 'N/A', carbs: 'N/A', protein: 'N/A' };
    }
}
/**
 * parseGrams
 * ----------
 * Extracts a numeric value (in grams) from a text string.
 */
function parseGrams(value) {
    const match = value.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[0]) : NaN;
}
/**
 * normalizeName
 * -------------
 * Normalizes a food name for case-insensitive comparison.
 */
function normalizeName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
/**
 * findMatchingFoodFile
 * --------------------
 * Finds a matching food file based on a query.
 */
function findMatchingFoodFile(files, foodQuery) {
    const queryLower = foodQuery.toLowerCase();
    // Try to find an exact match ignoring the .md extension.
    const exactMatches = files.filter(f => f.name.replace(/\.md$/, '').toLowerCase() === queryLower);
    if (exactMatches.length === 1)
        return exactMatches[0];
    // If no exact match, try partial match.
    const partialMatches = files.filter(f => f.name.toLowerCase().includes(queryLower));
    if (partialMatches.length === 1)
        return partialMatches[0];
    if (partialMatches.length > 1) {
        console.warn(`Ambiguous food query "${foodQuery}" matches multiple files. Please disambiguate.`);
        return null;
    }
    return null;
}
/**
 * processNutritionalData
 * ----------------------
 * Process nutritional data for a food item, scaling by quantity if provided.
 */
function processNutritionalData(app, foodFile, specifiedQuantity = null) {
    const cache = app.metadataCache.getFileCache(foodFile);
    if (!cache || !cache.frontmatter)
        return null;
    const fm = cache.frontmatter;
    const storedServing = fm['serving_size'] || '';
    if (!storedServing.toLowerCase().includes('g'))
        return null;
    const storedServingGrams = parseGrams(storedServing);
    if (isNaN(storedServingGrams))
        return null;
    const quantity = (specifiedQuantity != null && !isNaN(specifiedQuantity))
        ? specifiedQuantity
        : storedServingGrams;
    const scale = quantity / storedServingGrams;
    const cal = parseFloat(fm['calories']) || 0;
    const prot = parseFloat(fm['protein']) || 0;
    const fat = parseFloat(fm['fat']) || 0;
    const carbs = parseFloat(fm['carbs']) || 0;
    return {
        name: foodFile.name.replace(/\.md$/, ''),
        serving: `${quantity}g`,
        calories: cal * scale,
        protein: prot * scale,
        fat: fat * scale,
        carbs: carbs * scale
    };
}
/**
 * Renders a pie chart for macronutrients
 */
function renderMacronutrientPieChart(ctx, protein, fat, carbs, proteinColor, fatColor, carbsColor) {
    const centerX = 150;
    const centerY = 150;
    const radius = 150;
    const slices = [
        { label: 'Protein', value: protein, color: proteinColor },
        { label: 'Fat', value: fat, color: fatColor },
        { label: 'Carbs', value: carbs, color: carbsColor },
    ];
    const sumMacros = protein + fat + carbs;
    if (sumMacros <= 0) {
        return false;
    }
    let startAngle = 0;
    slices.forEach(slice => {
        const fraction = slice.value / sumMacros;
        const sliceAngle = fraction * 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = slice.color;
        ctx.fill();
        startAngle += sliceAngle;
    });
    return true;
}
/**
 * Creates a legend for a pie chart
 */
function createPieChartLegend(el, slices) {
    const legendDiv = el.createEl('div', {
        cls: 'macrospc-legend',
        attr: { style: 'margin-top: 1em;' }
    });
    slices.forEach(slice => {
        const legendItem = legendDiv.createEl('div', {
            cls: 'macrospc-legend-item',
            attr: { style: 'display: flex; align-items: center; margin-bottom: 2px;' }
        });
        const colorBox = legendItem.createEl('span');
        colorBox.style.backgroundColor = slice.color;
        colorBox.style.display = 'inline-block';
        colorBox.style.width = '12px';
        colorBox.style.height = '12px';
        colorBox.style.marginRight = '5px';
        legendItem.createEl('span', { text: `${slice.label}: ${slice.value.toFixed(2)} g` });
    });
    return legendDiv;
}

(function (root, factory, undef) {
	if (typeof exports === "object") {
		// CommonJS
		module.exports = exports = factory(require("./core"), require("./x64-core"), require("./lib-typedarrays"), require("./enc-utf16"), require("./enc-base64"), require("./enc-base64url"), require("./md5"), require("./sha1"), require("./sha256"), require("./sha224"), require("./sha512"), require("./sha384"), require("./sha3"), require("./ripemd160"), require("./hmac"), require("./pbkdf2"), require("./evpkdf"), require("./cipher-core"), require("./mode-cfb"), require("./mode-ctr"), require("./mode-ctr-gladman"), require("./mode-ofb"), require("./mode-ecb"), require("./pad-ansix923"), require("./pad-iso10126"), require("./pad-iso97971"), require("./pad-zeropadding"), require("./pad-nopadding"), require("./format-hex"), require("./aes"), require("./tripledes"), require("./rc4"), require("./rabbit"), require("./rabbit-legacy"), require("./blowfish"));
	}
	else if (typeof define === "function" && define.amd) {
		// AMD
		define(["./core", "./x64-core", "./lib-typedarrays", "./enc-utf16", "./enc-base64", "./enc-base64url", "./md5", "./sha1", "./sha256", "./sha224", "./sha512", "./sha384", "./sha3", "./ripemd160", "./hmac", "./pbkdf2", "./evpkdf", "./cipher-core", "./mode-cfb", "./mode-ctr", "./mode-ctr-gladman", "./mode-ofb", "./mode-ecb", "./pad-ansix923", "./pad-iso10126", "./pad-iso97971", "./pad-zeropadding", "./pad-nopadding", "./format-hex", "./aes", "./tripledes", "./rc4", "./rabbit", "./rabbit-legacy", "./blowfish"], factory);
	}
	else {
		// Global (browser)
		root.CryptoJS = factory(root.CryptoJS);
	}
}(undefined, function (CryptoJS) {

	return CryptoJS;

}));

/*
 * API Integration for Macros Plugin
 * -------------------------------------------
 * Handles API calls to the FatSecret platform.
 * This module:
 *  - Constructs OAuth-signed requests.
 *  - Fetches food data using user-provided search terms.
 *  - Filters and processes API responses to ensure valid serving sizes (in grams).
 *
 * NOTE: Hard-coded API credentials are used during development.
 */
// @ts-ignore
const OAuth = require('oauth-1.0a');
/**
 * Fetches food data from the FatSecret API.
 * @returns A Promise that resolves to an array of FoodItem objects.
 */
function fetchFoodData(app, foodName, pageNumber, maxResults, apiKey, apiSecret) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        // Initialize OAuth with HMAC-SHA1 signature method.
        const oauth = new OAuth({
            consumer: { key: apiKey, secret: apiSecret },
            signature_method: 'HMAC-SHA1',
            hash_function(baseString, key) {
                return undefined(baseString, key).toString(undefined.Base64);
            },
        });
        // Prepare request parameters.
        const requestData = {
            url: 'https://platform.fatsecret.com/rest/server.api',
            method: 'GET',
            data: {
                method: 'foods.search',
                format: 'json',
                search_expression: foodName,
                measurement_grams: '100',
                page_number: pageNumber.toString(),
                max_results: maxResults.toString(),
            },
        };
        // Append OAuth authorization parameters.
        const fullUrl = requestData.url + '?' + new URLSearchParams(Object.assign(Object.assign({}, requestData.data), oauth.authorize(requestData))).toString();
        console.log('FatSecret request URL:', fullUrl);
        try {
            const response = yield obsidian.requestUrl({ url: fullUrl, method: 'GET' });
            console.log('FatSecret API Response:', response.json);
            // Check if the response contains an error property.
            if (response.json && response.json.error) {
                const errorText = String(response.json.error);
                console.error('FatSecret API error:', errorText);
                // Log a special message if the error suggests invalid credentials.
                if (errorText.toLowerCase().includes('invalid')) {
                    console.error('Invalid API credentials detected. Please check your FatSecret API credentials.');
                }
                return [];
            }
            if ((_a = response.json.foods) === null || _a === void 0 ? void 0 : _a.food) {
                const foods = response.json.foods.food;
                if (Array.isArray(foods)) {
                    // Filter only items with a valid serving size.
                    return foods.filter(food => {
                        const s = extractServingSize(food.food_description);
                        return s.toLowerCase().endsWith('g');
                    });
                }
                else {
                    const s = extractServingSize(foods.food_description);
                    return s.toLowerCase().endsWith('g') ? [foods] : [];
                }
            }
            else {
                console.warn('No "food" field in response:', response.json);
                return [];
            }
        }
        catch (error) {
            console.error('Error fetching food data:', error);
            return [];
        }
    });
}

/*
 * Modals for Macros Plugin
 * -----------------------------------
 * This file defines all custom modals for the plugin.
 * These include:
 *  - FoodSearchModal: To prompt the user for a food search term.
 *  - FoodResultsModal: To display the search results fetched from the FatSecret API.
 *  - AddToMacrosModal: To allow users to add selected food items or meal templates to a macros block.
 *  - AddMealTemplateModal: For creating new meal templates.
 *  - EditMealTemplateModal: For editing an existing meal template.
 *  - CustomServingSizeModal: For specifying a custom serving size.
 *  - AddFoodToMealModal: For adding food items to a meal template.
 */
/**
 * AddToMacrosModal
 * ----------------
 * A modal dialog that allows users to add selected food items or meal templates to a macros table.
 *
 * @param app - The Obsidian application instance.
 * @param plugin - The instance of MacrosPlugin.
 * @param tableId - The unique identifier for the macros table.
 * @param onDone - A callback function invoked after changes are confirmed.
 */
class AddToMacrosModal extends obsidian.Modal {
    constructor(app, plugin, tableId, onDone) {
        super(app);
        this.selectedItems = [];
        this.plugin = plugin;
        this.tableId = tableId;
        this.onDone = onDone;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Add to Macros' });
        // Meal row.
        const mealRow = contentEl.createDiv({
            cls: 'add-to-macros-row',
            attr: { style: 'display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;' }
        });
        mealRow.createEl('label', { text: 'Select Meal:' });
        const mealSelect = mealRow.createEl('select');
        mealSelect.createEl('option', { text: '-- None --', value: '' });
        this.plugin.settings.mealTemplates.forEach((meal) => {
            mealSelect.createEl('option', { text: meal.name, value: `interactive:meal:${meal.name}` });
        });
        const addMealBtn = mealRow.createEl('button', { text: 'Add Meal' });
        addMealBtn.onclick = () => {
            const mealValue = mealSelect.value;
            if (mealValue) {
                // Always add the meal, even if it's already in the list
                // This allows for multiple instances of the same meal
                this.selectedItems.push(mealValue);
                refreshSummary();
                mealSelect.value = '';
                console.log(`Added meal to selectedItems: ${mealValue}`);
                console.log(`Current selectedItems:`, this.selectedItems);
            }
        };
        // Food row.
        const foodRow = contentEl.createDiv({
            cls: 'add-to-macros-row',
            attr: { style: 'display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;' }
        });
        foodRow.createEl('label', { text: 'Select Food:' });
        const foodSelect = foodRow.createEl('select');
        foodSelect.createEl('option', { text: '-- None --', value: '' });
        const folder = this.plugin.settings.storageFolder;
        const fileList = this.app.vault.getFiles().filter((f) => f.path.startsWith(folder));
        const foodNames = fileList.map((f) => f.name.replace(/\.md$/, ''));
        foodNames.forEach((food) => {
            foodSelect.createEl('option', { text: food, value: 'interactive:' + food });
        });
        const addFoodBtn = foodRow.createEl('button', { text: 'Add Food' });
        addFoodBtn.onclick = () => __awaiter(this, void 0, void 0, function* () {
            const foodValue = foodSelect.value;
            if (foodValue) {
                const foodName = foodValue.substring('interactive:'.length);
                const file = findMatchingFoodFile(fileList, foodName);
                if (!file) {
                    new obsidian.Notice('Food item not found.');
                    return;
                }
                const nutrition = processNutritionalData(this.app, file);
                if (!nutrition || !nutrition.serving) {
                    new obsidian.Notice('Could not process nutrition data for this food.');
                    return;
                }
                const defaultServing = parseGrams(nutrition.serving);
                new CustomServingSizeModal(this.app, foodName, defaultServing, (customServing) => __awaiter(this, void 0, void 0, function* () {
                    const newItem = `interactive:${foodName}:${customServing}g`;
                    this.selectedItems.push(newItem);
                    refreshSummary();
                })).open();
                foodSelect.value = '';
            }
        });
        // Summary.
        const summaryDiv = contentEl.createDiv({
            cls: 'macro-summary-div',
            attr: { style: 'margin-bottom: 1rem;' }
        });
        summaryDiv.createEl('h3', { text: 'Items to add:' });
        const summaryList = summaryDiv.createEl('ul');
        const refreshSummary = () => {
            summaryList.empty();
            this.selectedItems.forEach((item, index) => {
                const displayText = item.startsWith('interactive:') ? item.substring('interactive:'.length) : item;
                const listItem = summaryList.createEl('li');
                listItem.createEl('span', { text: displayText });
                // Add a remove button for each item
                const removeBtn = listItem.createEl('button', {
                    text: ' ×',
                    attr: { style: 'margin-left: 8px; cursor: pointer;' }
                });
                removeBtn.onclick = () => {
                    this.selectedItems.splice(index, 1);
                    refreshSummary();
                };
            });
        };
        const confirmBtn = contentEl.createEl('button', {
            text: 'Confirm Changes',
            attr: { style: 'margin-top: 0.5rem;' }
        });
        confirmBtn.onclick = () => __awaiter(this, void 0, void 0, function* () {
            if (!this.plugin.additionalMacros.has(this.tableId)) {
                this.plugin.additionalMacros.set(this.tableId, []);
            }
            const arr = this.plugin.additionalMacros.get(this.tableId);
            this.selectedItems.forEach(item => arr.push(item));
            console.log(`Confirming changes for table ${this.tableId}`);
            console.log(`additionalMacros for table:`, arr);
            yield this.onDone();
            this.close();
        });
    }
    onClose() {
        this.contentEl.empty();
    }
}
/**
 * FoodSearchModal
 * ---------------
 * A modal that prompts the user to enter a food search term.
 *
 * @param app - The Obsidian application instance.
 * @param onSubmit - A callback function to handle the submitted search term.
 */
class FoodSearchModal extends obsidian.Modal {
    constructor(app, onSubmit) {
        super(app);
        this.onSubmit = onSubmit;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Enter Food Search Term' });
        const inputEl = contentEl.createEl('input', { type: 'text' });
        inputEl.placeholder = 'e.g. Apple';
        inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.onSubmit(inputEl.value);
                this.close();
            }
        });
        inputEl.focus();
    }
    onClose() {
        this.contentEl.empty();
    }
}
/**
 * FoodResultsModal
 * ----------------
 * Displays a list of food items fetched from the FatSecret API based on the user's search term.
 *
 * @param app - The Obsidian application instance.
 * @param searchTerm - The search term provided by the user.
 * @param apiKey - The FatSecret API key.
 * @param apiSecret - The FatSecret API secret.
 * @param onSelect - A callback function that handles the selection of a food item.
 */
class FoodResultsModal extends obsidian.Modal {
    constructor(app, searchTerm, apiKey, apiSecret, onSelect) {
        super(app);
        this.currentPage = 0;
        this.results = [];
        this.maxResults = 20;
        this.searchTerm = searchTerm;
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.onSelect = onSelect;
    }
    loadPage(page) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.currentPage = page;
                this.results = yield fetchFoodData(this.app, this.searchTerm, this.currentPage, this.maxResults, this.apiKey, this.apiSecret);
                this.renderContent();
            }
            catch (error) {
                console.error('Error loading food data:', error);
                new obsidian.Notice('Error fetching food data');
            }
        });
    }
    renderContent() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: `Results for "${this.searchTerm}" (Page ${this.currentPage + 1})` });
        if (this.results.length === 0) {
            contentEl.createEl('p', { text: 'No results found on this page.' });
        }
        else {
            this.results.forEach((food) => {
                const servingSize = extractServingSize(food.food_description);
                const btn = contentEl.createEl('button', { text: `${food.food_name} - ${servingSize}` });
                btn.onclick = () => {
                    this.onSelect(food);
                    this.close();
                };
            });
        }
        const navDiv = contentEl.createDiv({ cls: 'food-nav' });
        if (this.currentPage > 0) {
            const prevBtn = navDiv.createEl('button', { text: '< Prev' });
            prevBtn.onclick = () => this.loadPage(this.currentPage - 1);
        }
        navDiv.createEl('span', { text: ` Page ${this.currentPage + 1} ` });
        if (this.results.length === this.maxResults) {
            const nextBtn = navDiv.createEl('button', { text: 'Next >' });
            nextBtn.onclick = () => this.loadPage(this.currentPage + 1);
        }
    }
    onOpen() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadPage(0);
        });
    }
    onClose() {
        this.contentEl.empty();
    }
}
/**
 * AddMealTemplateModal
 * --------------------
 * Provides a modal interface for creating a new meal template.
 *
 * @param plugin - The instance of MacrosPlugin.
 */
class AddMealTemplateModal extends obsidian.Modal {
    constructor(plugin) {
        super(plugin.app);
        this.plugin = plugin;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'New Meal Template' });
        const nameInput = contentEl.createEl('input', { type: 'text' });
        nameInput.placeholder = 'Meal Name (e.g., Meal1)';
        const createMeal = () => __awaiter(this, void 0, void 0, function* () {
            const mealName = nameInput.value.trim();
            if (!mealName) {
                new obsidian.Notice('Please enter a valid meal name.');
                return;
            }
            if (this.plugin.settings.mealTemplates.some((m) => m.name.toLowerCase() === mealName.toLowerCase())) {
                new obsidian.Notice('A meal template with that name already exists. Please choose a different name.');
                return;
            }
            const newMeal = {
                name: mealName,
                items: [],
            };
            this.plugin.settings.mealTemplates.push(newMeal);
            yield this.plugin.saveSettings();
            this.close();
            new AddFoodToMealModal(this.plugin, newMeal).open();
            this.plugin.nutritionalSettingTab.display();
        });
        nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                createMeal();
            }
        });
        const createBtn = contentEl.createEl('button', { text: 'Create Meal Template' });
        createBtn.onclick = createMeal;
    }
    onClose() {
        this.contentEl.empty();
    }
}
/**
 * EditMealTemplateModal
 * ---------------------
 * Enables editing of an existing meal template, allowing the user to modify the list of food items.
 *
 * @param plugin - The instance of MacrosPlugin.
 * @param meal - The meal template object being edited.
 */
class EditMealTemplateModal extends obsidian.Modal {
    constructor(plugin, meal) {
        super(plugin.app);
        this.plugin = plugin;
        this.meal = meal;
    }
    renderContent() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: `Edit Meal: ${this.meal.name}` });
        const itemList = contentEl.createEl('ul');
        this.meal.items.forEach((item, index) => {
            const li = itemList.createEl('li');
            li.createEl('span', { text: item });
            const removeBtn = li.createEl('button', { text: 'Remove' });
            removeBtn.style.marginLeft = '8px';
            removeBtn.onclick = () => __awaiter(this, void 0, void 0, function* () {
                if (this.meal.items.length <= 1) {
                    new obsidian.Notice('You must have at least 1 food item');
                    return;
                }
                this.meal.items.splice(index, 1);
                yield this.plugin.saveSettings();
                this.close();
                this.plugin.nutritionalSettingTab.display();
            });
        });
        const addFoodBtn = contentEl.createEl('button', { text: '+ Add Food Item' });
        addFoodBtn.onclick = () => {
            new AddFoodToMealModal(this.plugin, this.meal).open();
            this.close();
            this.plugin.nutritionalSettingTab.display();
        };
    }
    onOpen() {
        this.renderContent();
    }
    onClose() {
        this.contentEl.empty();
    }
}
/**
 * CustomServingSizeModal
 * ----------------------
 * A modal dialog that allows the user to specify a custom serving size for a selected food item.
 *
 * @param app - The Obsidian application instance.
 * @param foodName - The name of the food item.
 * @param defaultServing - The default serving size value (in grams).
 * @param onSubmit - A callback function that receives the custom serving size.
 */
class CustomServingSizeModal extends obsidian.Modal {
    constructor(app, foodName, defaultServing, onSubmit) {
        super(app);
        this.foodName = foodName;
        this.defaultServing = defaultServing;
        this.onSubmit = onSubmit;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: `Custom Serving Size for ${this.foodName}` });
        contentEl.createEl('p', { text: `Default serving is ${this.defaultServing}g. Enter a custom serving size in grams:` });
        const inputEl = contentEl.createEl('input', { type: 'number' });
        inputEl.placeholder = `${this.defaultServing}`;
        inputEl.value = `${this.defaultServing}`;
        inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                const value = parseFloat(inputEl.value);
                if (isNaN(value) || value <= 0) {
                    new obsidian.Notice('Please enter a valid serving size.');
                }
                else {
                    this.onSubmit(value);
                    this.close();
                }
            }
        });
        const submitBtn = contentEl.createEl('button', { text: 'Submit' });
        submitBtn.onclick = () => {
            const value = parseFloat(inputEl.value);
            if (isNaN(value) || value <= 0) {
                new obsidian.Notice('Please enter a valid serving size.');
            }
            else {
                this.onSubmit(value);
                this.close();
            }
        };
        inputEl.focus();
    }
    onClose() {
        this.contentEl.empty();
    }
}
/**
 * AddFoodToMealModal
 * ------------------
 * Presents a modal that allows the user to add food items to an existing meal template.
 *
 * @param plugin - The instance of MacrosPlugin.
 * @param meal - The meal template to which food will be added.
 */
class AddFoodToMealModal extends obsidian.Modal {
    constructor(plugin, meal) {
        super(plugin.app);
        this.files = [];
        this.itemListEl = null;
        this.plugin = plugin;
        this.meal = meal;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: `Add Food Items to "${this.meal.name}"` });
        const row = contentEl.createDiv({
            cls: 'add-food-row',
            attr: { style: 'display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;' }
        });
        const folder = this.plugin.settings.storageFolder;
        const fileList = this.app.vault.getFiles().filter(f => f.path.startsWith(folder));
        this.files = fileList.map(f => f.name.replace(/\.md$/, ''));
        const dropdown = row.createEl('select');
        dropdown.createEl('option', { text: '-- Select Food --', value: '' });
        this.files.forEach(fname => {
            const option = dropdown.createEl('option');
            option.value = fname;
            option.text = fname;
        });
        const addBtn = row.createEl('button', { text: '+ Add Selected Item' });
        addBtn.onclick = () => __awaiter(this, void 0, void 0, function* () {
            const selected = dropdown.value;
            if (selected && !this.meal.items.some(item => item.startsWith(selected))) {
                const matchingFile = findMatchingFoodFile(fileList, selected);
                if (!matchingFile) {
                    new obsidian.Notice('Selected food item not found.');
                    return;
                }
                const nutrition = processNutritionalData(this.app, matchingFile);
                if (!nutrition || !nutrition.serving) {
                    new obsidian.Notice('No nutritional data available for this item.');
                    return;
                }
                const defaultServing = parseGrams(nutrition.serving);
                if (isNaN(defaultServing)) {
                    new obsidian.Notice('Invalid default serving size.');
                    return;
                }
                new CustomServingSizeModal(this.app, selected, defaultServing, (customServing) => __awaiter(this, void 0, void 0, function* () {
                    this.meal.items.push(`${selected}:${customServing}g`);
                    yield this.plugin.saveSettings();
                    this.refreshItemList();
                    new obsidian.Notice(`${selected} (${customServing}g) added to ${this.meal.name}`);
                })).open();
            }
            else {
                new obsidian.Notice('Item is already in the meal or not selected.');
            }
        });
        this.itemListEl = contentEl.createEl('ul', {
            attr: { style: 'list-style-type: none; padding-left: 0;' }
        });
        this.refreshItemList();
        const finishBtn = contentEl.createEl('button', { text: 'Finish' });
        finishBtn.onclick = () => {
            this.close();
            this.plugin.nutritionalSettingTab.display();
        };
    }
    refreshItemList() {
        if (!this.itemListEl)
            return;
        this.itemListEl.empty();
        this.meal.items.forEach((item, index) => {
            const li = this.itemListEl.createEl('li');
            const span = li.createEl('span', { text: item });
            span.style.marginRight = '0.5rem';
            const removeBtn = li.createEl('button', { text: '×' });
            removeBtn.style.marginLeft = '0.5rem';
            removeBtn.onclick = () => __awaiter(this, void 0, void 0, function* () {
                this.meal.items.splice(index, 1);
                yield this.plugin.saveSettings();
                this.refreshItemList();
                new obsidian.Notice(`Removed "${item}" from ${this.meal.name}`);
            });
        });
    }
    onClose() {
        this.contentEl.empty();
    }
}

const DEFAULT_SETTINGS = {
    storageFolder: 'Nutrition',
    proteinColor: '#4caf50',
    fatColor: '#f44336',
    carbsColor: '#2196f3',
    mealTemplates: [],
    // Leave these empty by default so that the plugin uses the built-in credentials.
    fatSecretApiKey: '',
    fatSecretApiSecret: '',
};
class NutritionalSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Macros Plugin Settings' });
        // Storage Folder Setting.
        new obsidian.Setting(containerEl)
            .setName('Storage Folder')
            .setDesc('Where to save food .md files')
            .addText(text => {
            text
                .setPlaceholder('Nutrition')
                .setValue(this.plugin.settings.storageFolder)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.storageFolder = value;
                yield this.plugin.saveSettings();
            }));
            const dataListEl = containerEl.createEl('datalist', { attr: { id: 'folderSuggestions' } });
            const folders = getVaultFolders(this.plugin.app);
            folders.forEach(folder => {
                dataListEl.createEl('option', { attr: { value: folder } });
            });
            text.inputEl.setAttribute('list', 'folderSuggestions');
            return text;
        });
        // Protein Color Setting.
        new obsidian.Setting(containerEl)
            .setName('Protein Color')
            .setDesc('Color code for Protein slice (e.g., #4caf50)')
            .addText(text => {
            text
                .setPlaceholder('#4caf50')
                .setValue(this.plugin.settings.proteinColor)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.proteinColor = value;
                yield this.plugin.saveSettings();
                updatePreview();
            }));
            const proteinColorPicker = containerEl.createEl('input', { type: 'color', value: this.plugin.settings.proteinColor });
            proteinColorPicker.style.marginLeft = '10px';
            proteinColorPicker.addEventListener('change', () => __awaiter(this, void 0, void 0, function* () {
                text.setValue(proteinColorPicker.value);
                this.plugin.settings.proteinColor = proteinColorPicker.value;
                yield this.plugin.saveSettings();
                updatePreview();
            }));
            return text;
        });
        // Fat Color Setting.
        new obsidian.Setting(containerEl)
            .setName('Fat Color')
            .setDesc('Color code for Fat slice (e.g., #f44336)')
            .addText(text => {
            text
                .setPlaceholder('#f44336')
                .setValue(this.plugin.settings.fatColor)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.fatColor = value;
                yield this.plugin.saveSettings();
                updatePreview();
            }));
            const fatColorPicker = containerEl.createEl('input', { type: 'color', value: this.plugin.settings.fatColor });
            fatColorPicker.style.marginLeft = '10px';
            fatColorPicker.addEventListener('change', () => __awaiter(this, void 0, void 0, function* () {
                text.setValue(fatColorPicker.value);
                this.plugin.settings.fatColor = fatColorPicker.value;
                yield this.plugin.saveSettings();
                updatePreview();
            }));
            return text;
        });
        // Carbs Color Setting.
        new obsidian.Setting(containerEl)
            .setName('Carbs Color')
            .setDesc('Color code for Carbs slice (e.g., #2196f3)')
            .addText(text => {
            text
                .setPlaceholder('#2196f3')
                .setValue(this.plugin.settings.carbsColor)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.carbsColor = value;
                yield this.plugin.saveSettings();
                updatePreview();
            }));
            const carbsColorPicker = containerEl.createEl('input', { type: 'color', value: this.plugin.settings.carbsColor });
            carbsColorPicker.style.marginLeft = '10px';
            carbsColorPicker.addEventListener('change', () => __awaiter(this, void 0, void 0, function* () {
                text.setValue(carbsColorPicker.value);
                this.plugin.settings.carbsColor = carbsColorPicker.value;
                yield this.plugin.saveSettings();
                updatePreview();
            }));
            return text;
        });
        // Render a preview of the nutritional pie chart.
        const previewContainer = containerEl.createDiv({ cls: 'macrospc-preview-container', attr: { style: 'margin-top: 16px; margin-bottom: 32px; display: flex; flex-direction: column; align-items: center;' } });
        previewContainer.createEl('h3', { text: 'Pie Chart Preview' });
        const previewCanvas = previewContainer.createEl('canvas', { attr: { width: '300', height: '300' } });
        function updatePreview() {
            const proteinInput = containerEl.querySelector('input[placeholder="#4caf50"]');
            const fatInput = containerEl.querySelector('input[placeholder="#f44336"]');
            const carbsInput = containerEl.querySelector('input[placeholder="#2196f3"]');
            const proteinColor = (proteinInput === null || proteinInput === void 0 ? void 0 : proteinInput.value) || '#4caf50';
            const fatColor = (fatInput === null || fatInput === void 0 ? void 0 : fatInput.value) || '#f44336';
            const carbsColor = (carbsInput === null || carbsInput === void 0 ? void 0 : carbsInput.value) || '#2196f3';
            const ctx = previewCanvas.getContext('2d');
            if (!ctx)
                return;
            // Use the shared rendering function with equal distribution for preview
            renderMacronutrientPieChart(ctx, 33, 33, 34, proteinColor, fatColor, carbsColor);
        }
        updatePreview();
        // --- Meal Templates Section ---
        containerEl.createEl('h3', { text: 'Meal Templates' });
        new obsidian.Setting(containerEl)
            .setName('Create a new Meal Template')
            .setDesc('Click to add a new meal template')
            .addButton(btn => {
            btn.setButtonText('+ Add Meal Template').onClick(() => {
                new AddMealTemplateModal(this.plugin).open();
            });
        });
        this.plugin.settings.mealTemplates.forEach((meal) => {
            new obsidian.Setting(containerEl)
                .setName(meal.name)
                .setDesc(meal.items && meal.items.length > 0
                ? meal.items.join(', ')
                : 'No items')
                .addButton(editBtn => {
                editBtn
                    .setButtonText('Edit')
                    .setCta()
                    .onClick(() => {
                    new EditMealTemplateModal(this.plugin, meal).open();
                });
            })
                .addButton(removeBtn => {
                removeBtn
                    .setButtonText('Remove')
                    .setWarning()
                    .onClick(() => __awaiter(this, void 0, void 0, function* () {
                    this.plugin.settings.mealTemplates =
                        this.plugin.settings.mealTemplates.filter(m => m.name !== meal.name);
                    yield this.plugin.saveSettings();
                    // Use a small timeout to allow any active inputs/modals to clean up before re-rendering
                    setTimeout(() => this.display(), 300);
                }));
            });
        });
        // --- Advanced Settings ---
        containerEl.createEl('h3', { text: 'Advanced' });
        // Notice about API credentials.
        const advancedNotice = containerEl.createDiv({ cls: 'advanced-notice', attr: { style: 'background-color: #ff3333; padding: 8px; margin-bottom: 8px; border: 1px solid #ffffff;' } });
        advancedNotice.createEl('p', {
            text: "The default FatSecret API credentials are provided by the Macros Plugin for convenience. You are welcome to sign up for your own API credentials to ensure longevity if the default key becomes obsolete. To sign up, please visit "
        });
        // Create a clickable link.
        advancedNotice.createEl('a', {
            text: "https://platform.fatsecret.com/platform-api",
            attr: { href: "https://platform.fatsecret.com/platform-api", target: "_blank" }
        });
        advancedNotice.createEl('p', {
            text: "User-provided API credentials will be stored in plain text."
        });
        // FatSecret API Key Setting.
        new obsidian.Setting(containerEl)
            .setName('FatSecret API Key')
            .setDesc('Enter your FatSecret API Key. Leave blank to use the default provided by the Macros Plugin.')
            .addText(text => {
            // Leave the text box value empty if no user input exists.
            text
                .setPlaceholder(`Default API`)
                .setValue(this.plugin.settings.fatSecretApiKey)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.fatSecretApiKey = value; // empty value means default
                yield this.plugin.saveSettings();
            }));
            return text;
        });
        // FatSecret API Secret Setting.
        new obsidian.Setting(containerEl)
            .setName('FatSecret API Secret')
            .setDesc('Enter your FatSecret API Secret. Leave blank to use the default provided by the Macros Plugin.')
            .addText(text => {
            text
                .setPlaceholder(`Default API`)
                .setValue(this.plugin.settings.fatSecretApiSecret)
                .onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings.fatSecretApiSecret = value;
                yield this.plugin.saveSettings();
            }));
            return text;
        });
        // Advanced Settings: Test API Connection Button
        new obsidian.Setting(containerEl)
            .setName('Test API Connection')
            .setDesc('Click to test your current FatSecret API credentials.')
            .addButton(button => {
            button
                .setButtonText('Test Connection')
                .onClick(() => __awaiter(this, void 0, void 0, function* () {
                const key = this.plugin.settings.fatSecretApiKey && this.plugin.settings.fatSecretApiKey.trim() !== ""
                    ? this.plugin.settings.fatSecretApiKey.trim()
                    : this.plugin.getDefaultApiKey();
                const secret = this.plugin.settings.fatSecretApiSecret && this.plugin.settings.fatSecretApiSecret.trim() !== ""
                    ? this.plugin.settings.fatSecretApiSecret.trim()
                    : this.plugin.getDefaultApiSecret();
                new obsidian.Notice('Testing connection…');
                try {
                    // Use a common food search term as a test
                    const results = yield fetchFoodData(this.plugin.app, "apple", 0, 1, key, secret);
                    // Check if the results array has at least one item.
                    if (results.length > 0) {
                        new obsidian.Notice('Test connection successful!');
                    }
                    else {
                        new obsidian.Notice('Test connection failed. No data returned. Please check your API credentials.');
                    }
                }
                catch (error) {
                    console.error('Error during test connection:', error);
                    new obsidian.Notice('Test connection failed. Please check your API credentials.');
                }
            }));
        });
    }
}

/*
 * Macros Plugin
 * -------------------------
 * This plugin integrates nutritional data fetching and processing into Obsidian.
 * It handles API communication with FatSecret, file caching, sequential updates,
 * and custom markdown processing for nutritional calculations.
 *
 * Architecture Overview:
 * - main.ts: Core plugin initialization, event registration, and acting as the central hub.
 * - modals.ts: User interface components (dialogs/modals) for various interactions.
 * - processors.ts: Custom markdown code block processors for rendering nutritional data.
 * - settings.ts: Plugin settings and the settings UI.
 * - utils.ts: Helper functions for data parsing, merging, and extraction.
 * - api.ts: External API integration using OAuth (FatSecret API).
 *
 * NOTE on API Credentials:
 * These API credentials are encoded (using Base64) to obfuscate the plain-text values
 * in the source code. FatSecret has permitted these credentials for open-source usage in
 * this free plugin. While this method adds a minor barrier against casual inspection,
 * it is not equivalent to full encryption.
 */
// @ts-ignore
require('oauth-1.0a');
// Encoded credentials, decoded at runtime.
const ENCODED_API_KEY = 'NDQzMGMzYzgyOGMwNDkwN2JjOGI1NTk0MTg0MzU2NzM=';
const ENCODED_API_SECRET = 'M2MxNjQyZjE5ZjhhNDU2Njg0ZDlmNGQ0Njc0NjYxOTQ=';
function decodeCredential(encoded) {
    return Buffer.from(encoded, 'base64').toString('utf8').trim();
}
const FAT_SECRET_API_KEY = decodeCredential(ENCODED_API_KEY);
const FAT_SECRET_API_SECRET = decodeCredential(ENCODED_API_SECRET);
// Constant used for interactive lines in macros blocks.
const INTERACTIVE_PREFIX = "interactive:";
class MacrosPlugin extends obsidian.Plugin {
    constructor() {
        super(...arguments);
        // Holds additional interactive macros lines per table id.
        this.additionalMacros = new Map();
        // Global map to store macros table data by unique id.
        this.macroTables = new Map();
        // Map of macrospc (pie-chart) container elements by macro id.
        this.macrospcContainers = new Map();
        // Set to store macroscalc container elements.
        this.macrocalcContainers = new Set();
        // --- CONCURRENCY LOCK: A simple update mutex to serialize file modifications ---
        this.updateMutex = Promise.resolve();
        // --- FILE CACHE: Cache mapping from folder path to list of files ---
        this.fileCache = new Map();
    }
    getDefaultApiKey() {
        return FAT_SECRET_API_KEY;
    }
    getDefaultApiSecret() {
        return FAT_SECRET_API_SECRET;
    }
    /**
     * Returns the list of files in the given folder, using a cache for performance.
     */
    getFilesInFolder(folder) {
        const cached = this.fileCache.get(folder);
        if (cached !== undefined)
            return cached;
        const allFiles = this.app.vault.getFiles();
        const filtered = allFiles.filter(f => f.path.startsWith(folder));
        this.fileCache.set(folder, filtered);
        return filtered;
    }
    /**
     * Invalidates the file cache. Call this on file modifications.
     */
    invalidateFileCache() {
        this.fileCache.clear();
    }
    /**
     * Enqueues an update function to serialize file modifications.
     * Uses a promise-based mutex (updateMutex) to prevent race conditions.
     * @param updateFn A function that returns a Promise<void> with the update logic.
     * @returns A Promise that resolves when the queued update has completed.
     */
    queueUpdate(updateFn) {
        const timeoutPromise = new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error("Update timed out")), 30000);
        });
        this.updateMutex = this.updateMutex.then(() => Promise.race([updateFn(), timeoutPromise]).catch((error) => {
            console.error("Error during queued update (or update timed out):", error);
        }));
        return this.updateMutex;
    }
    /**
     * Creates a reusable callback function for handling selected food items
     */
    createFoodItemCallback() {
        return (selectedFood) => __awaiter(this, void 0, void 0, function* () {
            const servingSize = extractServingSize(selectedFood.food_description);
            const nutritionalData = extractNutritionalData(selectedFood.food_description);
            const fileName = `${selectedFood.food_name}.md`;
            const frontmatter = `---
calories: ${nutritionalData.calories}
protein: ${nutritionalData.protein}
fat: ${nutritionalData.fat}
carbs: ${nutritionalData.carbs}
serving_size: ${servingSize}
---\n`;
            try {
                yield this.app.vault.create(`${this.settings.storageFolder}/${fileName}`, frontmatter);
                new obsidian.Notice(`Saved ${fileName}`);
            }
            catch (error) {
                console.error('Error creating food file:', error);
                new obsidian.Notice(`Error saving ${fileName}`);
            }
        });
    }
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            this.nutritionalSettingTab = new NutritionalSettingTab(this.app, this);
            this.addSettingTab(this.nutritionalSettingTab);
            // Invalidate file cache on file modifications.
            this.registerEvent(this.app.vault.on('modify', () => this.invalidateFileCache()));
            this.registerEvent(this.app.vault.on('create', () => this.invalidateFileCache()));
            this.registerEvent(this.app.vault.on('delete', () => this.invalidateFileCache()));
            this.registerEvent(this.app.vault.on('rename', () => this.invalidateFileCache()));
            // Ribbon icon opens the Food Search modal.
            this.addRibbonIcon('apple', 'Search for Food (FatSecret)', () => {
                new FoodSearchModal(this.app, (searchTerm) => {
                    // Use user provided API credentials if available; otherwise, fallback to defaults.
                    const apiKey = this.settings.fatSecretApiKey && this.settings.fatSecretApiKey.trim() !== ""
                        ? this.settings.fatSecretApiKey.trim()
                        : FAT_SECRET_API_KEY;
                    const apiSecret = this.settings.fatSecretApiSecret && this.settings.fatSecretApiSecret.trim() !== ""
                        ? this.settings.fatSecretApiSecret.trim()
                        : FAT_SECRET_API_SECRET;
                    new FoodResultsModal(this.app, searchTerm, apiKey, apiSecret, this.createFoodItemCallback()).open();
                }).open();
            });
            // Register a command to search for food.
            this.addCommand({
                id: 'search-food',
                name: 'Search for Food (FatSecret)',
                callback: () => {
                    new FoodSearchModal(this.app, (searchTerm) => {
                        // Retrieve API credentials from settings, falling back if necessary.
                        const apiKey = this.settings.fatSecretApiKey && this.settings.fatSecretApiKey.trim() !== ""
                            ? this.settings.fatSecretApiKey.trim()
                            : FAT_SECRET_API_KEY;
                        const apiSecret = this.settings.fatSecretApiSecret && this.settings.fatSecretApiSecret.trim() !== ""
                            ? this.settings.fatSecretApiSecret.trim()
                            : FAT_SECRET_API_SECRET;
                        new FoodResultsModal(this.app, searchTerm, apiKey, apiSecret, this.createFoodItemCallback()).open();
                    }).open();
                },
            });
            // REGISTER MARKDOWN CODE-BLOCK PROCESSORS FROM processors.ts
            Promise.resolve().then(function () { return require('./processors-a5b3eb92.js'); }).then(module => {
                module.registerProcessors(this);
            });
        });
    }
    /**
     * Renders a pie chart representing the macronutrient breakdown for a given macros table.
     * @param id The table identifier.
     * @param el The HTML element in which to render the chart.
     */
    drawMacrospc(id, el) {
        el.empty();
        const canvas = el.createEl('canvas', { attr: { width: '300', height: '300' } });
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            el.createEl('div', { text: 'Error: Unable to get canvas context.' });
            return;
        }
        if (this.macroTables.has(id)) {
            const macroLines = this.macroTables.get(id);
            let totalProtein = 0;
            let totalFat = 0;
            let totalCarbs = 0;
            // Process each line of the macros table
            macroLines.forEach(line => {
                if (line.toLowerCase().startsWith('meal:')) {
                    // Extract meal name and count if present
                    const fullMealText = line.substring(5).trim();
                    let mealName = fullMealText;
                    let count = 1;
                    // Check if there's a count indicator
                    const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
                    if (countMatch) {
                        mealName = countMatch[1];
                        count = parseInt(countMatch[2]);
                    }
                    const meal = this.settings.mealTemplates.find(m => m.name.toLowerCase() === mealName.toLowerCase());
                    if (!meal)
                        return;
                    meal.items.forEach((item) => {
                        let foodQuery = item;
                        let specifiedQuantity = null;
                        if (item.includes(':')) {
                            const parts = item.split(':').map(s => s.trim());
                            foodQuery = parts[0];
                            specifiedQuantity = parseGrams(parts[1]);
                            // Apply multiplier if count > 1
                            if (count > 1 && specifiedQuantity !== null) {
                                specifiedQuantity = specifiedQuantity * count;
                            }
                        }
                        // Process the food item and get its nutritional data
                        const matchingFile = this.findFoodFile(foodQuery);
                        if (!matchingFile)
                            return;
                        const nutrition = processNutritionalData(this.app, matchingFile, specifiedQuantity);
                        if (!nutrition)
                            return;
                        totalProtein += nutrition.protein;
                        totalFat += nutrition.fat;
                        totalCarbs += nutrition.carbs;
                    });
                }
                else {
                    let foodQuery = line;
                    let specifiedQuantity = null;
                    if (line.includes(':')) {
                        const parts = line.split(':').map(s => s.trim());
                        foodQuery = parts[0];
                        specifiedQuantity = parseGrams(parts[1]);
                    }
                    // Process the food item and get its nutritional data
                    const matchingFile = this.findFoodFile(foodQuery);
                    if (!matchingFile)
                        return;
                    const nutrition = processNutritionalData(this.app, matchingFile, specifiedQuantity);
                    if (!nutrition)
                        return;
                    totalProtein += nutrition.protein;
                    totalFat += nutrition.fat;
                    totalCarbs += nutrition.carbs;
                }
            });
            const sumMacros = totalProtein + totalFat + totalCarbs;
            if (sumMacros <= 0) {
                el.createEl('div', { text: `No macros found for ID: ${id}` });
                return;
            }
            // Render the pie chart
            const proteinColor = this.settings.proteinColor;
            const fatColor = this.settings.fatColor;
            const carbsColor = this.settings.carbsColor;
            const slices = [
                { label: 'Protein', value: totalProtein, color: proteinColor },
                { label: 'Fat', value: totalFat, color: fatColor },
                { label: 'Carbs', value: totalCarbs, color: carbsColor },
            ];
            const success = renderMacronutrientPieChart(ctx, totalProtein, totalFat, totalCarbs, proteinColor, fatColor, carbsColor);
            if (!success) {
                el.createEl('div', { text: `No valid macronutrient data found for ID: ${id}` });
                return;
            }
            // Create the legend
            createPieChartLegend(el, slices);
        }
        else {
            el.createEl('div', { text: 'No macro table found for the given id.' });
        }
    }
    /**
     * Helper method to find a food file in the storage folder
     */
    findFoodFile(foodQuery) {
        const folder = this.settings.storageFolder;
        const files = this.getFilesInFolder(folder);
        const file = files.find(f => normalizeName(f.name.replace(/\.md$/, '')) === normalizeName(foodQuery));
        return file || null; // Convert undefined to null
    }
    /**
     * Draws a combined pie chart from multiple macro table IDs.
     * @param ids An array of table IDs.
     * @param el The HTML element in which to render the chart.
     */
    drawCombinedMacrospc(ids, el) {
        el.empty();
        const canvas = el.createEl('canvas', { attr: { width: '300', height: '300' } });
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            el.createEl('div', { text: 'Error: Unable to get canvas context.' });
            return;
        }
        let totalProtein = 0;
        let totalFat = 0;
        let totalCarbs = 0;
        // Process each macro table ID
        ids.forEach(id => {
            const macroLines = this.macroTables.get(id);
            if (!macroLines)
                return;
            macroLines.forEach(line => {
                if (line.toLowerCase().startsWith('meal:')) {
                    // Extract meal name and count if present
                    const fullMealText = line.substring(5).trim();
                    let mealName = fullMealText;
                    let count = 1;
                    // Check if there's a count indicator
                    const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
                    if (countMatch) {
                        mealName = countMatch[1];
                        count = parseInt(countMatch[2]);
                    }
                    const meal = this.settings.mealTemplates.find(m => m.name.toLowerCase() === mealName.toLowerCase());
                    if (!meal)
                        return;
                    meal.items.forEach(item => {
                        let foodQuery = item;
                        let specifiedQuantity = null;
                        if (item.includes(':')) {
                            const parts = item.split(':').map(s => s.trim());
                            foodQuery = parts[0];
                            specifiedQuantity = parseGrams(parts[1]);
                            // Apply multiplier if count > 1
                            if (count > 1 && specifiedQuantity !== null) {
                                specifiedQuantity = specifiedQuantity * count;
                            }
                        }
                        // Process the food item and get its nutritional data
                        const matchingFile = this.findFoodFile(foodQuery);
                        if (!matchingFile)
                            return;
                        const nutrition = processNutritionalData(this.app, matchingFile, specifiedQuantity);
                        if (!nutrition)
                            return;
                        totalProtein += nutrition.protein;
                        totalFat += nutrition.fat;
                        totalCarbs += nutrition.carbs;
                    });
                }
                else {
                    let foodQuery = line;
                    let specifiedQuantity = null;
                    if (line.includes(':')) {
                        const parts = line.split(':').map(s => s.trim());
                        foodQuery = parts[0];
                        specifiedQuantity = parseGrams(parts[1]);
                    }
                    // Process the food item and get its nutritional data
                    const matchingFile = this.findFoodFile(foodQuery);
                    if (!matchingFile)
                        return;
                    const nutrition = processNutritionalData(this.app, matchingFile, specifiedQuantity);
                    if (!nutrition)
                        return;
                    totalProtein += nutrition.protein;
                    totalFat += nutrition.fat;
                    totalCarbs += nutrition.carbs;
                }
            });
        });
        const sumMacros = totalProtein + totalFat + totalCarbs;
        if (sumMacros <= 0) {
            el.createEl('div', { text: `No macros found for the specified IDs: ${ids.join(", ")}` });
            return;
        }
        // Render the pie chart
        const proteinColor = this.settings.proteinColor;
        const fatColor = this.settings.fatColor;
        const carbsColor = this.settings.carbsColor;
        const slices = [
            { label: 'Protein', value: totalProtein, color: proteinColor },
            { label: 'Fat', value: totalFat, color: fatColor },
            { label: 'Carbs', value: totalCarbs, color: carbsColor },
        ];
        const success = renderMacronutrientPieChart(ctx, totalProtein, totalFat, totalCarbs, proteinColor, fatColor, carbsColor);
        if (!success) {
            el.createEl('div', { text: `No valid macronutrient data found for the specified IDs: ${ids.join(", ")}` });
            return;
        }
        // Create the legend
        createPieChartLegend(el, slices);
    }
    /**
     * Loads the macros table from the vault by searching markdown files.
     * Filters out bullet points to ensure proper merging.
     * @param id The macros table identifier.
     * @returns A Promise resolving to an array of macro line strings or null if not found.
     */
    loadMacroTableFromVault(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const mdFiles = this.app.vault.getFiles().filter(file => file.extension === 'md');
            const regex = new RegExp("```\\s*macros\\s+id:\\s*" + id + "\\s*\\n([\\s\\S]*?)```", "m");
            for (const file of mdFiles) {
                try {
                    const content = yield this.app.vault.read(file);
                    const match = content.match(regex);
                    if (match) {
                        // Filter out the bullet points
                        const tableLines = match[1].split("\n")
                            .map(line => line.trim())
                            .filter(line => line !== '' && !line.startsWith('-'));
                        console.log(`Loading macroTable for id ${id}:`, tableLines);
                        return tableLines;
                    }
                }
                catch (error) {
                    console.error(`Error reading file ${file.path} for macros table:`, error);
                }
            }
            return null;
        });
    }
    /**
     * Updates the global macro table cache by parsing macros blocks from the provided content.
     * Only stores non-bullet-point lines to ensure proper merging.
     * @param content The full file content to search for macros blocks.
     */
    updateGlobalMacroTableFromContent(content) {
        console.log("updateGlobalMacroTableFromContent called");
        try {
            const regex = /```[\t ]*macros[\t ]+id:[\t ]*(\S+)[\t ]*\n([\s\S]*?)```/g;
            let match;
            let updated = false;
            while ((match = regex.exec(content)) !== null) {
                const id = match[1];
                // Filter out the bullet points when storing in the macro tables
                const blockContent = match[2].trim().split("\n")
                    .map(l => l.trim())
                    .filter(l => l !== '' && !l.startsWith('-'));
                console.log(`Updating macroTables for id ${id} with ${blockContent.length} lines:`, blockContent);
                this.macroTables.set(id, blockContent);
                updated = true;
            }
            // If we updated any tables, log that for debugging
            if (updated) {
                console.log("macroTables updated successfully");
                // Debug: log the content of all tables
                for (const [id, lines] of this.macroTables.entries()) {
                    console.log(`Current macroTable[${id}]:`, lines);
                }
            }
        }
        catch (error) {
            console.error("Error updating global macro table from content:", error);
        }
    }
    /**
     * Updates the macros code block in the active file by merging static and interactive lines.
     * Also refreshes global macro tables and triggers re-rendering of markdown views.
     */
    updateMacrosCodeBlock() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("updateMacrosCodeBlock called");
            yield this.queueUpdate(() => __awaiter(this, void 0, void 0, function* () {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile)
                    return;
                try {
                    let content = yield this.app.vault.read(activeFile);
                    const regex = /```macros\s+id:\s*(\S+)\s*([\s\S]*?)```/g;
                    let newContent = content.replace(regex, (match, id, blockContent) => {
                        console.log(`Processing block with id ${id}`);
                        // First, collect all lines including removing interactive prefix
                        let allLines = [];
                        // Process existing content in the block (ignoring bullet points)
                        const staticLines = blockContent.split("\n")
                            .map((l) => l.trim())
                            .filter((l) => l !== "" && !l.startsWith(INTERACTIVE_PREFIX) && !l.startsWith("-"));
                        console.log(`Static lines from block (${staticLines.length}):`, staticLines);
                        allLines = [...staticLines];
                        // Get interactive lines from the map
                        const interactiveLines = (this.additionalMacros.get(id) || []).map((line) => line.startsWith(INTERACTIVE_PREFIX) ? line.substring(INTERACTIVE_PREFIX.length) : line);
                        console.log(`Interactive lines (${interactiveLines.length}):`, interactiveLines);
                        // Add them to the collection
                        allLines = [...allLines, ...interactiveLines];
                        console.log(`Combined lines for merging (${allLines.length}):`, allLines);
                        // Merge duplicate meal entries and food items
                        const mergedLines = mergeMacroLines(allLines);
                        console.log(`Merged lines (${mergedLines.length}):`, mergedLines);
                        // Now expand the meal templates after the merging is complete
                        let expandedContent = "";
                        mergedLines.forEach((line) => {
                            if (line.toLowerCase().startsWith("meal:")) {
                                // Extract meal name and potential multiplier
                                const fullMealText = line.substring(5).trim();
                                let mealName = fullMealText;
                                let count = 1;
                                // Check if there's a count indicator
                                const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
                                if (countMatch) {
                                    mealName = countMatch[1];
                                    count = parseInt(countMatch[2]);
                                    console.log(`Expanding meal ${mealName} with count ${count}`);
                                }
                                const meal = this.settings.mealTemplates.find(m => m.name.toLowerCase() === mealName.toLowerCase());
                                if (meal && meal.items.length > 0) {
                                    expandedContent += line + "\n";
                                    // Add meal items with calculated quantities
                                    meal.items.forEach(item => {
                                        const parts = item.split(':');
                                        if (parts.length > 1 && parts[1].includes('g')) {
                                            // Extract the serving size and multiply by count
                                            const servingMatch = parts[1].match(/^([\d\.]+)g/);
                                            if (servingMatch) {
                                                const serving = parseFloat(servingMatch[1]);
                                                const multipliedServing = serving * count;
                                                expandedContent += `- ${parts[0]}:${multipliedServing}g\n`;
                                                console.log(`Added: - ${parts[0]}:${multipliedServing}g`);
                                            }
                                            else {
                                                expandedContent += `- ${item}\n`;
                                            }
                                        }
                                        else {
                                            expandedContent += `- ${item}\n`;
                                        }
                                    });
                                }
                                else {
                                    expandedContent += line + "\n";
                                }
                            }
                            else {
                                expandedContent += line + "\n";
                            }
                        });
                        // Clear interactive lines after merging
                        this.additionalMacros.set(id, []);
                        return "```macros\nid: " + id + "\n" + expandedContent + "\n```";
                    });
                    yield this.app.vault.modify(activeFile, newContent);
                    // Update the global macro tables with the latest content
                    this.updateGlobalMacroTableFromContent(newContent);
                    this.additionalMacros.clear();
                    // Must trigger metadata changes to force refresh
                    this.app.metadataCache.trigger("changed", activeFile);
                    // Force refresh all views
                    this.refreshMarkdownViews();
                    yield this.redrawAllMacrospc();
                    yield this.redrawAllMacrocalc();
                }
                catch (error) {
                    console.error("Error updating macros code block:", error);
                }
            }));
        });
    }
    /**
     * Iterates over all macrospc container elements and redraws their charts.
     */
    redrawAllMacrospc() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const [id, containerSet] of this.macrospcContainers.entries()) {
                try {
                    const loaded = yield this.loadMacroTableFromVault(id);
                    if (loaded) {
                        this.macroTables.set(id, loaded);
                    }
                }
                catch (error) {
                    console.error(`Error re-loading macro table for id ${id}:`, error);
                }
                // Remove stale elements (not connected to DOM)
                const aliveElements = new Set();
                containerSet.forEach(el => {
                    if (el.isConnected) {
                        this.drawMacrospc(id, el);
                        aliveElements.add(el);
                    }
                });
                this.macrospcContainers.set(id, aliveElements);
            }
        });
    }
    /**
     * Triggers a refresh of all markdown views.
     */
    redrawAllMacrocalc() {
        return __awaiter(this, void 0, void 0, function* () {
            this.refreshMarkdownViews();
        });
    }
    /**
     * Refreshes all active markdown views, triggering a re-render.
     */
    refreshMarkdownViews() {
        this.app.workspace.getLeavesOfType("markdown").forEach(leaf => {
            const view = leaf.view;
            if (view.previewMode && typeof view.previewMode.rerender === "function") {
                view.previewMode.rerender(true);
            }
            else {
                leaf.setViewState(leaf.getViewState());
            }
        });
    }
    /**
     * Loads plugin settings.
     */
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }
    /**
     * Saves plugin settings.
     */
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
}

exports.AddToMacrosModal = AddToMacrosModal;
exports.MacrosPlugin = MacrosPlugin;
exports.__awaiter = __awaiter;
exports.findMatchingFoodFile = findMatchingFoodFile;
exports.parseGrams = parseGrams;
exports.processNutritionalData = processNutritionalData;
//# sourceMappingURL=main-01eadc4f.js.map
