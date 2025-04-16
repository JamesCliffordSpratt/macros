'use strict';

var main = require('./main-01eadc4f.js');
require('obsidian');

/*
 * Markdown Processors for Macros Plugin
 * ------------------------------------------------
 * Registers custom markdown processors that dynamically render nutritional data.
 * Processors include:
 *  - 'macros': Renders editable macros blocks for food items and meals.
 *  - 'macrospc': Draws pie charts representing the macronutrient breakdown.
 *  - 'macroscalc': Aggregates nutritional data and displays detailed calculations.
 */
function registerProcessors(plugin) {
    /**
     * Macros Processor
     * ----------------
     * Registers a markdown code block processor for rendering and editing a macros block.
     *
     * Expected Input:
     * - The first line should specify an "id:" declaration.
     * - The remaining lines contain macro definitions.
     */
    plugin.registerMarkdownCodeBlockProcessor('macros', (source, el) => main.__awaiter(this, void 0, void 0, function* () {
        // Split, trim, and get the id value from the first line.
        let lines = source.split("\n").map(l => l.trim()).filter(l => l !== '');
        let id = null;
        if (lines.length && /^id:\s*(\S+)/i.test(lines[0])) {
            const match = lines[0].match(/^id:\s*(\S+)/i);
            if (match) {
                id = match[1];
                lines.shift();
            }
        }
        if (id) {
            // Store only non-bullet point lines in the global macro tables
            const nonBulletLines = lines.filter(l => !l.startsWith('-'));
            plugin.macroTables.set(id, nonBulletLines);
        }
        // refreshTable re-renders the macros table from the file.
        const refreshTable = () => main.__awaiter(this, void 0, void 0, function* () {
            const activeFile = plugin.app.workspace.getActiveFile();
            if (!activeFile || !id)
                return;
            try {
                const content = yield plugin.app.vault.read(activeFile);
                // Helper function to escape special regex characters in the id.
                function escapeRegExp(str) {
                    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                }
                const escapedId = escapeRegExp(id);
                const regex = new RegExp("```\\s*macros\\s+id:\\s*" + escapedId + "\\s*\\n([\\s\\S]*?)```", "m");
                const match = content.match(regex);
                if (!match)
                    return;
                // Include all lines for display (including bullet points)
                let allLines = match[1].split("\n").map(l => l.trim()).filter(l => l !== '');
                renderTableFromLines(allLines);
            }
            catch (error) {
                console.error('Error refreshing table:', error);
            }
        });
        const renderTableFromLines = (lines) => {
            el.empty();
            const table = el.createEl('table');
            table.style.width = '100%';
            // Add a row with a "+" button.
            const plusRow = table.insertRow();
            const plusCell = plusRow.insertCell();
            plusCell.colSpan = 6;
            plusCell.style.textAlign = 'right';
            const plusBtn = plusCell.createEl('button', { text: '+' });
            plusBtn.style.fontSize = '1.2em';
            plusBtn.style.cursor = 'pointer';
            plusBtn.onclick = () => {
                new main.AddToMacrosModal(plugin.app, plugin, id, () => main.__awaiter(this, void 0, void 0, function* () {
                    yield plugin.updateMacrosCodeBlock();
                    yield refreshTable();
                })).open();
            };
            const groups = [];
            const otherGroup = {
                name: 'Other Items',
                count: 1,
                rows: [],
                total: { calories: 0, protein: 0, fat: 0, carbs: 0 },
            };
            function processItem(foodQuery, specifiedQuantity) {
                const matchingFile = main.findMatchingFoodFile(plugin.getFilesInFolder(plugin.settings.storageFolder), foodQuery);
                if (!matchingFile)
                    return null;
                const nutrition = main.processNutritionalData(plugin.app, matchingFile, specifiedQuantity);
                if (!nutrition)
                    return null;
                return {
                    name: nutrition.name,
                    serving: nutrition.serving,
                    calories: nutrition.calories,
                    protein: nutrition.protein,
                    fat: nutrition.fat,
                    carbs: nutrition.carbs,
                    macroLine: foodQuery + (specifiedQuantity ? ':' + specifiedQuantity + 'g' : '')
                };
            }
            lines.forEach(line => {
                if (line.toLowerCase().startsWith('meal:')) {
                    // Extract the meal name and potential count information
                    const fullMealText = line.substring(5).trim();
                    let mealName = fullMealText;
                    let count = 1;
                    // Check if there's a count indicator
                    const countMatch = fullMealText.match(/^(.*)\s+×\s+(\d+)$/);
                    if (countMatch) {
                        mealName = countMatch[1];
                        count = parseInt(countMatch[2]);
                    }
                    // Use MealTemplate type for meal comparison.
                    const meal = plugin.settings.mealTemplates.find(m => m.name.toLowerCase() === mealName.toLowerCase());
                    if (!meal)
                        return;
                    const group = {
                        name: mealName,
                        count: count,
                        rows: [],
                        total: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                        macroLine: line
                    };
                    meal.items.forEach((item) => {
                        let foodQuery = item;
                        let specifiedQuantity = null;
                        if (item.includes(':')) {
                            const parts = item.split(':').map(s => s.trim());
                            foodQuery = parts[0];
                            specifiedQuantity = main.parseGrams(parts[1]);
                            // Multiply by count if there's a multiplier
                            if (count > 1 && specifiedQuantity !== null) {
                                specifiedQuantity = specifiedQuantity * count;
                            }
                        }
                        const row = processItem(foodQuery, specifiedQuantity);
                        if (row) {
                            row.macroLine = item;
                            group.rows.push(row);
                            group.total.calories += row.calories;
                            group.total.protein += row.protein;
                            group.total.fat += row.fat;
                            group.total.carbs += row.carbs;
                        }
                    });
                    groups.push(group);
                }
                else if (line.startsWith('-')) {
                    // Skip bullet points as they're just visual representations
                    return;
                }
                else {
                    let foodQuery = line;
                    let specifiedQuantity = null;
                    if (line.includes(':')) {
                        const parts = line.split(':').map(s => s.trim());
                        foodQuery = parts[0];
                        specifiedQuantity = main.parseGrams(parts[1]);
                    }
                    const row = processItem(foodQuery, specifiedQuantity);
                    if (row) {
                        row.macroLine = line;
                        otherGroup.rows.push(row);
                        otherGroup.total.calories += row.calories;
                        otherGroup.total.protein += row.protein;
                        otherGroup.total.fat += row.fat;
                        otherGroup.total.carbs += row.carbs;
                    }
                }
            });
            if (otherGroup.rows.length > 0)
                groups.push(otherGroup);
            const multipleGroups = groups.length > 1;
            groups.forEach(group => {
                const headerRow = table.insertRow();
                const headerCell = headerRow.insertCell();
                headerCell.colSpan = 6;
                headerCell.style.fontWeight = 'bold';
                // Add quantity indicator in the header if count > 1
                if (group.count > 1) {
                    headerCell.innerText = `${group.name} × ${group.count}`;
                }
                else {
                    headerCell.innerText = group.name;
                }
                if (group.macroLine) {
                    const removeBtn = headerCell.createEl('button', { text: ' –' });
                    removeBtn.style.marginLeft = '8px';
                    removeBtn.onclick = () => main.__awaiter(this, void 0, void 0, function* () {
                        yield removeMacroLine(group.macroLine);
                    });
                }
                const colHeaderRow = table.insertRow();
                ['Food', 'Quantity', 'Calories', 'Protein', 'Fat', 'Carbs'].forEach((text) => {
                    const cell = colHeaderRow.insertCell();
                    cell.innerText = text;
                    cell.style.fontWeight = 'bold';
                });
                group.rows.forEach((row) => {
                    const r = table.insertRow();
                    const nameCell = r.insertCell();
                    nameCell.innerText = row.name;
                    if (!group.macroLine) {
                        const removeBtn = nameCell.createEl('button', { text: ' –' });
                        removeBtn.style.marginLeft = '5px';
                        removeBtn.onclick = () => main.__awaiter(this, void 0, void 0, function* () {
                            yield removeMacroLine(row.macroLine);
                        });
                    }
                    r.insertCell().innerText = row.serving;
                    r.insertCell().innerText = row.calories.toFixed(2);
                    r.insertCell().innerText = row.protein.toFixed(2);
                    r.insertCell().innerText = row.fat.toFixed(2);
                    r.insertCell().innerText = row.carbs.toFixed(2);
                });
                if (!multipleGroups) {
                    const totalRow = table.insertRow();
                    totalRow.insertCell().innerText = 'Totals';
                    totalRow.insertCell().innerText = '';
                    totalRow.insertCell().innerText = group.total.calories.toFixed(2);
                    totalRow.insertCell().innerText = group.total.protein.toFixed(2);
                    totalRow.insertCell().innerText = group.total.fat.toFixed(2);
                    totalRow.insertCell().innerText = group.total.carbs.toFixed(2);
                }
            });
            if (groups.length > 1) {
                let combinedTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
                groups.forEach(g => {
                    combinedTotals.calories += g.total.calories;
                    combinedTotals.protein += g.total.protein;
                    combinedTotals.fat += g.total.fat;
                    combinedTotals.carbs += g.total.carbs;
                });
                const combinedHeaderRow = table.insertRow();
                const combinedHeaderCell = combinedHeaderRow.insertCell();
                combinedHeaderCell.colSpan = 6;
                combinedHeaderCell.innerText = 'Combined Totals';
                combinedHeaderCell.style.fontWeight = 'bold';
                const combinedTotalsRow = table.insertRow();
                combinedTotalsRow.insertCell().innerText = 'Totals';
                combinedTotalsRow.insertCell().innerText = '';
                combinedTotalsRow.insertCell().innerText = combinedTotals.calories.toFixed(2);
                combinedTotalsRow.insertCell().innerText = combinedTotals.protein.toFixed(2);
                combinedTotalsRow.insertCell().innerText = combinedTotals.fat.toFixed(2);
                combinedTotalsRow.insertCell().innerText = combinedTotals.carbs.toFixed(2);
            }
            const removeMacroLine = (macroLine) => main.__awaiter(this, void 0, void 0, function* () {
                const activeFile = plugin.app.workspace.getActiveFile();
                if (!activeFile)
                    return;
                try {
                    let content = yield plugin.app.vault.read(activeFile);
                    if (!id)
                        return;
                    const regex = new RegExp("```macros\\s+id:\\s*" + id + "\\s*([\\s\\S]*?)```", "m");
                    const match = content.match(regex);
                    if (!match)
                        return;
                    let blockLines = match[1].split("\n").map(l => l.trim());
                    // Updated removal logic: if removing a meal, skip the meal header and all immediately following lines starting with "-"
                    let newBlockLines = [];
                    if (macroLine.toLowerCase().startsWith("meal:")) {
                        const index = blockLines.findIndex(l => l === macroLine);
                        if (index === -1)
                            return;
                        // Keep lines before the meal header.
                        newBlockLines = blockLines.slice(0, index);
                        // Skip all subsequent lines that are food items (start with "-")
                        let j = index + 1;
                        while (j < blockLines.length && blockLines[j].startsWith("-")) {
                            j++;
                        }
                        // Append remaining lines.
                        newBlockLines = newBlockLines.concat(blockLines.slice(j));
                    }
                    else {
                        newBlockLines = blockLines.filter(line => line !== macroLine);
                    }
                    const newBlock = "```macros\nid: " + id + "\n" + newBlockLines.join("\n") + "\n```";
                    content = content.replace(regex, newBlock);
                    yield plugin.app.vault.modify(activeFile, content);
                    // This is the key change - now we're properly filtering out bullet points 
                    plugin.updateGlobalMacroTableFromContent(content);
                    yield refreshTable();
                    yield plugin.redrawAllMacrospc();
                    yield plugin.redrawAllMacrocalc();
                }
                catch (error) {
                    console.error("Error removing macro line:", error);
                }
            });
            el.appendChild(table);
        };
        yield refreshTable();
    }));
    /**
     * MacrosPC Processor
     * ------------------
     * Registers a markdown code block processor for rendering a pie chart (macrospc) that visualizes the
     * distribution of macronutrients based on a macros table.
     *
     * Expected Input:
     * - The code block should provide an "id:" or "ids:" declaration.
     */
    plugin.registerMarkdownCodeBlockProcessor('macrospc', (source, el) => main.__awaiter(this, void 0, void 0, function* () {
        let lines = source.split("\n").map(l => l.trim()).filter(l => l !== '');
        let ids = [];
        if (lines.length && /^ids:\s*(.+)/i.test(lines[0])) {
            const match = lines[0].match(/^ids:\s*(.+)/i);
            if (match) {
                ids = match[1].split(",").map(s => s.trim()).filter(s => s.length > 0);
            }
        }
        else if (lines.length && /^id:\s*(\S+)/i.test(lines[0])) {
            const match = lines[0].match(/^id:\s*(\S+)/i);
            if (match) {
                ids.push(match[1]);
            }
        }
        el.empty();
        if (ids.length === 0) {
            el.createEl('div', { text: 'No id(s) provided in macrospc block' });
            return;
        }
        // For each id, load external macros if not cached.
        for (const id of ids) {
            if (!plugin.macroTables.has(id)) {
                const loaded = yield plugin.loadMacroTableFromVault(id);
                if (loaded) {
                    plugin.macroTables.set(id, loaded);
                }
                else {
                    el.createEl('div', { text: `Warning: Table with id "${id}" not found.` });
                }
            }
        }
        if (ids.length === 1) {
            const id = ids[0];
            if (!plugin.macrospcContainers.has(id)) {
                plugin.macrospcContainers.set(id, new Set());
            }
            plugin.macrospcContainers.get(id).add(el);
            plugin.drawMacrospc(id, el);
        }
        else {
            plugin.drawCombinedMacrospc(ids, el);
        }
    }));
    /**
     * MacrosCalc Processor
     * --------------------
     * Registers a markdown code block processor for calculating and displaying aggregated nutritional data.
     *
     * Expected Input:
     * - The code block should include a line specifying table IDs using "ids:".
     */
    plugin.registerMarkdownCodeBlockProcessor('macroscalc', (source, el) => main.__awaiter(this, void 0, void 0, function* () {
        let lines = source.split("\n").map(l => l.trim()).filter(l => l !== '');
        if (lines.length === 0) {
            el.createEl('div', { text: 'Error: No content provided in macroscalc block.' });
            return;
        }
        let idsLine = lines.find(line => line.toLowerCase().startsWith("ids:"));
        if (!idsLine) {
            el.createEl('div', { text: 'Error: Please specify table IDs using "ids:"' });
            return;
        }
        idsLine = idsLine.substring(4).trim();
        const ids = idsLine.split(",").map(s => s.trim()).filter(s => s.length > 0);
        if (ids.length === 0) {
            el.createEl('div', { text: 'Error: No table IDs provided.' });
            return;
        }
        // For each id, load its table if not cached.
        for (const id of ids) {
            if (!plugin.macroTables.has(id)) {
                const tableLines = yield plugin.loadMacroTableFromVault(id);
                if (tableLines) {
                    plugin.macroTables.set(id, tableLines);
                }
            }
        }
        let aggregate = { calories: 0, protein: 0, fat: 0, carbs: 0 };
        const breakdown = [];
        function processFoodItem(foodQuery, specifiedQuantity) {
            const matchingFile = main.findMatchingFoodFile(plugin.getFilesInFolder(plugin.settings.storageFolder), foodQuery);
            if (!matchingFile)
                return { calories: 0, protein: 0, fat: 0, carbs: 0 };
            const nutrition = main.processNutritionalData(plugin.app, matchingFile, specifiedQuantity);
            return nutrition || { calories: 0, protein: 0, fat: 0, carbs: 0 };
        }
        for (const id of ids) {
            let total = { calories: 0, protein: 0, fat: 0, carbs: 0 };
            const tableLines = plugin.macroTables.get(id);
            if (!tableLines)
                continue;
            for (const line of tableLines) {
                if (line.toLowerCase().startsWith("meal:")) {
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
                    const meal = plugin.settings.mealTemplates.find(m => m.name.toLowerCase() === mealName.toLowerCase());
                    if (!meal)
                        continue;
                    // Process each food item in the meal template
                    for (const item of meal.items) {
                        let foodQuery = item;
                        let specifiedQuantity = null;
                        if (item.includes(':')) {
                            const parts = item.split(':').map(s => s.trim());
                            foodQuery = parts[0];
                            specifiedQuantity = main.parseGrams(parts[1]);
                            // Apply multiplier if count > 1
                            if (count > 1 && specifiedQuantity !== null) {
                                specifiedQuantity = specifiedQuantity * count;
                            }
                        }
                        const result = processFoodItem(foodQuery, specifiedQuantity);
                        total.calories += result.calories;
                        total.protein += result.protein;
                        total.fat += result.fat;
                        total.carbs += result.carbs;
                    }
                }
                else if (!line.startsWith('-')) {
                    let foodQuery = line;
                    let specifiedQuantity = null;
                    if (line.includes(':')) {
                        const parts = line.split(':').map(s => s.trim());
                        foodQuery = parts[0];
                        specifiedQuantity = main.parseGrams(parts[1]);
                    }
                    const result = processFoodItem(foodQuery, specifiedQuantity);
                    total.calories += result.calories;
                    total.protein += result.protein;
                    total.fat += result.fat;
                    total.carbs += result.carbs;
                }
            }
            breakdown.push({ id, totals: total });
            aggregate.calories += total.calories;
            aggregate.protein += total.protein;
            aggregate.fat += total.fat;
            aggregate.carbs += total.carbs;
        }
        const table = el.createEl('table');
        table.style.width = '100%';
        const headerRow = table.insertRow();
        ['Table ID', 'Calories', 'Protein', 'Fat', 'Carbs'].forEach(text => {
            const cell = headerRow.insertCell();
            cell.innerText = text;
            cell.style.fontWeight = 'bold';
        });
        breakdown.forEach(item => {
            const row = table.insertRow();
            row.insertCell().innerText = item.id;
            row.insertCell().innerText = item.totals.calories.toFixed(2);
            row.insertCell().innerText = item.totals.protein.toFixed(2);
            row.insertCell().innerText = item.totals.fat.toFixed(2);
            row.insertCell().innerText = item.totals.carbs.toFixed(2);
        });
        const aggregateRow = table.insertRow();
        aggregateRow.insertCell().innerText = 'Aggregate Totals';
        aggregateRow.insertCell().innerText = aggregate.calories.toFixed(2);
        aggregateRow.insertCell().innerText = aggregate.protein.toFixed(2);
        aggregateRow.insertCell().innerText = aggregate.fat.toFixed(2);
        aggregateRow.insertCell().innerText = aggregate.carbs.toFixed(2);
        el.appendChild(table);
    }));
}

exports.registerProcessors = registerProcessors;
//# sourceMappingURL=processors-a5b3eb92.js.map
