/**
 * Celestial Fox Map Editor Addon
 * (intentionally single file with only with tsconfig and typehints)
 */

(async () => {
    //#region constants
    const Constants = Object.freeze({
        MOD_ID: "CFME",
        MOD_NAME: "CFMapEditor",
        MOD_FULL_NAME: "Celestial Fox Map Editor",
        MOD_VERSION: "0.0.1",
        MOD_REPOSITORY: "https://github.com/tenjou-no-kitsune/cfme",
        MOD_CMD_TAG: "cfme",
        MSG_TIMEOUTS: {
            LOCAL_INFO: 5000,
            LOCAL_HINT: 2500,
        },
        HOOK_PRIORITY: {
            HIGH: 1000,
        },
    });
    //#endregion

    //#region log
    const Log = (() => {
        /**
         * @typedef {"debug" | "info" | "warn" | "error"} LogLevel
         * @typedef {Readonly<{
         *  date: Date;
         *  level: LogLevel;
         *  args: any[];
         * }>} LogEntry
         */

        /** @type {LogEntry[]} */
        const entries = [];

        /**
         * 
         * @param {LogLevel} level 
         * @param  {...any} args 
         */
        const writeEntry = (level, ...args) => {
            console[level](`[${Constants.MOD_ID}]:`, ...args);
            entries.push({ date: new Date(), level, args });
        }

        /** @type {(level: LogLevel) => (...args: any[]) => void} */
        const createLogFunc = (level) => (...args) => writeEntry(level, ...args);

        return {
            debug: createLogFunc("debug"),
            info: createLogFunc("info"),
            warn: createLogFunc("warn"),
            error: createLogFunc("error"),
            get entries() { return entries; },
        };
    })();
    //#endregion

    //#region utils
    const Utils = (() => {
        const Common = (() => ({
            Text: {
                /** @param {string} text */
                toKebabCase: (text) => text.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`).replace(/^-/, ""),
            },
            Async: (() => {
                /** @param {number} ms */
                const wait = (ms) => new Promise((res) => setTimeout(res, ms));
                return {
                    wait,
                    /** @param {() => boolean} predicate @param {() => boolean} cancel */
                    waitFor: async (predicate, cancel = () => false) => {
                        while (!predicate()) {
                            if (cancel()) return false;
                            await wait(100);
                        }
                        return true;
                    },
                };
            })(),
        }))();

        const BC = (() => {
            /**
             * @typedef {{
             *  title: string;
             *  sections: string[];
             * }} TemplateOptions
             * @param {TemplateOptions} opts
             */
            const templateText = ({ title, sections }) => {
                return `<b>${Constants.MOD_NAME} ${title}</b>${sections.map(s => `<br/>${s}`).join("")}`;
            }

            /**
             * @typedef {keyof typeof Constants.MSG_TIMEOUTS} MsgTimeoutType
             * @param {MsgTimeoutType} type
             * @param {string} msg
             */
            const sendLocal = (type, msg) => ChatRoomSendLocal(msg, Constants.MSG_TIMEOUTS[type]);
            /** @param {MsgTimeoutType} type @returns {(msg: string) => void} */
            const createSendFunc = (type) => (msg) => sendLocal(type, msg);

            /** @param {string} title */
            const createSendHelper = (title) => {
                /** @param {MsgTimeoutType} type @param {string[]} msgs */
                const send = (type, ...msgs) => sendLocal(
                    type,
                    templateText({
                        title,
                        sections: msgs,
                    }),
                );

                /** @param {MsgTimeoutType} type @returns {(...msgs: string[]) => void} */
                const createSendFunc = (type) => (...msgs) => send(type, ...msgs);

                return {
                    info: createSendFunc("LOCAL_INFO"),
                    hint: createSendFunc("LOCAL_HINT"),
                };
            };
            return {
                templateText,
                sendInfo: createSendFunc("LOCAL_INFO"),
                sendHint: createSendFunc("LOCAL_HINT"),
                createSendHelper,
            };
        })();

        const DOM = (() => {
            return {
                CSS: (() => {
                    /**
                     * @typedef {{
                     *  title: string;
                     *  classes: Record<string, Partial<CSSStyleDeclaration>>;
                     * }} CSSStyleMeta
                     */

                    /** @type {Record<string, CSSStyleSheet>} */
                    const styles = {};

                    return {
                        /** @param {CSSStyleMeta} meta */
                        load: (meta) => {
                            if (meta.title in styles) {
                                Log.warn(`style(${meta.title}) already exists, loading is skipped`);
                                return;
                            }
                            const sheet = new CSSStyleSheet();
                            Object.entries(meta.classes).forEach(([className, styles]) => {
                                const ruleBody = Object.entries(styles)
                                  .map(([prop, val]) => `${Utils.Common.Text.toKebabCase(prop)}: ${val}`)
                                  .join('; ');
                                sheet.insertRule(`.${className} { ${ruleBody} }`);
                            });
                            document.adoptedStyleSheets.push(styles[meta.title] = sheet);
                        },
                        /** @param {string} title of loaded style */
                        unload: (title) => {
                            if (!(title in styles)) {
                                Log.warn(`style(${title}) cannot be found, unloading is skipped`);
                                return;
                            }
                            document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== styles[title]);
                            delete styles[title];
                        },
                    };
                })(),
            };
        })();

        return { Common, BC, DOM };
    })();
    //#endregion

    //#region pre-req
    if (window[Constants.MOD_ID]) {
        Log.info("loading skipped, already loaded");
        return;
    }

    const Loaders = {
        /** @type {() => Promise<import("bondage-club-mod-sdk/dist/bcmodsdk").ModSDKGlobalAPI>} */
        bcModSdk: async () => {
            if (window["bcModSdk"]) return window["bcModSdk"];
            Log.info("bcModSdk not found, attempting to load");
            return await new Promise((res, rej) => {
                const script = document.createElement("script");
                script.src = "https://jomshir98.github.io/bondage-club-mod-sdk/bcmodsdk.js";
                script.onload = () => res(window["bcModSdk"]);
                script.onerror = () => rej(new Error(`failed to load bcModSdk`));
                document.head.appendChild(script);
            });
        },
    };

    try {
        var sdkAPI = await Loaders.bcModSdk();
        Log.info("bcModSdk loaded successfully");
    } catch (err) {
        /** @type {Error} */
        const error = err;
        Log.error(error.message);
        return;
    }

    Log.info("waiting for server connection");
    await Utils.Common.Async.waitFor(() => !!ServerIsConnected && !!ServerSocket);
    //#endregion

    //#region module
    const Module = (() => {
        /**
         * @typedef {{
         *  addCleanup: (cleanupFunc: () => void) => void;
         * }} ModuleContext
         */

        /**
         * @template {object} T
         * @typedef {{
         *  name: string;
         *  run: (ctx: ModuleContext) => void;
         *  unload: () => void;
         * } & T} ModuleMeta<T>
         */

        /**
         * @template {object} T
         * @typedef {{
         *  run: () => void;
         *  unload: () => void;
         * } & T} Module<T>
         */

        return {
            /**
             * @template {object} T
             * @param {ModuleMeta<T>} meta
             * @returns {Module<T>}
             */
            create: ({ name, run, unload, ...additional }) => {
                /** @type {(() => void)[]} */
                const cleanups = [];
                /** @type {ModuleContext} */
                let ctx = { addCleanup: (func) => cleanups.push(func) };

                return /** @type {any} */ ({
                    run: () => {
                        run(ctx)
                        Log.info(`module(${name}) loaded!`);
                    },
                    unload: () => {
                        cleanups.forEach(cleanup => cleanup());
                        unload();
                        Log.info(`module(${name}) unloaded!`);
                    },
                    ...additional,
                });
            },
        };
    })();
    //#endregion

    //#region manager
    const Manager = (() => {

        /**
         * @typedef {{
         *  manager: typeof Manager;
         *  log: typeof Log,
         *  sdk: typeof SDK;
         * }} CFME
         */

        const modules = {
            //#region commands
            commands: Module.create((() => {
                const send = Utils.BC.createSendHelper("Commands");

                /** 
                 * @typedef {{
                 *  name: string;
                 *  description: string;
                 *  action: () => void;
                 * }} CFMECommand
                 * @type {CFMECommand[]}
                 */
                const commands = [
                    {
                        name: "unload",
                        description: `unloads ${Constants.MOD_NAME}`,
                        action: () => managerAPI.unload(),
                    },
                    {
                        name: "open",
                        description: `opens the map editor`,
                        action: () => {
                            if (!modules.map.editor.canUse) return send.hint(
                                `make sure of the following:`,
                                `- you are in map mode`,
                                `- you have permissions to edit the map`
                            );
                            if (modules.map.editor.isOpen) return send.hint(`editor is already open`);
                            modules.map.editor.open()
                        },
                    },
                    {
                        name: "close",
                        description: `closes the map editor`,
                        action: () => {
                            if (!modules.map.editor.isOpen) return send.hint(`editor is already closed`);
                            modules.map.editor.close()
                        },
                    }
                ];

                return {
                    name: "Command",
                    run: () => CommandCombine({
                        Tag: Constants.MOD_CMD_TAG,
                        Description: `: shows command list for ${Constants.MOD_NAME}`,
                        Action: () => send.info(...commands.map(c => `/${Constants.MOD_CMD_TAG} ${c.name}: <i>${c.description}</i>`)),
                        Subcommands: commands.map(cmd => ({
                            Tag: cmd.name,
                            Description: cmd.description,
                            Action: cmd.action,
                        })),
                    }),
                    unload: () => Commands = Commands.filter(c => c.Tag !== Constants.MOD_CMD_TAG),
                };
            })()),
            //#endregion
            //#region map
            map: Module.create((() => {
                /* Map Modes Reference
                [Default: ""]
                EditTile   Button => "TileType"   Mode
                EditObject Button => "ObjectType" Mode
                Light      Button => "Effect"     Mode
                Undo       Button =>  Undo
                Fog        Button =>  Toggle Fog

                ["TileType"]
                MapView    Button => ""           Mode
                EditObject Button => "ObjectType" Mode
                <Dynamically Generated Unique Tile Types> (new Set(ChatRoomMapViewTileList.map(t => t.Type)))
                ...        Type   => "Tile"       Mode w/ Type SubMode

                ["Tile" <SubMode>]
                Edit       Button => "TileType"   Mode
                EditRange  Button =>  Update Brush Thickness
                <Dynamically Generated Tile of SubMode> (ChatRoomMapViewTileList.filter(t => t.Type === SubMode))
                ...        Tile   => ChatRoomMapViewEditObject = CommonCloneDeep(Tile);

                ["ObjectType"]
                MapView    Button => ""           Mode
                EditTile   Button => "TileType"   Mode
                <Dynamically Generated Unique Object Types> (new Set(ChatRoomMapViewObjectList.map(o => o.Type)))
                ...        Type   => "Object"     Mode w/ Type SubMode

                ["Object" <SubMode>]
                Edit       Button => "ObjectType"   Mode
                EditRange  Button =>  Update Brush Thickness
                <Dynamically Generated Object of SubMode> (ChatRoomMapViewObjectList.filter(o => o.Type === SubMode))
                ...        Tile   => ChatRoomMapViewEditObject = CommonCloneDeep(Obj);

                ["Effect"]
                MapView    Button => ""           Mode
                EditRange  Button =>  Update Brush Thickness
                <Dynamically Generated Effect> (ChatRoomMapViewEffectList)
                ...        Effect => ChatRoomMapViewEditObject = CommonCloneDeep(Eff);
                */
                
                /** 
                 * @typedef {typeof ChatRoomMapViewEditMode | "CFME"} CFMEEditMode
                 */
                const Accessors = {
                    /** @type {CFMEEditMode} */
                    get EditMode() { return ChatRoomMapViewEditMode },
                    set EditMode(mode) { ChatRoomMapViewEditMode = /** @type {typeof ChatRoomMapViewEditMode} */ (mode) },
                    get MaxRange() { return ChatRoomMapViewPerceptionRangeMax },
                    set MaxRange(range) {
                        ChatRoomMapViewPerceptionRangeMax = range;
                        if (ChatRoomMapViewPerceptionRange > Accessors.MaxRange)
                            ChatRoomMapViewPerceptionRange = Accessors.MaxRange;
                    },
                    get BrushSize() { return ChatRoomMapViewEditRange },
                    set BrushSize(size) { ChatRoomMapViewEditRange = size },
                    get MoveSpeed() { return ChatRoomMapViewBaseMovementSpeed },
                    set MoveSpeed(speed) { ChatRoomMapViewBaseMovementSpeed = speed },
                    get FogEnabled() { return ChatRoomMapFogIsActive() },
                    set FogEnabled(enabled) {
                        if (enabled) delete ChatRoomData.MapData.Fog;
                        else ChatRoomData.MapData.Fog = false;
                        ChatRoomMapViewUpdateFlag();
                    },
                }

                const CSS_TITLE = "MapEditor";

                //#region editor
                const Editor = (() => {
                    const elements = {
                        /** @type {HTMLElement | null} */
                        get $editor() { return document.querySelector(".cfme-editor") },
                        /** @returns {HTMLElement} */
                        get $header() { return elements.$editor.querySelector(".cfme-editor-header") },
                        /** @returns {HTMLElement} */
                        get $main() { return elements.$editor.querySelector(".cfme-editor-main") },
                        /** @returns {HTMLElement} */
                        get $sidebar() { return elements.$editor.querySelector(".cfme-editor-sidebar") },
                    };

                    /** @typedef {HTMLOptions<"div">["children"]} Elements */

                    
                    //#region settings
                    const settings = {
                        schema: {
                            numericals: [
                                {
                                    name: "Brush Size", min: 1, max: 5,
                                    get value() { return Accessors.BrushSize },
                                    set value(next) { Accessors.BrushSize = next },
                                },
                                {
                                    name: "Max Zoom", min: 7, max: 30,
                                    get value() { return Accessors.MaxRange },
                                    set value(next) { Accessors.MaxRange = next },
                                },
                                {
                                    name: "Move Speed", min: 50, max: 200, step: 50,
                                    get value() { return Accessors.MoveSpeed },
                                    set value(next) { Accessors.MoveSpeed = next },
                                }
                            ],
                            toggles: [
                                {
                                    name: "Fog Enabled",
                                    get value() { return Accessors.FogEnabled },
                                    set value(next) { Accessors.FogEnabled = next },
                                },
                            ],
                        },
                        /** @returns {Elements} */
                        get elements() {
                            return [
                                {
                                    tag: "small",
                                    classList: ["cfme-settings-header"],
                                    children: ["Settings"],
                                },
                                ...(/** @type {Elements} */ (settings.schema.toggles.map(s => ({
                                    tag: "li",
                                    classList: ["cfme-setting-item"],
                                    children: [
                                        { tag: "small", children: [s.name] },
                                        {
                                            tag: "input",
                                            attributes: {
                                                required: true,
                                                type: "checkbox",
                                                checked: s.value,
                                            },
                                            eventListeners: {
                                                change: function() {
                                                    s.value = this.checked;
                                                },
                                            },
                                        },
                                    ],
                                })))),
                                ...(/** @type {Elements} */ (settings.schema.numericals.map(s => ({
                                    tag: "li",
                                    classList: ["cfme-setting-item"],
                                    children: [
                                        { tag: "small", children: [s.name] },
                                        {
                                            tag: "input",
                                            attributes: {
                                                required: true,
                                                type: "number",
                                                value: s.value,
                                                min: s.min,
                                                max: s.max,
                                                step: s.step ?? 1,
                                            },
                                            eventListeners: {
                                                change: function() {
                                                    s.value = parseInt(this.value);
                                                },
                                                blur: function() {
                                                    s.value = parseInt(this.value);
                                                    if (s.value > s.max) s.value = s.max;
                                                    if (s.value < s.min) s.value = s.min;
                                                    this.value = s.value.toString();
                                                }
                                            },
                                        },
                                    ],
                                })))),
                            ];
                        },
                    };
                    //#endregion

                    //#region categories
                    const category = {
                        /** @typedef {"Tile" | "Object" | "Effect"} CFMECategory */
                        /** @type {"None" | CFMECategory} */
                        current: "None",
                        /** @type {CFMECategory[]} */
                        list:  ["Tile", "Object", "Effect"],
                        placeables: {
                            Tile: ChatRoomMapViewTileList,
                            Object: ChatRoomMapViewObjectList,
                            Effect: ChatRoomMapViewEffectList,
                        },
                        /** @returns {Elements} */
                        get elements() {
                            return [
                                {
                                    tag: "small",
                                    classList: ["cfme-categories-header"],
                                    children: ["Categories"],
                                },
                                ...(/** @type {Elements} */ (category.list.map(c => ({
                                    tag: "li",
                                    classList: ["cfme-category-item", ...(c === category.current && ["cfme-selected"] || [])],
                                    innerHTML: `<small>${c}s</small>`,
                                    eventListeners: {
                                        click: function() {
                                            Accessors.EditMode = "";
                                            category.current = (c === category.current) ? "None" : c;
                                            this.parentElement.replaceChildren(...ElementParseChildren(category.elements));
                                            elements.$main.replaceChildren(...ElementParseChildren(main.elements));
                                        },
                                    },
                               })))),
                            ];
                        },
                    };
                    //#endregion

                    //#region selector
                    const main = {
                        /** @typedef {(typeof category.placeables)[CFMECategory]} CFMEPlaceables */
                        $canvas: (() => {
                            const $canvas = document.createElement("canvas");
                            $canvas.height = 50;
                            $canvas.width = 50;
                            return $canvas;
                        })(),
                        transformers: {
                            getImage: {
                                /** @param {ChatRoomMapTile} t */
                                Tile: (t) => `Screens/Online/ChatRoom/MapTile/${t.Type}/${t.Style}.png`,
                                /** @param {ChatRoomMapObject} o */
                                Object: (o) => `Screens/Online/ChatRoom/MapObject/${o.Type}/${o.Style}.png`,
                                /** @param {ChatRoomMapEffect} e */
                                Effect: (e) => {
                                    const ctx = main.$canvas.getContext("2d");
                                    ctx.clearRect(0, 0, 50, 50);
                                    ctx.fillStyle = RgbaArrayToHTMLColor(e.Color);
                                	ctx.fillRect(0, 0, 50, 50);
                                    return main.$canvas.toDataURL();
                                },
                            }
                        },
                        /** @typedef {Pick<CFMEPlaceables[number], keyof CFMEPlaceables[number]>[]} CFMECommonPlaceables */
                        /** @param {HTMLButtonElement} $this @param {CFMECommonPlaceables[number]} placeable @param {CFMECategory} cat */
                        selectPlaceable: ($this, placeable, cat) => {
                            const isSelected = $this.classList.contains(`cfme-placeable-item-selected`);
                            elements.$main.querySelectorAll(".cfme-placeable-item-selected").forEach($e => $e.classList.toggle(`cfme-placeable-item-selected`));
                            if (isSelected) {
                                Accessors.EditMode = "";
                                return;
                            }
                            $this.classList.toggle("cfme-placeable-item-selected");
                            Accessors.EditMode = cat;
                            ChatRoomMapViewEditObject = /** @type {never} */ (CommonCloneDeep(placeable));
                        },
                        /** @param {CFMECommonPlaceables} placeables @param {CFMECategory} cat @returns {Elements[number]} */
                        generatePlaceableGroup: (placeables, cat) => {
                            return {
                                tag: "section",
                                classList: ["cfme-placeable-group"],
                                children: placeables.map(p => ({
                                    tag: "button",
                                    classList: ["button", "cfme-placeable-item"],
                                    style: { "background-image": `url("${main.transformers.getImage[cat](/** @type {never} */ (p))}")` },
                                    eventListeners: { click: function() { main.selectPlaceable(this, p, cat) } },
                                })),
                            };
                        },
                        /** @returns {Elements} */
                        get elements() {
                            if (category.current === "None") return [{
                                tag: "small",
                                children: ["click on a category to view"],
                            }];

                            /** @type {CFMECommonPlaceables} */
                            const placeables = category.placeables[category.current];
                            const subTypes = [...new Set(placeables.map(p => p.Type))];

                            /** @type {Mutable<Elements>} */
                            let elements = [];
                            if (subTypes.length === 1) elements.push(main.generatePlaceableGroup(placeables, category.current));
                            else elements.push(...subTypes.map(sub => /** @type {Elements[number]} */ ({
                                tag: "details", classList: ["cfme-placeable-group-collapsible"], attributes: { open: true, },
                                children: [
                                    { tag: "summary", classList: ["cfme-placeable-group-title"], innerHTML: `<small>${sub}</small>` },
                                    main.generatePlaceableGroup(placeables.filter(p => p.Type === sub), /** @type {CFMECategory} */ (category.current)),
                                ]
                            })));
                            return elements;
                        },
                    };
                    //#endregion

                    //#region map api
                    return {
                        open: () => {
                            if (elements.$editor) return Log.warn("Editor.open: editor is already opened");
                            const $chat = document.getElementById("TextAreaChatLog");
                            if (!$chat) return Log.error("Editor.open: could not find chat ui to bind to");
                            ElementCreate({
                                parent: $chat,
                                tag: "aside",
                                classList: ["cfme-editor"],
                                children: [
                                    {
                                        tag: "header",
                                        classList: ["cfme-editor-header"],
                                        children: [
                                            {
                                                tag: "span", classList: ["cfme-editor-collapse"], innerHTML: "&gt;",
                                                eventListeners: { click: () => elements.$editor.classList.toggle("cfme-collapsed") },
                                            },
                                            Constants.MOD_NAME,
                                        ]
                                    },
                                    {
                                        tag: "div",
                                        classList: ["cfme-editor-body"],
                                        children: [
                                            {
                                                tag: "aside",
                                                classList: ["cfme-editor-sidebar", "cfme-scrollable"],
                                                children: [
                                                    {
                                                        tag: "ul",
                                                        classList: ["cfme-settings"],
                                                        children: settings.elements,
                                                    },
                                                    {
                                                        tag: "ul",
                                                        classList: ["cfme-categories"],
                                                        children: category.elements,
                                                    }
                                                ]
                                            },
                                            {
                                                tag: "main",
                                                classList: ["cfme-editor-main", "cfme-scrollable"],
                                                children: main.elements,
                                            },
                                        ],
                                    },
                                ],
                            });
                        },
                        close: () => {
                            if (!elements.$editor) return Log.warn("Editor.close: editor is not opened");
                            ElementRemove(elements.$editor);
                        },
                        restoreSettings: () => {
                            Accessors.BrushSize = 1;
                            Accessors.EditMode = "";
                            Accessors.MaxRange = 7;
                            Accessors.MoveSpeed = 200;
                        },
                        get canUse() { return ChatRoomPlayerIsAdmin() && ChatRoomActiveView === ChatRoomViews.Map },
                        get isCollapsed() { return elements.$editor.classList.contains("cfme-collapsed") },
                        get isOpen() { return !!elements.$editor },
                    }
                    //#endregion
                })();
                //#endregion

                return {
                    name: "Map",
                    run: (ctx) => {
                        //#region css
                        Utils.DOM.CSS.load({
                            title: CSS_TITLE,
                            classes: {
                                "cfme-editor, .cfme-editor *": { boxSizing: "border-box" },
                                "cfme-editor.cfme-collapsed": { width: "0%" },
                                "cfme-editor": {
                                    overflow: "hidden",
                                    position: "absolute", top: "0", right: "0", bottom: "40%", zIndex: "3",
                                    width: "100%",
                                    display: "flex", flexDirection: "column",
                                    backgroundColor: "#222", color: "gray", border: "1px solid",
                                },
                                "cfme-editor-header": {
                                    display: "flex", alignItems: "center", gap: "4px",
                                    borderBottom: "1px solid", fontSize: "80%",
                                },
                                "cfme-editor-collapse": {
                                    height: "1em", width: "1em", padding: "4px",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    background: "black", borderRight: "1px solid",
                                    cursor: "pointer",
                                },
                                "cfme-collapsed .cfme-editor-collapse": { transform: "scale(-1) translateX(100%)", position: "fixed", border: "1px solid" },
                                "cfme-scrollable": { overflowY: "scroll", scrollbarGutter: "auto" },
                                "cfme-editor-body": { display: "flex", flexGrow: "1", minHeight: "0" },
                                "cfme-editor-sidebar": { borderRight: "1px solid", flexShrink: "0" },
                                "cfme-selected": { color: "white" },
                                "cfme-settings": { padding: "8px", margin: "0", listStyle: "none", borderBottom: "1px solid" },
                                "cfme-settings-header": { fontWeight: "bold" },
                                "cfme-setting-item": { display: "flex", justifyContent: "space-between", gap: "0.5em" },
                                "cfme-setting-item input": { fontSize: "80%", width: "3.5em" },
                                "cfme-setting-item input[type=checkbox]": { width: "auto" },
                                "cfme-categories": { padding: "8px", margin: "0", listStyle: "none" },
                                "cfme-categories-header": { fontWeight: "bold" },
                                "cfme-category-item": { display: "flex", cursor: "pointer" },
                                "cfme-editor-main": { flexGrow: "1", padding: "8px" },
                                "cfme-placeable-group-collapsible[open] > summary": { marginBottom: "0.25em" },
                                "cfme-placeable-group": { display: "flex", flexWrap: "wrap", gap: "0.25em" },
                                "cfme-placeable-group-title": { fontSize: "80%" },
                                "cfme-placeable-item": {
                                    height: "50px",
                                    width: "50px",
                                    backgroundColor: "rgba(255, 255, 255, 0.25)",
                                    border: "1px solid gray",
                                },
                                "cfme-placeable-item.cfme-placeable-item-selected": { backgroundColor: "rgba(255, 255, 255, 0.1)", borderColor: "yellow" },
                                "cfme-placeable-item:hover": {borderColor: "gold" },
                            },
                        });
                        //#endregion

                        //#region hooks
                        /* open map editor on activation if can use */
                        {
                            // sep func for future, if yip needs to move this around because of the fked "Activate"
                            const triggerInitialEditorLoad = () => {
                                Log.info(`detected change to map view, attempting to open editor`);
                                if (!Editor.isOpen && Editor.canUse) {
                                    Editor.open()
                                };
                            }; 
                            // NB: TwT why must Activate be called per frame...... shouldn't there be a reliable event that fires once to hook in to....
                            ctx.addCleanup(SDK.hookFunction("ChatRoomActivateView", Constants.HOOK_PRIORITY.HIGH, ([newViewName, ...args], next) => {
                                // (no change in view                               ) OR (not changing to map ) then it's not map view activation
                                if (ChatRoomActiveView === ChatRoomViews[newViewName] || newViewName !== "Map") return next([newViewName, ...args]);
                                next([newViewName, ...args]);
                                triggerInitialEditorLoad();
                            }));

                        }

                        /* closes map editor on deactivate and restore potential abusive settings */
                        {
                            // sep func for future, if yip needs to move this around because of the fked "Activate"
                            const triggerEditorCleanup = () => {
                                Log.info(`detected map view deactivation, restoring settings and attempting to close editor`);
                                if (Editor.isOpen) Editor.close();
                                Editor.restoreSettings();
                            }
                            // NB: TwT why must Deactivate be called per frame... shouldn't there be a reliable event that fires once to hook in to...
                            ctx.addCleanup(SDK.hookFunction("ChatRoomActivateView", Constants.HOOK_PRIORITY.HIGH, ([newViewName, ...args], next) => {
                                // (no change in view                               ) OR (changing to map     ) then it's not map view deactivation
                                if (ChatRoomActiveView === ChatRoomViews[newViewName] || newViewName === "Map") return next([newViewName, ...args]);
                                triggerEditorCleanup();
                                next([newViewName, ...args]);
                            }));
                        }

                        /* hide default editor ui but keep drawing functionality */
                        ctx.addCleanup(SDK.hookFunction("ChatRoomViews.Map.DrawUi", Constants.HOOK_PRIORITY.HIGH, (args, next) => {
                            const originalEditMode = Accessors.EditMode;
                            Accessors.EditMode = "CFME";
                            next(args);
                            Accessors.EditMode = originalEditMode;

                            /* dirty patch: keep zoom buttons around */
                            DrawButton(10, 10, 60, 60, "", "White", "Icons/Small/Plus.png");
		                    DrawButton(10, 80, 60, 60, "", "White", "Icons/Small/Minus.png");
                        }));

                        /* disable default editor ui clicking */
                        ctx.addCleanup(SDK.hookFunction("ChatRoomViews.Map.Click", Constants.HOOK_PRIORITY.HIGH, (args, next) => {
                            const originalEditMode = Accessors.EditMode;
                            Accessors.EditMode = "CFME";
                            next(args);
                            Accessors.EditMode = originalEditMode;

                            /* dirty patch: keep zoom buttons clickable */
                            if (MouseIn(10, 10, 60, 60) && (ChatRoomMapViewPerceptionRange > ChatRoomMapViewPerceptionRangeMin)) { ChatRoomMapViewPerceptionRange--; return; }
		                    if (MouseIn(10, 80, 60, 60) && (ChatRoomMapViewPerceptionRange < ChatRoomMapViewPerceptionRangeMax)) { ChatRoomMapViewPerceptionRange++; return; }
                        }));
                        //#endregion
                    },
                    unload: () => {
                        if (Editor.isOpen) Editor.close();
                        Utils.DOM.CSS.unload(CSS_TITLE);
                    },
                    editor: {
                        open: Editor.open,
                        close: Editor.close,
                        get canUse() { return Editor.canUse },
                        get isOpen() { return Editor.isOpen },
                    },
                };
            })()),
            //#endregion
        };

        const SDK = sdkAPI.registerMod({
            name: Constants.MOD_NAME,
            fullName: Constants.MOD_FULL_NAME,
            version: Constants.MOD_VERSION,
            repository: Constants.MOD_REPOSITORY,
        });

        const managerAPI = {
            run: () => {
                Object.values(modules).forEach(m => m.run())
                Manager.MOD = {
                    manager: managerAPI,
                    log: Log,
                    sdk: SDK,
                };
                Utils.BC.sendHint(`${Constants.MOD_NAME} loaded!`);
                Log.info("loaded!");
            },
            unload: () => {
                Object.values(modules).forEach(m => m.unload());
                SDK.unload();
                delete window[Constants.MOD_ID];
                Utils.BC.sendHint(`${Constants.MOD_NAME} unloaded!`);
                Log.info("unloaded!");
            },
            get modules() { return modules },
            /** @returns {CFME} */
            get MOD() { return window[Constants.MOD_ID] },
            set MOD(obj) { window[Constants.MOD_ID] = obj },
        };

        return managerAPI;
    })();

    Manager.run();
    //#endregion
})();