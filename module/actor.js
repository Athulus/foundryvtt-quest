import { EntitySheetHelper } from "./helper.js";

/**
 * Extend the base Actor document to support attributes and groups with a custom template creation dialog.
 * @extends {Actor}
 */
export class QuestActor extends Actor {
    /** @inheritdoc */
    prepareDerivedData() {
        super.prepareDerivedData();
        this.data.data.groups = this.data.data.groups || {};
        this.data.data.attributes = this.data.data.attributes || {};
    }

    prepareData() {
        super.prepareData();
        const actorData = this.data;

        if (actorData.type == "character") {
            this._prepareCharacterData(this.data);
        } else if (actorData.type == "npc") {
            this._prepareNPCData(this.data);
        }

        return this.data;
    }

    _prepareCharacterData(actorData) {
        actorData.data.itemTypes = this.itemTypes;

        // Set abilities into paths
        let abilities = this.itemTypes.ability;

        let paths = {};
        for (let ability of abilities) {
            //console.log(ability.data.data.path);
            if (!!paths[ability.data.data.path] == false)
                paths[ability.data.data.path] = [];
            paths[ability.data.data.path].push(ability);
        }
        actorData.data.abilityTypes = paths;
        //console.log(actorData);
        return actorData;
        //mergeObject(actorData.data, this.itemTypes)
    }

    _prepareNPCData(actorData) {
        actorData.data.itemTypes = this.itemTypes;
        return actorData;
        //mergeObject(actorData.data, this.itemTypes)
    }

    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);
        //this.data.update({name: "Some other name"});
        //Create Abilities using localization
        if (data.type === "npc" && this.itemTypes.detail.length <= 0) {
            //Setup Abilities
            const details = [];
            let create_detail = [
                "what do they look like? (body / face / vibe)",
                "occupation / organizations",
                "special features / ideal / flaw",
                "what's something that they want?",
                "what is a problem that they have?",
                "what's something useful that they know?",
                "who are their friends?",
                "who are their adversaries?",
                "what's their biggest secret?",
                "what valuable things do they own?"
            ];

            if (Object(create_detail).length > 0) {
                for (let i of create_detail) {
                    details.push({
                        name: i,
                        type: "detail"
                    });
                }
                this.data.update({ items: details });
            }
        }
    }

    /* -------------------------------------------- */

    /** @override */
    //static async createDialog(data={}, options={}) {
    //  return EntitySheetHelper.createDialog.call(this, data, options);
    // }

    /* -------------------------------------------- */
    /*  Roll Data Preparation                       */
    /* -------------------------------------------- */

    /** @inheritdoc */
    getRollData() {
        // Copy the actor's system data
        const data = this.toObject(false).data;
        const shorthand = game.settings.get(
            "foundryvtt-quest",
            "macroShorthand"
        );
        const formulaAttributes = [];
        const itemAttributes = [];

        // Handle formula attributes when the short syntax is disabled.
        this._applyShorthand(data, formulaAttributes, shorthand);

        // Map all items data using their slugified names
        this._applyItems(data, itemAttributes, shorthand);

        // Evaluate formula replacements on items.
        this._applyItemsFormulaReplacements(data, itemAttributes, shorthand);

        // Evaluate formula attributes after all other attributes have been handled, including items.
        this._applyFormulaReplacements(data, formulaAttributes, shorthand);

        // Remove the attributes if necessary.
        if (!!shorthand) {
            delete data.attributes;
            delete data.attr;
            delete data.abil;
            delete data.groups;
        }
        return data;
    }

    /* -------------------------------------------- */

    /**
     * Apply shorthand syntax to actor roll data.
     * @param {Object} data The actor's data object.
     * @param {Array} formulaAttributes Array of attributes that are derived formulas.
     * @param {Boolean} shorthand Whether or not the shorthand syntax is used.
     */
    _applyShorthand(data, formulaAttributes, shorthand) {
        // Handle formula attributes when the short syntax is disabled.
        for (let [k, v] of Object.entries(data.attributes || {})) {
            // Make an array of formula attributes for later reference.
            if (v.dtype === "Formula") formulaAttributes.push(k);
            // Add shortened version of the attributes.
            if (!!shorthand) {
                if (!(k in data)) {
                    // Non-grouped attributes.
                    if (v.dtype) {
                        data[k] = v.value;
                    }
                    // Grouped attributes.
                    else {
                        data[k] = {};
                        for (let [gk, gv] of Object.entries(v)) {
                            data[k][gk] = gv.value;
                            if (gv.dtype === "Formula")
                                formulaAttributes.push(`${k}.${gk}`);
                        }
                    }
                }
            }
        }
    }

    /* -------------------------------------------- */

    /**
     * Add items to the actor roll data object. Handles regular and shorthand
     * syntax, and calculates derived formula attributes on the items.
     * @param {Object} data The actor's data object.
     * @param {string[]} itemAttributes
     * @param {Boolean} shorthand Whether or not the shorthand syntax is used.
     */
    _applyItems(data, itemAttributes, shorthand) {
        // Map all items data using their slugified names
        data.items = this.items.reduce((obj, item) => {
            const key = item.name.slugify({ strict: true });
            const itemData = item.toObject(false).data;

            // Add items to shorthand and note which ones are formula attributes.
            for (let [k, v] of Object.entries(itemData.attributes)) {
                // When building the attribute list, prepend the item name for later use.
                if (v.dtype === "Formula") itemAttributes.push(`${key}..${k}`);
                // Add shortened version of the attributes.
                if (!!shorthand) {
                    if (!(k in itemData)) {
                        // Non-grouped item attributes.
                        if (v.dtype) {
                            itemData[k] = v.value;
                        }
                        // Grouped item attributes.
                        else {
                            if (!itemData[k]) itemData[k] = {};
                            for (let [gk, gv] of Object.entries(v)) {
                                itemData[k][gk] = gv.value;
                                if (gv.dtype === "Formula")
                                    itemAttributes.push(`${key}..${k}.${gk}`);
                            }
                        }
                    }
                }
                // Handle non-shorthand version of grouped attributes.
                else {
                    if (!v.dtype) {
                        if (!itemData[k]) itemData[k] = {};
                        for (let [gk, gv] of Object.entries(v)) {
                            itemData[k][gk] = gv.value;
                            if (gv.dtype === "Formula")
                                itemAttributes.push(`${key}..${k}.${gk}`);
                        }
                    }
                }
            }

            // Delete the original attributes key if using the shorthand syntax.
            if (!!shorthand) {
                delete itemData.attributes;
            }
            obj[key] = itemData;
            return obj;
        }, {});
    }

    /* -------------------------------------------- */

    _applyItemsFormulaReplacements(data, itemAttributes, shorthand) {
        for (let k of itemAttributes) {
            // Get the item name and separate the key.
            let item = null;
            let itemKey = k.split("..");
            item = itemKey[0];
            k = itemKey[1];

            // Handle group keys.
            let gk = null;
            if (k.includes(".")) {
                let attrKey = k.split(".");
                k = attrKey[0];
                gk = attrKey[1];
            }

            let formula = "";
            if (!!shorthand) {
                // Handle grouped attributes first.
                if (data.items[item][k][gk]) {
                    formula = data.items[item][k][gk].replace(
                        "@item.",
                        `@items.${item}.`
                    );
                    data.items[item][k][gk] = Roll.replaceFormulaData(
                        formula,
                        data
                    );
                }
                // Handle non-grouped attributes.
                else if (data.items[item][k]) {
                    formula = data.items[item][k].replace(
                        "@item.",
                        `@items.${item}.`
                    );
                    data.items[item][k] = Roll.replaceFormulaData(
                        formula,
                        data
                    );
                }
            } else {
                // Handle grouped attributes first.
                if (data.items[item]["attributes"][k][gk]) {
                    formula = data.items[item]["attributes"][k][gk][
                        "value"
                    ].replace("@item.", `@items.${item}.attributes.`);
                    data.items[item]["attributes"][k][gk]["value"] =
                        Roll.replaceFormulaData(formula, data);
                }
                // Handle non-grouped attributes.
                else if (data.items[item]["attributes"][k]["value"]) {
                    formula = data.items[item]["attributes"][k][
                        "value"
                    ].replace("@item.", `@items.${item}.attributes.`);
                    data.items[item]["attributes"][k]["value"] =
                        Roll.replaceFormulaData(formula, data);
                }
            }
        }
    }

    /* -------------------------------------------- */

    /**
     * Apply replacements for derived formula attributes.
     * @param {Object} data The actor's data object.
     * @param {Array} formulaAttributes Array of attributes that are derived formulas.
     * @param {Boolean} shorthand Whether or not the shorthand syntax is used.
     */
    _applyFormulaReplacements(data, formulaAttributes, shorthand) {
        // Evaluate formula attributes after all other attributes have been handled, including items.
        for (let k of formulaAttributes) {
            // Grouped attributes are included as `group.attr`, so we need to split them into new keys.
            let attr = null;
            if (k.includes(".")) {
                let attrKey = k.split(".");
                k = attrKey[0];
                attr = attrKey[1];
            }
            // Non-grouped attributes.
            if (data.attributes[k]?.value) {
                data.attributes[k].value = Roll.replaceFormulaData(
                    data.attributes[k].value,
                    data
                );
            }
            // Grouped attributes.
            else if (attr) {
                data.attributes[k][attr].value = Roll.replaceFormulaData(
                    data.attributes[k][attr].value,
                    data
                );
            }

            // Duplicate values to shorthand.
            if (!!shorthand) {
                // Non-grouped attributes.
                if (data.attributes[k]?.value) {
                    data[k] = data.attributes[k].value;
                }
                // Grouped attributes.
                else {
                    if (attr) {
                        // Initialize a group key in case it doesn't exist.
                        if (!data[k]) {
                            data[k] = {};
                        }
                        data[k][attr] = data.attributes[k][attr].value;
                    }
                }
            }
        }
    }
}
